import { timingSafeEqual } from "node:crypto";
import type { SignerConfig, PayoutAsset } from "./config.js";
import { SignerError, type SolanaChain } from "./solana.js";
import type { PostgresSignerStore, SignerPayload, SignerRecord } from "./store.js";
import type { TurnkeyTransactionSigner } from "./turnkey.js";

const KEY_PATTERN = /^[A-Za-z0-9:_-]{5,160}$/;
const UNIT_PATTERN = /^\d{1,78}$/;
const BODY_MAX_BYTES = 8_192;

type ServiceDeps = {
  config: SignerConfig;
  store: PostgresSignerStore;
  chain: SolanaChain;
  turnkey: TurnkeyTransactionSigner;
};

type Result = { status: "ok" | "processing" | "blocked" | "expired"; signature?: string; code?: string };

class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
    try {
      return await work();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }
}

export class TurnkeySignerService {
  private readonly processing = new Semaphore(2);
  private workerBusy = false;

  constructor(private readonly deps: ServiceDeps) {}

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/healthz" && request.method === "GET")
      return json({ ok: true });
    if (!this.authorized(request)) return json({ code: "UNAUTHORIZED" }, 401);

    const match = /^\/payouts\/([^/]+)$/.exec(url.pathname);
    if (!match) return json({ code: "NOT_FOUND" }, 404);
    const key = decodeURIComponent(match[1]);
    if (!KEY_PATTERN.test(key)) return json({ code: "INVALID_IDEMPOTENCY_KEY" }, 400);

    if (request.method === "GET") return this.getStatus(key);
    if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);

    let payload: SignerPayload;
    try {
      payload = await readPayload(request, key);
    } catch (error) {
      return json(
        { code: error instanceof SignerError ? error.code : "INVALID_REQUEST" },
        400,
      );
    }
    const asset = this.assetFor(payload);
    if (!asset) return json({ code: "ASSET_NOT_ALLOWLISTED" }, 422);
    const amount = BigInt(payload.amountUnits);
    if (amount > asset.maxPayoutUnits)
      return json({ code: "PAYOUT_LIMIT_EXCEEDED" }, 422);

    let record: SignerRecord;
    try {
      record = await this.deps.store.reserve(payload, asset);
    } catch (error) {
      if (error instanceof Error && error.message === "IDEMPOTENCY_PAYLOAD_MISMATCH")
        return json({ code: "IDEMPOTENCY_PAYLOAD_MISMATCH" }, 409);
      return json({ code: "SIGNER_STORAGE_UNAVAILABLE" }, 503);
    }
    if (record.status === "blocked")
      return json({ code: record.lastErrorCode || "PAYOUT_BLOCKED" }, 422);
    if (record.status === "expired")
      return json({ code: "BLOCKHASH_EXPIRED" }, 409);

    await this.processKey(key);
    record = (await this.deps.store.get(key)) ?? record;
    return this.resultResponse(record);
  }

  startRecoveryWorker(intervalMs = 5_000): NodeJS.Timeout {
    const timer = setInterval(() => void this.processPending(), intervalMs);
    timer.unref();
    void this.processPending();
    return timer;
  }

  private authorized(request: Request): boolean {
    const header = request.headers.get("authorization") ?? "";
    if (!header.startsWith("Bearer ")) return false;
    const supplied = Buffer.from(header.slice(7), "utf8");
    const expected = Buffer.from(this.deps.config.bearerToken, "utf8");
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  private assetFor(payload: SignerPayload): PayoutAsset | undefined {
    return this.deps.config.assets.find(
      (asset) =>
        asset.mint === payload.mint &&
        asset.treasuryWallet === payload.treasuryWallet,
    );
  }

  private async getStatus(key: string): Promise<Response> {
    try {
      const record = await this.deps.store.get(key);
      if (!record) return json({ code: "REQUEST_NOT_FOUND" }, 404);
      return this.resultResponse(record);
    } catch {
      return json({ code: "SIGNER_STORAGE_UNAVAILABLE" }, 503);
    }
  }

  private resultResponse(record: SignerRecord): Response {
    if (record.signature) return json({ signature: record.signature });
    if (record.status === "blocked" || record.status === "expired")
      return json({ status: record.status, code: record.lastErrorCode }, 409);
    return json({ status: "processing" }, 202);
  }

  private async processPending(): Promise<void> {
    if (this.workerBusy) return;
    this.workerBusy = true;
    try {
      const keys = await this.deps.store.dueKeys(10);
      for (const key of keys) await this.processKey(key);
    } catch {
      // Recovery is best-effort; durable requests remain available for the next pass.
    } finally {
      this.workerBusy = false;
    }
  }

  private async processKey(key: string): Promise<void> {
    await this.processing.run(() =>
      this.deps.store.withKeyLock(key, () => this.processLocked(key)),
    );
  }

  private async processLocked(key: string): Promise<void> {
    let record = await this.deps.store.get(key);
    if (
      !record ||
      record.status === "blocked" ||
      record.status === "expired" ||
      record.status === "included"
    )
      return;
    const asset = this.assetFor(record.payload);
    if (!asset) {
      await this.deps.store.markBlocked(key, "ASSET_NOT_ALLOWLISTED");
      return;
    }

    try {
      if (!record.unsignedTransaction) {
        const prepared = await this.deps.chain.prepareTransfer(record.payload, asset);
        await this.deps.store.savePrepared(
          key,
          prepared.unsignedTransaction,
          prepared.lastValidBlockHeight,
        );
        record = (await this.deps.store.get(key))!;
      }
      if (!record.unsignedTransaction || record.lastValidBlockHeight == null)
        throw new SignerError("PREPARED_TRANSACTION_MISSING", true);
      const lastValidBlockHeight = record.lastValidBlockHeight;

      if (!record.signature || !record.signedTransaction) {
        if ((await this.deps.chain.getBlockHeight()) > lastValidBlockHeight) {
          await this.deps.store.markExpired(key);
          return;
        }
        const signed = await this.deps.turnkey.signSolanaTransaction(
          record.payload.treasuryWallet,
          record.unsignedTransaction,
        );
        const signature = this.deps.chain.verifySignedTransaction(
          record.unsignedTransaction,
          signed,
          record.payload.treasuryWallet,
        );
        await this.deps.store.saveSigned(key, signed, signature);
        record = (await this.deps.store.get(key))!;
      }
      if (!record.signature || !record.signedTransaction)
        throw new SignerError("SIGNED_TRANSACTION_MISSING", true);

      const state = await this.deps.chain.signatureState(record.signature);
      if (state === "failed") {
        await this.deps.store.markBlocked(key, "CHAIN_TRANSACTION_FAILED");
        return;
      }
      if (state === "finalized") {
        await this.deps.store.markIncluded(key);
        return;
      }
      if (state === "confirmed") {
        await this.deps.store.markConfirmed(key);
        return;
      }
      if (state === "processed") {
        await this.deps.store.markBroadcastAttempt(key);
        return;
      }
      if ((await this.deps.chain.getBlockHeight()) > lastValidBlockHeight) {
        await this.deps.store.markExpired(key);
        return;
      }
      await this.deps.chain.broadcastSigned(record.signedTransaction, record.signature);
      await this.deps.store.markBroadcastAttempt(key);
    } catch (error) {
      if (error instanceof SignerError && error.permanent)
        await this.deps.store.markBlocked(key, error.code);
      else
        await this.deps.store.markRetry(
          key,
          error instanceof SignerError ? error.code : "UPSTREAM_UNAVAILABLE",
        );
    }
  }
}

async function readPayload(request: Request, key: string): Promise<SignerPayload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json"))
    throw new SignerError("JSON_REQUIRED", true);
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > BODY_MAX_BYTES)
    throw new SignerError("REQUEST_TOO_LARGE", true);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SignerError("INVALID_JSON", true);
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SignerError("INVALID_REQUEST", true);
  const row = value as Record<string, unknown>;
  if (
    row.idempotencyKey !== key ||
    typeof row.destination !== "string" ||
    typeof row.treasuryWallet !== "string" ||
    typeof row.mint !== "string" ||
    typeof row.amountUnits !== "string" ||
    !UNIT_PATTERN.test(row.amountUnits) ||
    BigInt(row.amountUnits) <= 0n ||
    row.network !== "solana-mainnet"
  )
    throw new SignerError("INVALID_PAYOUT_PAYLOAD", true);
  try {
    const { PublicKey } = await import("@solana/web3.js");
    for (const [label, address] of [
      ["destination", row.destination],
      ["treasuryWallet", row.treasuryWallet],
      ["mint", row.mint],
    ] as const) {
      const key = new PublicKey(address);
      if (key.toBase58() !== address) throw new Error(label);
    }
  } catch {
    throw new SignerError("INVALID_SOLANA_ADDRESS", true);
  }
  return {
    idempotencyKey: key,
    destination: row.destination,
    treasuryWallet: row.treasuryWallet,
    mint: row.mint,
    amountUnits: row.amountUnits,
    network: "solana-mainnet",
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
