import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  getPayoutReadiness,
  paySubmission,
  USD1_MINT,
} from "../src/lib/vuze/payout-service.server.ts";

const TREASURY = "11111111111111111111111111111111";
const RECIPIENT = "11111111111111111111111111111112";
const SOURCE = "11111111111111111111111111111113";
const DESTINATION = "11111111111111111111111111111114";
const SIGNATURE = "1".repeat(64);
const oldEnv = { ...process.env };
function configure() {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test",
    USD1_PAYOUTS_ENABLED: "true",
    USD1_SIGNER_URL: "https://signer.test",
    USD1_SIGNER_TOKEN: "test",
    USD1_PAYOUT_NAMESPACE: "test-deployment",
    SOLANA_RPC_URL: "https://rpc.test",
    USD1_TREASURY_WALLET: TREASURY,
  });
}
function resetEnv() {
  process.env = { ...oldEnv };
}
async function database() {
  const pg = new PGlite();
  await pg.waitReady;
  const names = [
    "auth",
    "vuze",
    "applications",
    "submission_reviews",
    "payout_rules",
    "payout_proof_review",
    "usd1_payouts",
    "streamlined_submissions",
    "direct_payouts",
  ];
  for (let i = 0; i < names.length; i++)
    await pg.exec(
      await readFile(
        `migrations/${String(i + 1).padStart(4, "0")}_${names[i]}.sql`,
        "utf8",
      ),
    );
  await pg.query(
    "insert into profiles(user_id,payout_wallet_address,payout_wallet_status) values ('creator',$1,'verified')",
    [RECIPIENT],
  );
  await pg.query(
    "insert into submissions(campaign_id,user_id,post_url,status,estimated_payout,payout_proof_status,verification_status,views,min_views,analytics_proof_url,flagged) values (1,'creator','https://x','approved',1.000000,'accepted','verified',1000,1000,'proof',false)",
  );
  const sql: any = {
    query: async (text: string, params?: unknown[]) =>
      (await pg.query(text, params)).rows,
    transaction: async (work: any) =>
      pg.transaction(async (tx: any) =>
        work({
          query: async (text: string, params?: unknown[]) =>
            (await tx.query(text, params)).rows,
        }),
      ),
  };
  return { pg, sql };
}
function rpcTx() {
  return {
    meta: {
      err: null,
      preTokenBalances: [
        {
          accountIndex: 1,
          owner: TREASURY,
          mint: USD1_MINT,
          uiTokenAmount: { amount: "1000000", decimals: 6 },
        },
        {
          accountIndex: 2,
          owner: RECIPIENT,
          mint: USD1_MINT,
          uiTokenAmount: { amount: "0", decimals: 6 },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 1,
          owner: TREASURY,
          mint: USD1_MINT,
          uiTokenAmount: { amount: "0", decimals: 6 },
        },
        {
          accountIndex: 2,
          owner: RECIPIENT,
          mint: USD1_MINT,
          uiTokenAmount: { amount: "1000000", decimals: 6 },
        },
      ],
    },
    transaction: {
      signatures: [SIGNATURE],
      message: {
        accountKeys: [
          { pubkey: TREASURY, signer: true },
          { pubkey: SOURCE },
          { pubkey: DESTINATION },
        ],
        instructions: [
          {
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            parsed: {
              type: "transfer",
              info: {
                source: SOURCE,
                destination: DESTINATION,
                authority: TREASURY,
                amount: "1000000",
              },
            },
          },
        ],
      },
    },
  };
}

test("payout readiness fails closed without durable configuration", () => {
  resetEnv();
  process.env.USD1_PAYOUTS_ENABLED = "true";
  delete process.env.DATABASE_URL;
  assert.equal(getPayoutReadiness().enabled, false);
  assert.match(getPayoutReadiness().reason, /DATABASE_URL/);
});

test("claims once, POSTs once, and closes from finalized transfer", async () => {
  configure();
  const { pg, sql } = await database();
  let posts = 0;
  let gets = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://signer.test")) {
      if (init?.method === "POST") {
        posts++;
        return new Response(JSON.stringify({ signature: SIGNATURE }), {
          status: 200,
        });
      }
      gets++;
      return new Response("{}", { status: 200 });
    }
    const body = JSON.parse(String(init?.body));
    const result =
      body.method === "getGenesisHash"
        ? "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
        : rpcTx();
    return new Response(JSON.stringify({ result }), { status: 200 });
  }) as typeof fetch;
  try {
    const first = await paySubmission(sql, 1, "admin");
    assert.equal(first.status, "paid");
    assert.equal(posts, 1);
    const second = await paySubmission(sql, 1, "admin");
    assert.equal(second.status, "paid");
    assert.equal(posts, 1);
    assert.equal(gets, 1);
    assert.equal(
      (
        await sql.query(
          "select status from direct_payout_requests where submission_id=1",
        )
      )[0].status,
      "confirmed",
    );
  } finally {
    globalThis.fetch = originalFetch;
    resetEnv();
    await pg.close();
  }
});

test("mismatched or failed chain evidence never closes an entry", async (t) => {
  const scenarios: Array<[string, (tx: any) => void]> = [
    [
      "wrong mint",
      (tx) => {
        for (const b of [
          ...tx.meta.preTokenBalances,
          ...tx.meta.postTokenBalances,
        ])
          b.mint = "wrong-mint";
      },
    ],
    [
      "wrong recipient",
      (tx) => {
        for (const b of [
          ...tx.meta.preTokenBalances,
          ...tx.meta.postTokenBalances,
        ])
          if (b.owner === RECIPIENT) b.owner = SOURCE;
      },
    ],
    [
      "wrong amount",
      (tx) => {
        tx.meta.postTokenBalances[1].uiTokenAmount.amount = "999999";
      },
    ],
    [
      "transaction failure",
      (tx) => {
        tx.meta.err = { InstructionError: [0, "failed"] };
      },
    ],
    [
      "treasury not a signer",
      (tx) => {
        tx.transaction.message.accountKeys[0].signer = false;
      },
    ],
    [
      "wrong transfer authority",
      (tx) => {
        tx.transaction.message.instructions[0].parsed.info.authority =
          RECIPIENT;
      },
    ],
    [
      "wrong signature binding",
      (tx) => {
        tx.transaction.signatures = ["other"];
      },
    ],
    [
      "wrong token decimals",
      (tx) => {
        tx.meta.postTokenBalances[1].uiTokenAmount.decimals = 9;
      },
    ],
  ];
  for (const [name, mutate] of scenarios)
    await t.test(name, async () => {
      configure();
      const { pg, sql } = await database();
      let posts = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (input, init) => {
        if (String(input).startsWith("https://signer.test")) {
          if (init?.method === "POST") {
            posts++;
            assert.equal(JSON.parse(String(init.body)).amountUnits, "1000000");
            return Response.json({ signature: SIGNATURE });
          }
          return Response.json({});
        }
        const body = JSON.parse(String(init?.body));
        const tx = rpcTx();
        mutate(tx);
        return Response.json({
          result:
            body.method === "getGenesisHash"
              ? "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
              : tx,
        });
      }) as typeof fetch;
      try {
        assert.equal(
          (await paySubmission(sql, 1, "admin")).status,
          "processing",
        );
        assert.equal(
          (await paySubmission(sql, 1, "admin")).status,
          "processing",
        );
        assert.equal(posts, 1);
        assert.equal(
          (await sql.query("select count(*)::int as n from payouts"))[0].n,
          0,
        );
        assert.equal(
          (await sql.query("select status from submissions where id=1"))[0]
            .status,
          "payment_processing",
        );
      } finally {
        globalThis.fetch = originalFetch;
        resetEnv();
        await pg.close();
      }
    });
});

test("an ambiguous signer timeout is reconciled without another POST", async () => {
  configure();
  const { pg, sql } = await database();
  let posts = 0;
  let gets = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    if (init?.method === "POST") {
      posts++;
      throw new Error("response lost after broadcast");
    }
    gets++;
    return Response.json({});
  }) as typeof fetch;
  try {
    assert.equal((await paySubmission(sql, 1, "admin")).status, "processing");
    assert.equal((await paySubmission(sql, 1, "admin")).status, "processing");
    assert.equal(posts, 1);
    assert.equal(gets, 2);
    assert.equal(
      (await sql.query("select count(*)::int as n from payouts"))[0].n,
      0,
    );
    assert.equal(
      (
        await sql.query("select count(*)::int as n from direct_payout_requests")
      )[0].n,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
    resetEnv();
    await pg.close();
  }
});

test("signatures in unsuccessful signer responses are never trusted", async () => {
  configure();
  const { pg, sql } = await database();
  let posts = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    assert.match(String(input), /^https:\/\/signer\.test/);
    if (init?.method === "POST") posts++;
    return Response.json({ signature: SIGNATURE }, { status: 503 });
  }) as typeof fetch;
  try {
    assert.equal((await paySubmission(sql, 1, "admin")).status, "processing");
    assert.equal((await paySubmission(sql, 1, "admin")).status, "processing");
    assert.equal(posts, 1);
    assert.equal(
      (
        await sql.query(
          "select transaction_signature from direct_payout_requests",
        )
      )[0].transaction_signature,
      null,
    );
  } finally {
    globalThis.fetch = originalFetch;
    resetEnv();
    await pg.close();
  }
});

test("unfinalized transfers remain open and later reconcile the immutable wallet snapshot", async () => {
  configure();
  const { pg, sql } = await database();
  let finalized = false;
  let posts = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    if (String(input).startsWith("https://signer.test")) {
      if (init?.method === "POST") {
        posts++;
        return Response.json({ signature: SIGNATURE });
      }
      return Response.json({});
    }
    const body = JSON.parse(String(init?.body));
    return Response.json({
      result:
        body.method === "getGenesisHash"
          ? "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
          : finalized
            ? rpcTx()
            : null,
    });
  }) as typeof fetch;
  try {
    assert.equal((await paySubmission(sql, 1, "admin")).status, "processing");
    await sql.query(
      "update profiles set payout_wallet_address=$1, payout_wallet_status='pending' where user_id='creator'",
      [DESTINATION],
    );
    process.env.USD1_TREASURY_WALLET = SOURCE;
    finalized = true;
    assert.equal((await paySubmission(sql, 1, "admin")).status, "paid");
    assert.equal(posts, 1);
    assert.equal(
      (await sql.query("select reference from payouts"))[0].reference,
      SIGNATURE,
    );
    assert.equal(
      (await sql.query("select creator_wallet from direct_payout_requests"))[0]
        .creator_wallet,
      RECIPIENT,
    );
  } finally {
    globalThis.fetch = originalFetch;
    resetEnv();
    await pg.close();
  }
});
