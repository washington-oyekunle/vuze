import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  parseVideoUrl,
  parseViewCount,
  eligibility,
  verifyVideo,
} from "../src/lib/vuze/verification.server.ts";

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

test("normalizes YouTube aliases and tracking parameters to one identity", () => {
  const urls = [
    "https://youtu.be/abcdefghijk?si=tracking",
    "https://www.youtube.com/shorts/abcdefghijk?feature=share",
    "https://www.youtube.com/watch?v=abcdefghijk&t=42",
  ];
  const identities = urls.map((u) => parseVideoUrl(u, "youtube"));
  for (const value of identities)
    assert.deepEqual(value, {
      platform: "youtube",
      videoId: "abcdefghijk",
      canonicalUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    });
});
test("rejects SSRF, platform spoofing, credentials, non-HTTPS and redirects", () => {
  for (const url of [
    "http://youtu.be/abcdefghijk",
    "https://youtube.com.evil.test/watch?v=abcdefghijk",
    "https://user:pass@youtube.com/watch?v=abcdefghijk",
    "https://127.0.0.1/watch?v=abcdefghijk",
    "https://youtube.com:8080/watch?v=abcdefghijk",
  ])
    assert.throws(() => parseVideoUrl(url, "youtube"));
  assert.throws(() => parseVideoUrl("https://vm.tiktok.com/short/", "tiktok"));
  assert.throws(() =>
    parseVideoUrl("https://youtu.be/abcdefghijk", "instagram"),
  );
});
test("canonicalizes TikTok and Reel IDs while stripping tracking", () => {
  assert.equal(
    parseVideoUrl(
      "https://www.tiktok.com/@creator/video/1234567890123456789?utm_source=share",
      "tiktok",
    ).videoId,
    "1234567890123456789",
  );
  assert.equal(
    parseVideoUrl("https://instagram.com/reels/Abcd1234/?x=3", "instagram")
      .canonicalUrl,
    "https://www.instagram.com/reel/Abcd1234/",
  );
});
test("minimum is inclusive and invalid counts never become zero", () => {
  assert.equal(eligibility(999, 1000), "rejected");
  assert.equal(eligibility(1000, 1000), "under_review");
  for (const value of [
    null,
    undefined,
    "",
    "1e3",
    "-5",
    "NaN",
    -1,
    1.1,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.throws(() => parseViewCount(value));
  assert.equal(parseViewCount("1000"), 1000);
});
test("missing providers keep entries unavailable rather than rejecting with zero views", async () => {
  delete process.env.YOUTUBE_DATA_API_KEY;
  delete process.env.ANALYTICS_VERIFIER_URL;
  delete process.env.ANALYTICS_VERIFIER_TOKEN;
  const result = await verifyVideo(
    parseVideoUrl("https://youtu.be/abcdefghijk", "youtube"),
    (() => {
      throw new Error("must not fetch");
    }) as typeof fetch,
  );
  assert.equal(result.status, "unavailable");
});
test("YouTube uses official statistics for the exact video and handles quota errors", async () => {
  process.env.YOUTUBE_DATA_API_KEY = "test-only";
  const identity = parseVideoUrl("https://youtu.be/abcdefghijk", "youtube");
  const mock = async (input: unknown) => {
    assert.equal(new URL(String(input)).hostname, "www.googleapis.com");
    return Response.json({
      items: [{ id: identity.videoId, statistics: { viewCount: "1250" } }],
    });
  };
  const result = await verifyVideo(identity, mock as typeof fetch);
  assert.equal(result.status, "verified");
  if (result.status === "verified") assert.equal(result.metrics.views, 1250);
  assert.equal(
    (
      await verifyVideo(
        identity,
        (async () => new Response(null, { status: 403 })) as typeof fetch,
      )
    ).status,
    "unavailable",
  );
  assert.equal(
    (
      await verifyVideo(identity, (async () =>
        Response.json({
          items: [{ id: "wrong", statistics: { viewCount: "50000" } }],
        })) as typeof fetch)
    ).status,
    "unavailable",
  );
});
test("adapter rejects stale, mismatched and malformed view evidence", async () => {
  delete process.env.YOUTUBE_DATA_API_KEY;
  process.env.ANALYTICS_VERIFIER_URL = "https://verifier.example.test/verify";
  process.env.ANALYTICS_VERIFIER_TOKEN = "test-only";
  const identity = parseVideoUrl(
    "https://www.instagram.com/reel/Abcd1234/",
    "instagram",
  );
  const valid = {
    platform: "instagram",
    videoId: identity.videoId,
    views: 1200,
    source: "instagram-graph-api",
    observedAt: new Date().toISOString(),
  };
  for (const invalid of [
    { ...valid, platform: "youtube" },
    { ...valid, videoId: "different" },
    { ...valid, views: null },
    { ...valid, observedAt: new Date(0).toISOString() },
    { ...valid, source: "" },
  ]) {
    assert.equal(
      (
        await verifyVideo(identity, (async () =>
          Response.json(invalid)) as typeof fetch)
      ).status,
      "unavailable",
    );
  }
  assert.equal(
    (
      await verifyVideo(identity, (async () =>
        Response.json(valid)) as typeof fetch)
    ).status,
    "verified",
  );
});
