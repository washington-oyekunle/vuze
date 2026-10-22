import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../src/lib/db.ts";
import {
  createSubmission,
  retryVerification,
  reviewSubmission,
  completeVerification,
} from "../src/lib/vuze/submission-service.server.ts";

let pg: PGlite;
let sql: Sql;
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
function wrap(
  runner: { query: (text: string, values?: unknown[]) => Promise<any> },
  transactional = true,
): Sql {
  const run = async <T>(text: string, values: unknown[] = []) =>
    (await runner.query(text, values)).rows as T[];
  const fn = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    run(
      parts.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, ""),
      values,
    )) as Sql;
  fn.query = run;
  fn.transaction = transactional
    ? (work) => pg.transaction((tx) => work(wrap(tx, false)))
    : async () => {
        throw new Error("nested");
      };
  return fn;
}
before(async () => {
  pg = new PGlite({ parsers: { 20: Number } });
  await pg.waitReady;
  for (const name of (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await pg.exec(
      await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"),
    );
  sql = wrap(pg);
});
after(async () => {
  globalThis.fetch = originalFetch;
  process.env = originalEnv;
  await pg.close();
});
beforeEach(async () => {
  await pg.exec(
    "truncate direct_payout_requests, payout_items, payout_batches, payouts, submission_reviews, submissions, analytics_proof_uploads, profiles restart identity cascade",
  );
  await sql`insert into profiles (user_id,display_name,role) values ('creator','Creator','creator'),('other','Other','creator'),('admin','Admin','admin')`;
  await sql`update campaigns set status='live', deadline=now()+interval '1 day', max_submissions=null, min_views=1000 where id=1`;
  delete process.env.ANALYTICS_VERIFIER_URL;
  delete process.env.ANALYTICS_VERIFIER_TOKEN;
  process.env.YOUTUBE_DATA_API_KEY = "test-only";
  setViews(1000);
});
function setViews(views: number) {
  globalThis.fetch = (async (input) =>
    Response.json({
      items: [
        {
          id: new URL(String(input)).searchParams.get("id"),
          statistics: { viewCount: String(views) },
        },
      ],
    })) as typeof fetch;
}
async function proof(owner = "creator") {
  const id = crypto.randomUUID();
  await sql`insert into analytics_proof_uploads (id,user_id,pathname,content_type,size_bytes,status) values (${id},${owner},${"analytics/" + owner + "/" + id + "/proof.png"},'image/png',100,'ready')`;
  return id;
}
async function submit(id = "abcdefghijk", upload?: string) {
  upload ??= await proof();
  return createSubmission(sql, "creator", {
    campaignId: 1,
    postUrl: `https://youtu.be/${id}`,
    platform: "youtube",
    proofUploadId: upload,
  });
}

test("claims upfront proof and admits exactly 1000 server-verified views to review", async () => {
  const upload = await proof();
  const result = await submit("abcdefghijk", upload);
  assert.equal(result.status, "under_review");
  const [row] = await sql<any>`select * from submissions where id=${result.id}`;
  assert.equal(Number(row.views), 1000);
  assert.equal(row.verification_status, "verified");
  assert.equal(row.analytics_proof_url, "/api/analytics-proof?id=" + upload);
  assert.equal(Number(row.estimated_payout), 4);
  assert.equal(
    (
      await sql<any>`select status from analytics_proof_uploads where id=${upload}`
    )[0].status,
    "claimed",
  );
});
test("below-minimum views auto-reject without creating a payable estimate", async () => {
  setViews(999);
  const result = await submit();
  assert.equal(result.status, "rejected");
  assert.equal(
    Number(
      (
        await sql<any>`select estimated_payout from submissions where id=${result.id}`
      )[0].estimated_payout,
    ),
    0,
  );
  await assert.rejects(
    reviewSubmission(sql, "admin", { id: result.id, action: "approve" }),
    /not in the review queue/,
  );
});
test("API outage is unavailable rather than an automatic rejection", async () => {
  globalThis.fetch = (async () => {
    throw new Error("timeout");
  }) as typeof fetch;
  const result = await submit();
  assert.equal(result.status, "verification_failed");
  const [row] = await sql<any>`select * from submissions where id=${result.id}`;
  assert.equal(row.verification_status, "unavailable");
  await assert.rejects(
    reviewSubmission(sql, "admin", { id: result.id, action: "approve" }),
    /not in the review queue/,
  );
});
test("another creator cannot use a proof upload and failures leave no entry", async () => {
  const upload = await proof("other");
  await assert.rejects(submit("abcdefghijk", upload), /file must be yours/);
  assert.equal(
    (await sql<any>`select count(*)::int as n from submissions`)[0].n,
    0,
  );
  assert.equal(
    (
      await sql<any>`select status from analytics_proof_uploads where id=${upload}`
    )[0].status,
    "ready",
  );
});
test("same canonical request is idempotent and does not call API again", async () => {
  const upload = await proof();
  const first = await submit("abcdefghijk", upload);
  globalThis.fetch = (async () => {
    throw new Error("must not verify twice");
  }) as typeof fetch;
  const again = await createSubmission(sql, "creator", {
    campaignId: 1,
    postUrl: "https://youtube.com/shorts/abcdefghijk?feature=share",
    platform: "youtube",
    proofUploadId: upload,
  });
  assert.deepEqual(again, first);
  assert.equal(
    (await sql<any>`select count(*)::int as n from submissions`)[0].n,
    1,
  );
});
test("same video with different proof rejects, without consuming the new upload", async () => {
  await submit();
  const upload = await proof();
  await assert.rejects(submit("abcdefghijk", upload), /already been submitted/);
  assert.equal(
    (
      await sql<any>`select status from analytics_proof_uploads where id=${upload}`
    )[0].status,
    "ready",
  );
});
test("proof cannot be reused on a different video", async () => {
  const upload = await proof();
  await submit("abcdefghijk", upload);
  await assert.rejects(submit("lmnopqrstuv", upload), /cannot be reused/);
});
test("campaign deadline and suspended accounts fail before proof is consumed", async () => {
  const upload = await proof();
  await sql`update campaigns set deadline=now()-interval '1 minute' where id=1`;
  await assert.rejects(submit("abcdefghijk", upload), /deadline/);
  await sql`update campaigns set deadline=now()+interval '1 day' where id=1`;
  await sql`update profiles set suspended=true where user_id='creator'`;
  await assert.rejects(submit("abcdefghijk", upload), /cannot submit/);
});
test("admin review is compare-and-set and cannot move approved work backwards", async () => {
  const result = await submit();
  await reviewSubmission(sql, "admin", { id: result.id, action: "approve" });
  assert.equal(
    (
      await sql<any>`select status,payout_proof_status from submissions where id=${result.id}`
    )[0].payout_proof_status,
    "accepted",
  );
  await assert.rejects(
    reviewSubmission(sql, "admin", {
      id: result.id,
      action: "reject",
      reason: "late decision",
    }),
    /another admin already decided/,
  );
  assert.equal(
    (await sql<any>`select count(*)::int as n from submission_reviews`)[0].n,
    1,
  );
});
test("declines require a reason and proof revisions require a replacement upload", async () => {
  const result = await submit();
  await assert.rejects(
    reviewSubmission(sql, "admin", { id: result.id, action: "reject" }),
    /reason/,
  );
  await reviewSubmission(sql, "admin", {
    id: result.id,
    action: "needs_proof",
    reason: "Retention graph is unreadable",
  });
  await sql`update submissions set verification_started_at=now()-interval '1 minute' where id=${result.id}`;
  await assert.rejects(
    retryVerification(sql, "creator", result.id),
    /replacement proof/,
  );
  await retryVerification(sql, "creator", result.id, await proof());
  assert.equal(
    (await sql<any>`select status from submissions where id=${result.id}`)[0]
      .status,
    "under_review",
  );
});
test("only the owner can retry, and stale verification responses cannot overwrite newer work", async () => {
  delete process.env.YOUTUBE_DATA_API_KEY;
  const result = await submit();
  await assert.rejects(retryVerification(sql, "other", result.id), /not found/);
  await sql`update submissions set verification_started_at=now()-interval '1 minute' where id=${result.id}`;
  setViews(2000);
  process.env.YOUTUBE_DATA_API_KEY = "test-only";
  await retryVerification(sql, "creator", result.id);
  await completeVerification(sql, result.id, "stale-attempt", {
    status: "unavailable",
    reason: "old timeout",
  });
  assert.equal(
    (
      await sql<any>`select status,views from submissions where id=${result.id}`
    )[0].status,
    "under_review",
  );
});

test("Supabase browser roles cannot read or write private app tables", async () => {
  await pg.exec(
    "create role vuze_test_browser; grant usage on schema public to vuze_test_browser; grant select, insert on profiles to vuze_test_browser; set role vuze_test_browser",
  );
  try {
    assert.equal((await pg.query("select * from profiles")).rows.length, 0);
    await assert.rejects(
      pg.query("insert into profiles (user_id) values ('intruder')"),
      /row-level security/,
    );
  } finally {
    await pg.exec("reset role");
  }
  const protectedTables = await sql<{
    name: string;
  }>`select relname as name from pg_class where relnamespace='public'::regnamespace and relrowsecurity=true`;
  for (const name of [
    "user",
    "session",
    "account",
    "profiles",
    "submissions",
    "analytics_proof_uploads",
    "payouts",
    "direct_payout_requests",
  ])
    assert.ok(
      protectedTables.some((row) => row.name === name),
      `${name} needs RLS`,
    );
});
