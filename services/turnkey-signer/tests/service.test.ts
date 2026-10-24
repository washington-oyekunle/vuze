import assert from "node:assert/strict";
import { test } from "node:test";
import bs58 from "bs58";
import {
  Keypair,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { parsePayoutAssets, type PayoutAsset, type SignerConfig } from "../src/config.js";
import { SolanaChain } from "../src/solana.js";
import { TurnkeySignerService } from "../src/service.js";
import type { SignerPayload, SignerRecord } from "../src/store.js";

const treasury = Keypair.generate().publicKey.toBase58();
const recipient = Keypair.generate().publicKey.toBase58();
const mint = Keypair.generate().publicKey.toBase58();
const asset: PayoutAsset = {
  symbol: "USD1",
  mint,
  decimals: 6,
  treasuryWallet: treasury,
  maxPayoutUnits: 10n,
  maxDailyPayoutUnits: 100n,
};

class MemoryStore {
  readonly records = new Map<string, SignerRecord>();
  async withKeyLock<T>(_key: string, work: () => Promise<T>): Promise<T> {
    return work();
  }
  async reserve(payload: SignerPayload, selected: PayoutAsset): Promise<SignerRecord> {
    const existing = this.records.get(payload.idempotencyKey);
    if (existing) {
      if (
        JSON.stringify(existing.payload) !== JSON.stringify(payload) ||
        existing.decimals !== selected.decimals
      )
        throw new Error("IDEMPOTENCY_PAYLOAD_MISMATCH");
      return existing;
    }
    const record: SignerRecord = {
      payload,
      decimals: selected.decimals,
      unsignedTransaction: null,
      signedTransaction: null,
      signature: null,
      lastValidBlockHeight: null,
      status: "accepted",
      attemptCount: 0,
      lastErrorCode: "",
    };
    this.records.set(payload.idempotencyKey, record);
    return record;
  }
  async get(key: string) {
    return this.records.get(key) ?? null;
  }
  async savePrepared(key: string, unsignedTransaction: string, height: number) {
    const row = this.records.get(key)!;
    row.unsignedTransaction ??= unsignedTransaction;
    row.lastValidBlockHeight ??= height;
    row.status = "prepared";
    assert.equal(row.unsignedTransaction, unsignedTransaction);
  }
  async saveSigned(key: string, signedTransaction: string, signature: string) {
    const row = this.records.get(key)!;
    row.signedTransaction ??= signedTransaction;
    row.signature ??= signature;
    row.status = "signed";
    assert.equal(row.signedTransaction, signedTransaction);
    assert.equal(row.signature, signature);
  }
  async markBroadcastAttempt(_key: string) {}
  async markConfirmed(_key: string) {}
  async markIncluded(key: string) {
    this.records.get(key)!.status = "included";
  }
  async markRetry(key: string, code: string) {
    this.records.get(key)!.attemptCount++;
    this.records.get(key)!.lastErrorCode = code;
  }
  async markBlocked(key: string, code: string) {
    this.records.get(key)!.status = "blocked";
    this.records.get(key)!.lastErrorCode = code;
  }
  async markExpired(key: string) {
    this.records.get(key)!.status = "expired";
    this.records.get(key)!.lastErrorCode = "BLOCKHASH_EXPIRED";
  }
  async dueKeys() {
    return [...this.records.keys()];
  }
}

function fixture() {
  const store = new MemoryStore();
  const stats = {
    turn: 0,
    broadcasts: 0,
    state: "not_found" as "not_found" | "processed" | "confirmed" | "finalized",
  };
  const chain = {
    prepareTransfer: async () => ({ unsignedTransaction: "aa", lastValidBlockHeight: 20 }),
    verifySignedTransaction: () => "signature-1",
    getBlockHeight: async () => 1,
    signatureState: async () => stats.state,
    broadcastSigned: async (bytes: string, signature: string) => {
      assert.equal(bytes, "bb");
      assert.equal(signature, "signature-1");
      stats.broadcasts++;
      stats.state = "processed";
    },
  };
  const turnkey = {
    signSolanaTransaction: async () => {
      stats.turn++;
      return "bb";
    },
  };
  const config = {
    host: "127.0.0.1",
    port: 8787,
    databaseUrl: "postgres://test:test@localhost/test",
    rpcUrl: "https://rpc.example",
    organizationId: "org-test",
    apiPublicKey: "public-test",
    apiPrivateKey: "private-test",
    apiBaseUrl: "https://api.turnkey.com",
    bearerToken: "t".repeat(40),
    assets: [asset],
  } satisfies SignerConfig;
  const service = new TurnkeySignerService({
    config,
    store: store as never,
    chain: chain as never,
    turnkey: turnkey as never,
  });
  return { service, store, stats, config };
}

function post(
  service: TurnkeySignerService,
  body: Record<string, unknown>,
  token = "t".repeat(40),
) {
  return service.handle(
    new Request("https://signer.test/payouts/vuze:deployment:submission:1", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}

const payload = {
  idempotencyKey: "vuze:deployment:submission:1",
  destination: recipient,
  treasuryWallet: treasury,
  mint,
  amountUnits: "5",
  network: "solana-mainnet",
};

test("rejects unauthenticated requests before reserving or signing", async () => {
  const { service, store, stats } = fixture();
  const response = await post(service, payload, "wrong-token");
  assert.equal(response.status, 401);
  assert.equal(store.records.size, 0);
  assert.equal(stats.turn, 0);
});

test("signs once, stores the signature and retries only the same signed transaction", async () => {
  const { service, store, stats } = fixture();
  const first = await post(service, payload);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { signature: "signature-1" });
  const second = await post(service, payload);
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), { signature: "signature-1" });
  assert.equal(stats.turn, 1);
  assert.equal(stats.broadcasts, 1);
  assert.equal(store.records.get(payload.idempotencyKey)?.signedTransaction, "bb");
});

test("keeps confirmed signatures in the recovery queue until finalization without rebroadcasting", async () => {
  const { service, store, stats } = fixture();
  stats.state = "confirmed";
  const first = await post(service, payload);
  assert.equal(first.status, 200);
  assert.equal(store.records.get(payload.idempotencyKey)?.status, "signed");
  assert.equal(stats.broadcasts, 0);

  stats.state = "finalized";
  const second = await post(service, payload);
  assert.equal(second.status, 200);
  assert.equal(store.records.get(payload.idempotencyKey)?.status, "included");
  assert.equal(stats.turn, 1);
  assert.equal(stats.broadcasts, 0);
});

test("rejects changed payloads under an existing idempotency key", async () => {
  const { service } = fixture();
  assert.equal((await post(service, payload)).status, 200);
  const response = await post(service, { ...payload, amountUnits: "6" });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: "IDEMPOTENCY_PAYLOAD_MISMATCH" });
});

test("enforces the per-transfer cap before creating a durable request", async () => {
  const { service, store, stats } = fixture();
  const response = await post(service, { ...payload, amountUnits: "11" });
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { code: "PAYOUT_LIMIT_EXCEEDED" });
  assert.equal(store.records.size, 0);
  assert.equal(stats.turn, 0);
});

test("requires daily caps at least as large as the per-transfer limit", () => {
  assert.throws(
    () =>
      parsePayoutAssets(
        JSON.stringify([
          {
            symbol: "USD1",
            mint,
            decimals: 6,
            treasuryWallet: treasury,
            maxPayoutUnits: "100",
            maxDailyPayoutUnits: "99",
          },
        ]),
      ),
    /cannot be below/,
  );
});

test("accepts only a Turnkey signature for the exact original transaction message", () => {
  const owner = Keypair.generate();
  const destination = Keypair.generate().publicKey;
  const recentBlockhash = SystemProgram.programId.toBase58();
  const transaction = new Transaction({
    feePayer: owner.publicKey,
    recentBlockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: owner.publicKey,
      toPubkey: destination,
      lamports: 1,
    }),
  );
  const unsignedHex = transaction
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("hex");
  const signed = Transaction.from(Buffer.from(unsignedHex, "hex"));
  signed.sign(owner);
  const signedHex = signed.serialize().toString("hex");
  const chain = new SolanaChain("https://rpc.example");
  assert.equal(
    chain.verifySignedTransaction(unsignedHex, signedHex, owner.publicKey.toBase58()),
    bs58.encode(signed.signature!),
  );

  const altered = new Transaction({
    feePayer: owner.publicKey,
    recentBlockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: owner.publicKey,
      toPubkey: destination,
      lamports: 2,
    }),
  );
  altered.sign(owner);
  assert.throws(
    () =>
      chain.verifySignedTransaction(
        unsignedHex,
        altered.serialize().toString("hex"),
        owner.publicKey.toBase58(),
      ),
    /SIGNED_MESSAGE_CHANGED/,
  );
});
