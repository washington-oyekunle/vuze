import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../src/lib/db.ts";
import {
  createSubmission,
  retryVerification,
} from "../src/lib/vuze/submission-service.server.ts";
import { reviewPayoutWallet } from "../src/lib/vuze/payout-wallet-review.server.ts";

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
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await pg.exec(
      await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"),
    );
  }
  sql = wrap(pg);
});

after(async () => {
  globalThis.fetch = originalFetch;
  process.env = originalEnv;
  await pg.close();
});

beforeEach(async () => {
  await pg.exec(
    "truncate payout_wallet_reviews, direct_payout_requests, payout_items, payout_batches, payouts, submission_reviews, submissions, analytics_proof_uploads, profiles restart identity cascade",
  );
  await sql`insert into profiles (user_id,display_name,role) values ('creator','Creator','creator'),('admin','Admin','admin')`;
  await sql`update campaigns set status='live', deadline=now()+interval '1 day', max_submissions=null, min_views=1000 where id in (1,2)`;
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

async function proof() {
  const id = crypto.randomUUID();
  await sql`insert into analytics_proof_uploads (id,user_id,pathname,content_type,size_bytes,status) values (${id},'creator',${`analytics/creator/${id}/proof.png`},'image/png',100,'ready')`;
  return id;
}

async function submit(campaignId = 1, videoId = "abcdefghijk", proofUploadId?: string) {
  proofUploadId ??= await proof();
  return createSubmission(sql, "creator", {
    campaignId,
    postUrl: `https://youtu.be/${videoId}`,
    platform: "youtube",
    payoutWalletAddress: "11111111111111111111111111111112",
    proofUploadId,
  });
}

test("wallet decisions apply only to the displayed pending address and are audited", async () => {
  const reviewedAddress = "WalletAddress1111111111111111111111111111111";
  const replacementAddress = "ReplacementWallet111111111111111111111111111";
  await sql`update profiles set payout_wallet_address=${reviewedAddress}, payout_wallet_status='pending' where user_id='creator'`;
  // The creator changes the wallet after the admin list was loaded.
  await sql`update profiles set payout_wallet_address=${replacementAddress}, payout_wallet_status='pending' where user_id='creator'`;

  await assert.rejects(
    reviewPayoutWallet(
      sql,
      "admin",
      "creator",
      reviewedAddress,
      "verify",
    ),
    /address changed or is no longer pending/,
  );
  assert.equal(
    (
      await sql<any>`select payout_wallet_status from profiles where user_id='creator'`
    )[0].payout_wallet_status,
    "pending",
  );
  assert.equal(
    (await sql<any>`select count(*)::int as n from payout_wallet_reviews`)[0].n,
    0,
  );

  await reviewPayoutWallet(
    sql,
    "admin",
    "creator",
    replacementAddress,
    "verify",
  );
  const [profile] = await sql<any>`select payout_wallet_status from profiles where user_id='creator'`;
  const [review] = await sql<any>`select reviewer_id, wallet_address, action from payout_wallet_reviews`;
  assert.equal(profile.payout_wallet_status, "verified");
  assert.equal(review.reviewer_id, "admin");
  assert.equal(review.wallet_address, replacementAddress);
  assert.equal(review.action, "verify");
  const [table] = await sql<any>`select relrowsecurity from pg_class where relname='payout_wallet_reviews'`;
  assert.equal(table.relrowsecurity, true);
});

test("same video and proof cannot masquerade as idempotent success in another campaign", async () => {
  const upload = await proof();
  const first = await submit(1, "abcdefghijk", upload);
  await assert.rejects(
    createSubmission(sql, "creator", {
      campaignId: 2,
      postUrl: "https://youtube.com/shorts/abcdefghijk?feature=share",
      platform: "youtube",
      payoutWalletAddress: "11111111111111111111111111111112",
      proofUploadId: upload,
    }),
    /already been submitted/,
  );
  assert.equal(
    (await sql<any>`select count(*)::int as n from submissions`)[0].n,
    1,
  );
  assert.equal(
    (await sql<any>`select campaign_id from submissions where id=${first.id}`)[0]
      .campaign_id,
    1,
  );
});

test("under-threshold entries show the requested message and can be checked again after views grow", async () => {
  setViews(999);
  const first = await submit();
  assert.equal(first.status, "rejected");
  assert.equal(
    first.verificationReason,
    "Minimum threshold not reached yet. Retry after the post reaches the minimum.",
  );
  const [below] = await sql<any>`select estimated_payout, verification_reason from submissions where id=${first.id}`;
  assert.equal(Number(below.estimated_payout), 0);
  assert.equal(
    below.verification_reason,
    "Minimum threshold not reached yet. Retry after the post reaches the minimum.",
  );

  await sql`update submissions set verification_started_at=now()-interval '1 minute' where id=${first.id}`;
  setViews(1000);
  const retry = await retryVerification(sql, "creator", first.id);
  assert.equal(retry.status, "under_review");
  assert.equal(retry.verificationStatus, "verified");
  assert.equal(retry.views, 1000);
  assert.equal(retry.minViews, 1000);
  assert.equal("ok" in retry, false);
  assert.equal((await sql<any>`select count(*)::int as n from submissions`)[0].n, 1);
});

test("verification retries return the actual unavailable state and provider reason", async () => {
  globalThis.fetch = (async () => {
    throw new Error("provider timeout");
  }) as typeof fetch;
  const initial = await submit();
  assert.equal(initial.status, "verification_failed");
  await sql`update submissions set verification_started_at=now()-interval '1 minute' where id=${initial.id}`;

  const retry = await retryVerification(sql, "creator", initial.id);
  const [stored] = await sql<any>`select status, verification_status, verification_reason from submissions where id=${initial.id}`;
  assert.equal(retry.status, stored.status);
  assert.equal(retry.verificationStatus, stored.verification_status);
  assert.equal(retry.verificationReason, stored.verification_reason);
  assert.equal(retry.status, "verification_failed");
  assert.equal(retry.verificationStatus, "unavailable");
  assert.ok(retry.verificationReason.length > 0);
  assert.equal("ok" in retry, false);
});
