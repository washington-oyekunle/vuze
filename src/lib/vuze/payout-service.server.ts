import type { Sql } from "../db";

export const USD1_MINT = "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB";
export const USD1_DECIMALS = 6;
export const USD1_NETWORK = "solana-mainnet";
const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const TIMEOUT_MS = 15_000;

type PayoutResult = { status: "processing" | "paid"; message?: string };
type RequestRow = {
  id: number | string;
  submission_id: number | string;
  idempotency_key: string;
  creator_wallet: string;
  amount_units: string;
  token_mint: string;
  network: string;
  treasury_wallet: string;
  transaction_signature: string | null;
  status: string;
};

function env(name: string): string | undefined {
  const value = typeof process !== "undefined" ? process.env[name] : undefined;
  return value?.trim() || undefined;
}
function isHttps(url: string | undefined): boolean {
  try {
    if (!url) return false;
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}
function base58Bytes(value: string): Uint8Array | null {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  if (!value || /[^1-9A-HJ-NP-Za-km-z]/.test(value)) return null;
  let digits: number[] = [];
  for (const ch of value) {
    let carry = alphabet.indexOf(ch);
    if (carry < 0) return null;
    for (let i = 0; i < digits.length; i++) {
      const n = digits[i] * 58 + carry;
      digits[i] = n & 255;
      carry = n >> 8;
    }
    while (carry) {
      digits.push(carry & 255);
      carry >>= 8;
    }
  }
  for (const ch of value)
    if (ch === "1") digits.push(0);
    else break;
  return Uint8Array.from(digits.reverse());
}
function validWallet(value: string): boolean {
  const bytes = base58Bytes(value);
  return !!bytes && bytes.length === 32;
}
function validSignature(value: unknown): value is string {
  const bytes = typeof value === "string" ? base58Bytes(value) : null;
  return !!bytes && bytes.length === 64;
}

export function getPayoutReadiness(): { enabled: boolean; reason: string } {
  if (env("USD1_PAYOUTS_ENABLED") !== "true")
    return {
      enabled: false,
      reason: "USD1 payouts are disabled (USD1_PAYOUTS_ENABLED must be true).",
    };
  if (!env("DATABASE_URL"))
    return {
      enabled: false,
      reason:
        "USD1 payouts require a durable DATABASE_URL; local fallback databases are not eligible.",
    };
  if (!isHttps(env("USD1_SIGNER_URL")))
    return { enabled: false, reason: "USD1_SIGNER_URL must be an HTTPS URL." };
  if (
    !env("USD1_PAYOUT_NAMESPACE") ||
    !/^[a-zA-Z0-9_-]{3,80}$/.test(env("USD1_PAYOUT_NAMESPACE")!)
  )
    return {
      enabled: false,
      reason:
        "USD1_PAYOUT_NAMESPACE must identify this deployment uniquely (3–80 letters, digits, underscores or dashes).",
    };
  if (!env("USD1_SIGNER_TOKEN"))
    return { enabled: false, reason: "USD1_SIGNER_TOKEN is not configured." };
  if (!isHttps(env("SOLANA_RPC_URL")))
    return { enabled: false, reason: "SOLANA_RPC_URL must be an HTTPS URL." };
  if (!validWallet(env("USD1_TREASURY_WALLET") ?? ""))
    return {
      enabled: false,
      reason: "USD1_TREASURY_WALLET is not a valid Solana public key.",
    };
  return { enabled: true, reason: "USD1 direct payouts are configured." };
}

async function requestJson(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: any }> {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.protocol !== "https:")
      return { ok: false, status: 0, body: null };
  } catch {
    return { ok: false, status: 0, body: null };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: controller.signal,
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON */
    }
    return { ok: response.ok, status: response.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}
async function signerRequest(
  method: "GET" | "POST",
  key: string,
  payload?: object,
) {
  const base = env("USD1_SIGNER_URL")!.replace(/\/+$/, "");
  const token = env("USD1_SIGNER_TOKEN")!;
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    accept: "application/json",
  };
  if (payload) headers["content-type"] = "application/json";
  return requestJson(`${base}/payouts/${encodeURIComponent(key)}`, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  });
}
async function rpc(method: string, params: unknown[]): Promise<any> {
  const result = await requestJson(env("SOLANA_RPC_URL")!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return result.ok && !result.body?.error ? result.body?.result : null;
}
function decimal(value: unknown): bigint | null {
  try {
    const s = String(value);
    if (!/^\d+$/.test(s)) return null;
    return BigInt(s);
  } catch {
    return null;
  }
}
function keyValue(k: any): string {
  return typeof k === "string" ? k : (k?.pubkey ?? "");
}
function tokenDeltas(
  tx: any,
  treasury: string,
  recipient: string,
  mint: string,
): { treasury: bigint; recipient: bigint } | null {
  const pre = new Map<string, bigint>();
  const post = new Map<string, bigint>();
  for (const b of tx?.meta?.preTokenBalances ?? [])
    if (b.mint === mint && b.owner)
      pre.set(
        `${b.owner}:${b.accountIndex}`,
        BigInt(b.uiTokenAmount?.amount ?? "0"),
      );
  for (const b of tx?.meta?.postTokenBalances ?? [])
    if (b.mint === mint && b.owner)
      post.set(
        `${b.owner}:${b.accountIndex}`,
        BigInt(b.uiTokenAmount?.amount ?? "0"),
      );
  let treasuryDelta = 0n;
  let recipientDelta = 0n;
  for (const key of new Set([...pre.keys(), ...post.keys()])) {
    const delta = (post.get(key) ?? 0n) - (pre.get(key) ?? 0n);
    if (key.startsWith(`${treasury}:`)) treasuryDelta += delta;
    if (key.startsWith(`${recipient}:`)) recipientDelta += delta;
  }
  return { treasury: treasuryDelta, recipient: recipientDelta };
}
async function verifyFinalized(
  signature: string,
  recipient: string,
  amountUnits: string,
  treasury: string,
): Promise<boolean> {
  const expected = decimal(amountUnits);
  if (
    expected === null ||
    !validSignature(signature) ||
    !validWallet(treasury) ||
    !validWallet(recipient)
  )
    return false;
  if ((await rpc("getGenesisHash", [])) !== MAINNET_GENESIS) return false;
  const tx = await rpc("getTransaction", [
    signature,
    {
      encoding: "jsonParsed",
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    },
  ]);
  if (!tx || tx.meta?.err !== null) return false;
  const keys = tx.transaction?.message?.accountKeys ?? [];
  const treasuryKey = keys.find((k: any) => keyValue(k) === treasury);
  if (
    !treasuryKey ||
    typeof treasuryKey === "string" ||
    treasuryKey.signer !== true
  )
    return false;
  if (
    !Array.isArray(tx.transaction?.signatures) ||
    !tx.transaction.signatures.includes(signature)
  )
    return false;
  const deltas = tokenDeltas(tx, treasury, recipient, USD1_MINT);
  if (!deltas || deltas.treasury !== -expected || deltas.recipient !== expected)
    return false;
  const balances = [
    ...(tx.meta?.preTokenBalances ?? []),
    ...(tx.meta?.postTokenBalances ?? []),
  ];
  const ownerAt = (index: any) =>
    balances.find((b: any) => b.accountIndex === index && b.mint === USD1_MINT)
      ?.owner;
  const mintAt = (index: any) =>
    balances.find((b: any) => b.accountIndex === index)?.mint;
  if (
    balances.some(
      (b: any) =>
        b.mint === USD1_MINT &&
        b.uiTokenAmount?.decimals !== undefined &&
        b.uiTokenAmount.decimals !== USD1_DECIMALS,
    )
  )
    return false;
  let exactTransfer = false;
  const walk = (instructions: any[]) => {
    for (const ix of instructions ?? []) {
      if (
        ix?.programId !== TOKEN_PROGRAM &&
        ix?.programId !== TOKEN_2022_PROGRAM
      )
        continue;
      const p = ix?.parsed;
      if (p?.type !== "transfer" && p?.type !== "transferChecked") continue;
      const info = p.info ?? {};
      const amount = String(info.amount ?? info.tokenAmount?.amount ?? "");
      const mint = info.mint ?? info.tokenAmount?.mint;
      const source = info.source;
      const destination = info.destination;
      const sourceOwner = ownerAt(
        keys.findIndex((k: any) => keyValue(k) === source),
      );
      const destOwner = ownerAt(
        keys.findIndex((k: any) => keyValue(k) === destination),
      );
      const sourceIndex = keys.findIndex((k: any) => keyValue(k) === source);
      const destinationIndex = keys.findIndex(
        (k: any) => keyValue(k) === destination,
      );
      const mintOk = mint
        ? mint === USD1_MINT
        : mintAt(sourceIndex) === USD1_MINT &&
          mintAt(destinationIndex) === USD1_MINT;
      if (
        amount === amountUnits &&
        mintOk &&
        sourceOwner === treasury &&
        destOwner === recipient &&
        info.authority === treasury
      )
        exactTransfer = true;
    }
  };
  walk(tx.transaction?.message?.instructions);
  for (const inner of tx.meta?.innerInstructions ?? [])
    walk(inner.instructions);
  return exactTransfer;
}

const rowSelect = `id, submission_id, idempotency_key, creator_wallet, trunc(amount_units)::text as amount_units, token_mint, network, treasury_wallet, transaction_signature, status`;
async function closeIfVerified(
  sql: Sql,
  row: RequestRow,
  signature: string,
): Promise<PayoutResult> {
  if (
    !(await verifyFinalized(
      signature,
      row.creator_wallet,
      row.amount_units,
      row.treasury_wallet,
    ))
  )
    return {
      status: "processing",
      message:
        "Transfer is not finalized or did not match the immutable payout snapshot; manual reconciliation is required.",
    };
  const reused = await sql.query(
    `select 1 from payouts where reference=$1 limit 1`,
    [signature],
  );
  if (reused.length)
    return {
      status: "processing",
      message:
        "The transaction signature is already recorded against another payout; manual reconciliation is required.",
    };
  const closed = await sql.query<{ id: number }>(
    `with inserted as (insert into payouts (user_id, submission_id, amount, reference, paid_at) select s.user_id, s.id, (d.amount_units::numeric / 1000000), $2, now() from direct_payout_requests d join submissions s on s.id=d.submission_id where d.id=$1 and d.status='processing' and d.transaction_signature=$2 and not exists (select 1 from payouts p where p.submission_id=d.submission_id) returning submission_id), marked as (update submissions s set status='paid', paid_at=now() from inserted i where s.id=i.submission_id returning s.id) update direct_payout_requests d set status='confirmed', confirmed_at=now(), updated_at=now() from marked m where d.id=$1 returning d.id`,
    [row.id, signature],
  );
  if (!closed.length) {
    const already = await sql.query(
      `select 1 from direct_payout_requests where id=$1 and status='confirmed'`,
      [row.id],
    );
    if (already.length) return { status: "paid" };
    return {
      status: "processing",
      message:
        "Finalized transfer could not be closed atomically; manual reconciliation is required.",
    };
  }
  return { status: "paid" };
}

export async function paySubmission(
  sql: Sql,
  submissionId: number,
  adminId: string,
): Promise<PayoutResult> {
  const ready = getPayoutReadiness();
  if (!ready.enabled) return { status: "processing", message: ready.reason };
  if (
    !Number.isSafeInteger(submissionId) ||
    submissionId <= 0 ||
    !adminId.trim()
  )
    return { status: "processing", message: "Invalid payout request." };
  let newlyClaimed = false;
  let row: RequestRow | undefined = (
    await sql.query<RequestRow>(
      `select ${rowSelect} from direct_payout_requests where submission_id=$1`,
      [submissionId],
    )
  )[0];
  if (!row) {
    row = await sql.transaction(async (tx) => {
      const locked = await tx.query<{
        id: number;
        user_id: string;
        payout_wallet_address: string;
        payout_wallet_status: string;
        suspended: boolean;
      }>(
        `select p.user_id, p.payout_wallet_address, p.payout_wallet_status, p.suspended from submissions s join profiles p on p.user_id=s.user_id where s.id=$1 for update of s, p`,
        [submissionId],
      );
      if (!locked.length) return undefined;
      const claimed = await tx.query<RequestRow>(
        `with eligible as (select s.id, p.payout_wallet_address as wallet, (s.estimated_payout::numeric * 1000000)::numeric as units from submissions s join profiles p on p.user_id=s.user_id where s.id=$1 and s.status='approved' and s.payout_proof_status='accepted' and s.verification_status='verified' and s.flagged=false and s.views >= s.min_views and nullif(trim(s.analytics_proof_url),'') is not null and p.payout_wallet_status='verified' and p.suspended=false and nullif(trim(p.payout_wallet_address),'') is not null and s.estimated_payout > 0 and not exists (select 1 from payouts old where old.submission_id=s.id) and not exists (select 1 from payout_items old where old.submission_id=s.id)), claimed as (insert into direct_payout_requests (submission_id,idempotency_key,creator_wallet,amount_units,token_mint,network,treasury_wallet,requesting_admin) select id, $6 || ':vuze-direct:' || id::text, wallet, units, $2, $3, $4, $5 from eligible on conflict (submission_id) do nothing returning ${rowSelect}) update submissions s set status='payment_processing' from claimed c where s.id=c.submission_id returning c.*`,
        [
          submissionId,
          USD1_MINT,
          USD1_NETWORK,
          env("USD1_TREASURY_WALLET"),
          adminId,
          env("USD1_PAYOUT_NAMESPACE"),
        ],
      );
      if (claimed.length) {
        newlyClaimed = true;
        return claimed[0];
      }
      return (
        await tx.query<RequestRow>(
          `select ${rowSelect} from direct_payout_requests where submission_id=$1`,
          [submissionId],
        )
      )[0];
    });
  }
  if (!row)
    return {
      status: "processing",
      message: "Submission is not payout-eligible or is already paid.",
    };
  if (
    row.token_mint !== USD1_MINT ||
    row.network !== USD1_NETWORK ||
    !validWallet(row.creator_wallet) ||
    !validWallet(row.treasury_wallet)
  ) {
    await sql.query(
      `update direct_payout_requests set status='blocked', updated_at=now() where id=$1 and status='processing'`,
      [row.id],
    );
    return {
      status: "processing",
      message:
        "Payout is blocked because the immutable wallet or asset snapshot is invalid.",
    };
  }
  if (row.status === "blocked")
    return {
      status: "processing",
      message: "Payout is blocked and requires manual review.",
    };
  if (row.status === "confirmed" && row.transaction_signature)
    return { status: "paid" };
  let signature = row.transaction_signature;
  if (!signature) {
    const reconciled = await signerRequest("GET", row.idempotency_key);
    signature =
      reconciled.ok && validSignature(reconciled.body?.signature)
        ? reconciled.body.signature
        : null;
    if (!signature && newlyClaimed) {
      const sent = await signerRequest("POST", row.idempotency_key, {
        idempotencyKey: row.idempotency_key,
        destination: row.creator_wallet,
        mint: USD1_MINT,
        amountUnits: row.amount_units,
        network: USD1_NETWORK,
      });
      signature =
        sent.ok && validSignature(sent.body?.signature)
          ? sent.body.signature
          : null;
    }
    if (!signature)
      return {
        status: "processing",
        message:
          "Signer has no known signature; no new transfer will be created. Manual reconciliation is required.",
      };
    const cas = await sql.query<RequestRow>(
      `update direct_payout_requests set transaction_signature=$2, updated_at=now() where id=$1 and transaction_signature is null and status='processing' returning ${rowSelect}`,
      [row.id, signature],
    );
    if (cas[0]) row = cas[0];
    else {
      const actual = (
        await sql.query<RequestRow>(
          `select ${rowSelect} from direct_payout_requests where id=$1`,
          [row.id],
        )
      )[0];
      if (!actual?.transaction_signature)
        return {
          status: "processing",
          message:
            "Concurrent payout update could not be reconciled; manual reconciliation is required.",
        };
      row = actual;
      signature = actual.transaction_signature;
    }
  }
  return closeIfVerified(sql, row, signature);
}
