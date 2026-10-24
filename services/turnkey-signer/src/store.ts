import { Pool, type PoolClient } from "pg";
import type { PayoutAsset } from "./config.js";

export type SignerPayload = {
  idempotencyKey: string;
  destination: string;
  treasuryWallet: string;
  mint: string;
  amountUnits: string;
  network: "solana-mainnet";
};

export type SignerRecord = {
  payload: SignerPayload;
  decimals: number;
  unsignedTransaction: string | null;
  signedTransaction: string | null;
  signature: string | null;
  lastValidBlockHeight: number | null;
  status: "accepted" | "prepared" | "signed" | "included" | "expired" | "blocked";
  attemptCount: number;
  lastErrorCode: string;
};

export class PostgresSignerStore {
  constructor(private readonly pool: Pool) {}

  async withKeyLock<T>(idempotencyKey: string, work: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const lockKey = `vuze-turnkey-payout:${idempotencyKey}`;
    try {
      await client.query("select pg_advisory_lock(hashtextextended($1, 0))", [lockKey]);
      return await work();
    } finally {
      try {
        await client.query("select pg_advisory_unlock(hashtextextended($1, 0))", [lockKey]);
      } finally {
        client.release();
      }
    }
  }

  async reserve(payload: SignerPayload, asset: PayoutAsset): Promise<SignerRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`vuze-turnkey-request:${payload.idempotencyKey}`],
      );
      const day = new Date().toISOString().slice(0, 10);
      const dailyKey = `vuze-turnkey-daily:${payload.treasuryWallet}:${payload.mint}:${day}`;
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [dailyKey]);

      const existing = await client.query(
        `select * from turnkey_payout_signer_requests where idempotency_key=$1 for update`,
        [payload.idempotencyKey],
      );
      if (existing.rows[0]) {
        const record = mapRecord(existing.rows[0]);
        if (!samePayload(record.payload, payload) || record.decimals !== asset.decimals)
          throw new Error("IDEMPOTENCY_PAYLOAD_MISMATCH");
        await client.query("commit");
        return record;
      }

      const total = await client.query(
        `select coalesce(sum(amount_units),0)::text as amount
         from turnkey_payout_signer_requests
         where treasury_wallet=$1 and token_mint=$2
           and status not in ('blocked','expired')
           and created_at >= ($3::date::timestamp at time zone 'UTC')
           and created_at < (($3::date + 1)::timestamp at time zone 'UTC')`,
        [payload.treasuryWallet, payload.mint, day],
      );
      const dailyTotal = BigInt(String(total.rows[0]?.amount ?? "0"));
      const amount = BigInt(payload.amountUnits);
      const blocked = dailyTotal + amount > asset.maxDailyPayoutUnits;
      const inserted = await client.query(
        `insert into turnkey_payout_signer_requests
           (idempotency_key,destination_wallet,treasury_wallet,token_mint,amount_units,
            token_decimals,network,status,last_error_code)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         returning *`,
        [
          payload.idempotencyKey,
          payload.destination,
          payload.treasuryWallet,
          payload.mint,
          payload.amountUnits,
          asset.decimals,
          payload.network,
          blocked ? "blocked" : "accepted",
          blocked ? "DAILY_LIMIT_EXCEEDED" : "",
        ],
      );
      await client.query("commit");
      return mapRecord(inserted.rows[0]);
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async get(idempotencyKey: string): Promise<SignerRecord | null> {
    const result = await this.pool.query(
      `select * from turnkey_payout_signer_requests where idempotency_key=$1 limit 1`,
      [idempotencyKey],
    );
    return result.rows[0] ? mapRecord(result.rows[0]) : null;
  }

  async savePrepared(
    idempotencyKey: string,
    unsignedTransaction: string,
    lastValidBlockHeight: number,
  ): Promise<void> {
    const result = await this.pool.query(
      `update turnkey_payout_signer_requests
       set unsigned_transaction=coalesce(unsigned_transaction,$2),
           last_valid_block_height=coalesce(last_valid_block_height,$3),
           status='prepared', updated_at=now(), next_attempt_at=now()
       where idempotency_key=$1 and status in ('accepted','prepared')
       returning unsigned_transaction,last_valid_block_height`,
      [idempotencyKey, unsignedTransaction, lastValidBlockHeight],
    );
    if (!result.rows[0]) throw new Error("REQUEST_NOT_PREPARABLE");
    if (
      result.rows[0].unsigned_transaction !== unsignedTransaction ||
      Number(result.rows[0].last_valid_block_height) !== lastValidBlockHeight
    )
      throw new Error("IMMUTABLE_TRANSACTION_MISMATCH");
  }

  async saveSigned(
    idempotencyKey: string,
    signedTransaction: string,
    signature: string,
  ): Promise<void> {
    const result = await this.pool.query(
      `update turnkey_payout_signer_requests
       set signed_transaction=coalesce(signed_transaction,$2),
           transaction_signature=coalesce(transaction_signature,$3),
           status='signed', updated_at=now(), next_attempt_at=now(), last_error_code=''
       where idempotency_key=$1 and status in ('prepared','signed')
       returning signed_transaction,transaction_signature`,
      [idempotencyKey, signedTransaction, signature],
    );
    if (!result.rows[0]) throw new Error("REQUEST_NOT_SIGNABLE");
    if (
      result.rows[0].signed_transaction !== signedTransaction ||
      result.rows[0].transaction_signature !== signature
    )
      throw new Error("IMMUTABLE_SIGNATURE_MISMATCH");
  }

  async markBroadcastAttempt(idempotencyKey: string): Promise<void> {
    await this.pool.query(
      `update turnkey_payout_signer_requests
       set last_broadcast_at=now(), next_attempt_at=now()+interval '15 seconds',
           updated_at=now(), last_error_code=''
       where idempotency_key=$1 and status='signed'`,
      [idempotencyKey],
    );
  }

  async markConfirmed(idempotencyKey: string): Promise<void> {
    await this.pool.query(
      `update turnkey_payout_signer_requests
       set next_attempt_at=now()+interval '15 seconds',updated_at=now(),last_error_code=''
       where idempotency_key=$1 and status='signed'`,
      [idempotencyKey],
    );
  }

  async markIncluded(idempotencyKey: string): Promise<void> {
    await this.pool.query(
      `update turnkey_payout_signer_requests
       set status='included',updated_at=now(),last_error_code=''
       where idempotency_key=$1 and status='signed'`,
      [idempotencyKey],
    );
  }

  async markRetry(idempotencyKey: string, errorCode: string): Promise<void> {
    await this.pool.query(
      `update turnkey_payout_signer_requests
       set attempt_count=attempt_count+1,
           status=case when attempt_count+1 >= 20 then 'blocked' else status end,
           last_error_code=case when attempt_count+1 >= 20 then 'RETRY_LIMIT' else $2 end,
           next_attempt_at=now()+interval '15 seconds', updated_at=now()
       where idempotency_key=$1 and status in ('accepted','prepared','signed')`,
      [idempotencyKey, safeErrorCode(errorCode)],
    );
  }

  async markBlocked(idempotencyKey: string, errorCode: string): Promise<void> {
    await this.pool.query(
      `update turnkey_payout_signer_requests
       set status='blocked',last_error_code=$2,updated_at=now()
       where idempotency_key=$1 and status in ('accepted','prepared','signed')`,
      [idempotencyKey, safeErrorCode(errorCode)],
    );
  }

  async markExpired(idempotencyKey: string): Promise<void> {
    await this.pool.query(
      `update turnkey_payout_signer_requests
       set status='expired',last_error_code='BLOCKHASH_EXPIRED',updated_at=now()
       where idempotency_key=$1 and status in ('accepted','prepared','signed')`,
      [idempotencyKey],
    );
  }

  async dueKeys(limit = 10): Promise<string[]> {
    const rows = await this.pool.query(
      `select idempotency_key from turnkey_payout_signer_requests
       where status in ('accepted','prepared','signed') and next_attempt_at <= now()
       order by created_at asc limit $1`,
      [Math.max(1, Math.min(50, Math.trunc(limit)))],
    );
    return rows.rows.map((row) => String(row.idempotency_key));
  }
}

function samePayload(left: SignerPayload, right: SignerPayload): boolean {
  return (
    left.idempotencyKey === right.idempotencyKey &&
    left.destination === right.destination &&
    left.treasuryWallet === right.treasuryWallet &&
    left.mint === right.mint &&
    left.amountUnits === right.amountUnits &&
    left.network === right.network
  );
}

function safeErrorCode(value: string): string {
  return /^[A-Z0-9_]{1,64}$/.test(value) ? value : "UPSTREAM_UNAVAILABLE";
}

function mapRecord(row: Record<string, unknown>): SignerRecord {
  return {
    payload: {
      idempotencyKey: String(row.idempotency_key),
      destination: String(row.destination_wallet),
      treasuryWallet: String(row.treasury_wallet),
      mint: String(row.token_mint),
      amountUnits: String(row.amount_units),
      network: "solana-mainnet",
    },
    decimals: Number(row.token_decimals),
    unsignedTransaction: row.unsigned_transaction
      ? String(row.unsigned_transaction)
      : null,
    signedTransaction: row.signed_transaction ? String(row.signed_transaction) : null,
    signature: row.transaction_signature ? String(row.transaction_signature) : null,
    lastValidBlockHeight:
      row.last_valid_block_height == null ? null : Number(row.last_valid_block_height),
    status: String(row.status) as SignerRecord["status"],
    attemptCount: Number(row.attempt_count ?? 0),
    lastErrorCode: String(row.last_error_code ?? ""),
  };
}

export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl, max: 5, idleTimeoutMillis: 30_000 });
}

export type SignerStore = PostgresSignerStore;
export type PgClient = PoolClient;
