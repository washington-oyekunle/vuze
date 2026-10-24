import type { Sql } from "../db";

export const SOLANA_MAINNET = "solana-mainnet" as const;
const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const TIMEOUT_MS = 15_000;
type PayoutResult = { status: "processing" | "paid"; message?: string };
export type SolanaPayoutAsset = {
  symbol: string;
  mint: string;
  decimals: number;
  network: typeof SOLANA_MAINNET;
  treasuryWallet: string;
  maxPayoutUnits: string;
  maxDailyPayoutUnits: string;
};
export type SolanaPayoutAssetOption = Omit<
  SolanaPayoutAsset,
  "treasuryWallet" | "maxPayoutUnits" | "maxDailyPayoutUnits"
>;
type RequestRow = {
  id: number | string;
  submission_id: number | string;
  idempotency_key: string;
  creator_wallet: string;
  amount_units: string;
  token_symbol: string;
  token_mint: string;
  token_decimals: number | string;
  network: string;
  treasury_wallet: string;
  transaction_signature: string | null;
  status: string;
  failure_reason: string;
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
  const digits: number[] = [];
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
  for (const ch of value) {
    if (ch === "1") digits.push(0);
    else break;
  }
  return Uint8Array.from(digits.reverse());
}
function validWallet(value: string): boolean {
  const bytes = base58Bytes(value);
  return !!bytes && bytes.length === 32;
}
export function isValidSolanaAddress(value: string): boolean {
  return validWallet(value);
}
function validSignature(value: unknown): value is string {
  const bytes = typeof value === "string" ? base58Bytes(value) : null;
  return !!bytes && bytes.length === 64;
}
function parseConfiguredAssets(): {
  assets: SolanaPayoutAsset[];
  reason?: string;
} {
  const raw = env("SOLANA_PAYOUT_ASSETS");
  if (!raw)
    return {
      assets: [],
      reason:
        "SOLANA_PAYOUT_ASSETS must list the allowed Solana payout tokens and their decimals and treasuries.",
    };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { assets: [], reason: "SOLANA_PAYOUT_ASSETS must be valid JSON." };
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 50)
    return {
      assets: [],
      reason: "SOLANA_PAYOUT_ASSETS must be a non-empty array of up to 50 assets.",
    };
  const assets: SolanaPayoutAsset[] = [];
  const mints = new Set<string>();
  for (const item of parsed) {
    if (!item || typeof item !== "object")
      return { assets: [], reason: "Each configured payout asset must be an object." };
    const row = item as Record<string, unknown>;
    const symbol = typeof row.symbol === "string" ? row.symbol.trim() : "";
    const mint = typeof row.mint === "string" ? row.mint.trim() : "";
    const decimals = row.decimals;
    const treasuryWallet =
      typeof row.treasuryWallet === "string" ? row.treasuryWallet.trim() : "";
    const maxPayoutUnits =
      typeof row.maxPayoutUnits === "string" ? row.maxPayoutUnits.trim() : "";
    const maxDailyPayoutUnits =
      typeof row.maxDailyPayoutUnits === "string"
        ? row.maxDailyPayoutUnits.trim()
        : "";
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,15}$/.test(symbol))
      return {
        assets: [],
        reason: "Each payout asset needs a short alphanumeric token symbol.",
      };
    if (!validWallet(mint))
      return { assets: [], reason: `The configured ${symbol} mint is not a valid Solana public key.` };
    if (!Number.isInteger(decimals) || (decimals as number) < 0 || (decimals as number) > 18)
      return { assets: [], reason: `The configured ${symbol} decimals must be an integer from 0 to 18.` };
    if (!validWallet(treasuryWallet))
      return {
        assets: [],
        reason: `The configured ${symbol} treasury is not a valid Solana public key.`,
      };
    if (!/^\d+$/.test(maxPayoutUnits) || BigInt(maxPayoutUnits) <= 0n)
      return {
        assets: [],
        reason: `The configured ${symbol} maxPayoutUnits must be a positive integer string.`,
      };
    if (!/^\d+$/.test(maxDailyPayoutUnits) || BigInt(maxDailyPayoutUnits) <= 0n)
      return {
        assets: [],
        reason: `The configured ${symbol} maxDailyPayoutUnits must be a positive integer string.`,
      };
    if (mints.has(mint))
      return { assets: [], reason: "SOLANA_PAYOUT_ASSETS cannot contain a mint more than once." };
    mints.add(mint);
    assets.push({
      symbol,
      mint,
      decimals: decimals as number,
      network: SOLANA_MAINNET,
      treasuryWallet,
      maxPayoutUnits,
      maxDailyPayoutUnits,
    });
  }
  return { assets };
}
export function getPayoutAssetOptions(): SolanaPayoutAssetOption[] {
  const { assets } = parseConfiguredAssets();
  return assets.map(({ symbol, mint, decimals, network }) => ({
    symbol,
    mint,
    decimals,
    network,
  }));
}
export function getPayoutReadiness(): { enabled: boolean; reason: string } {
  if (env("SOLANA_PAYOUTS_ENABLED") !== "true")
    return {
      enabled: false,
      reason: "Solana-token payouts are disabled (SOLANA_PAYOUTS_ENABLED must be true).",
    };
  if (!env("DATABASE_URL"))
    return {
      enabled: false,
      reason:
        "Solana-token payouts require a durable DATABASE_URL; local fallback databases are not eligible.",
    };
  if (!isHttps(env("SOLANA_SIGNER_URL")))
    return { enabled: false, reason: "SOLANA_SIGNER_URL must be an HTTPS URL." };
  if (
    !env("SOLANA_PAYOUT_NAMESPACE") ||
    !/^[a-zA-Z0-9_-]{3,80}$/.test(env("SOLANA_PAYOUT_NAMESPACE")!)
  )
    return {
      enabled: false,
      reason:
        "SOLANA_PAYOUT_NAMESPACE must identify this deployment uniquely (3–80 letters, digits, underscores or dashes).",
    };
  if (!env("SOLANA_SIGNER_TOKEN"))
    return { enabled: false, reason: "SOLANA_SIGNER_TOKEN is not configured." };
  if (!isHttps(env("SOLANA_RPC_URL")))
    return { enabled: false, reason: "SOLANA_RPC_URL must be an HTTPS URL." };
  const configured = parseConfiguredAssets();
  if (!configured.assets.length)
    return { enabled: false, reason: configured.reason ?? "No Solana payout tokens are configured." };
  return { enabled: true, reason: "Solana-token payouts are configured." };
}
function configuredAssetMatches(
  symbol: unknown,
  mint: unknown,
  decimals: unknown,
  network: unknown,
): SolanaPayoutAsset | undefined {
  const { assets } = parseConfiguredAssets();
  return assets.find(
    (asset) =>
      asset.symbol === symbol &&
      asset.mint === mint &&
      asset.decimals === Number(decimals) &&
      asset.network === network,
  );
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
function safeSignerCode(value: unknown, status: number): string {
  return typeof value === "string" && /^[A-Z0-9_]{1,64}$/.test(value)
    ? value
    : `SIGNER_HTTP_${status}`;
}
async function signerRequest(
  method: "GET" | "POST",
  key: string,
  payload?: object,
) {
  const configuredBase = env("SOLANA_SIGNER_URL");
  const token = env("SOLANA_SIGNER_TOKEN");
  if (!configuredBase || !token)
    return { ok: false, status: 0, body: null };
  const base = configuredBase.replace(/\/+$/, "");
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
  mint: string,
  decimals: number,
  network: string,
  treasury: string,
): Promise<boolean> {
  const expected = decimal(amountUnits);
  if (
    expected === null ||
    !validSignature(signature) ||
    !validWallet(treasury) ||
    !validWallet(recipient) ||
    !validWallet(mint) ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 18 ||
    network !== SOLANA_MAINNET
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
  const deltas = tokenDeltas(tx, treasury, recipient, mint);
  if (!deltas || deltas.treasury !== -expected || deltas.recipient !== expected)
    return false;
  const balances = [
    ...(tx.meta?.preTokenBalances ?? []),
    ...(tx.meta?.postTokenBalances ?? []),
  ];
  const mintBalances = balances.filter((b: any) => b.mint === mint);
  if (
    mintBalances.length < 2 ||
    mintBalances.some((b: any) => b.uiTokenAmount?.decimals !== decimals)
  )
    return false;
  const ownerAt = (index: number) =>
    balances.find((b: any) => b.accountIndex === index && b.mint === mint)?.owner;
  const mintAt = (index: number) =>
    balances.find((b: any) => b.accountIndex === index)?.mint;
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
      const instructionMint = info.mint ?? info.tokenAmount?.mint;
      const source = info.source;
      const destination = info.destination;
      const sourceIndex = keys.findIndex((k: any) => keyValue(k) === source);
      const destinationIndex = keys.findIndex(
        (k: any) => keyValue(k) === destination,
      );
      const sourceOwner = ownerAt(sourceIndex);
      const destOwner = ownerAt(destinationIndex);
      const mintOk = instructionMint
        ? instructionMint === mint
        : mintAt(sourceIndex) === mint && mintAt(destinationIndex) === mint;
      const decimalsOk =
        p.type !== "transferChecked" || info.tokenAmount?.decimals === decimals;
      if (
        amount === amountUnits &&
        mintOk &&
        decimalsOk &&
        sourceOwner === treasury &&
        destOwner === recipient &&
        info.authority === treasury
      )
        exactTransfer = true;
    }
  };
  walk(tx.transaction?.message?.instructions);
  for (const inner of tx.meta?.innerInstructions ?? []) walk(inner.instructions);
  return exactTransfer;
}
const rowSelect = `id, submission_id, idempotency_key, creator_wallet, trunc(amount_units)::text as amount_units, token_symbol, token_mint, token_decimals, network, treasury_wallet, transaction_signature, status, failure_reason`;
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
      row.token_mint,
      Number(row.token_decimals),
      row.network,
      row.treasury_wallet,
    ))
  )
    return {
      status: "processing",
      message:
        "Transfer is not finalized yet or did not match the immutable payout snapshot; Vuze will keep checking this existing request.",
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
    `with inserted as (
       insert into payouts (user_id, submission_id, amount, reference, paid_at, token_symbol, token_mint, token_decimals, network)
       select s.user_id, s.id,
              (d.amount_units::numeric / power(10::numeric, d.token_decimals)),
              $2, now(), d.token_symbol, d.token_mint, d.token_decimals, d.network
       from direct_payout_requests d
       join submissions s on s.id=d.submission_id
       where d.id=$1 and d.status='processing' and d.transaction_signature=$2
         and not exists (select 1 from payouts p where p.submission_id=d.submission_id)
       returning submission_id
     ), marked as (
       update submissions s set status='paid', paid_at=now()
       from inserted i where s.id=i.submission_id returning s.id
     )
     update direct_payout_requests d
     set status='confirmed', confirmed_at=now(), updated_at=now()
     from marked m where d.id=$1 returning d.id`,
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
        "Finalized transfer could not be closed atomically; Vuze will retry reconciliation of the existing request.",
    };
  }
  return { status: "paid" };
}
export async function paySubmission(
  sql: Sql,
  submissionId: number,
  adminId: string,
  reconcileOnly = false,
): Promise<PayoutResult> {
  const ready = getPayoutReadiness();
  if (!reconcileOnly && !ready.enabled)
    return { status: "processing", message: ready.reason };
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
  if (!row && reconcileOnly)
    return {
      status: "processing",
      message: "No existing payout request is available to reconcile.",
    };
  if (!row) {
    const campaignAsset = (
      await sql.query<{
        payout_token_symbol: string;
        payout_token_mint: string;
        payout_token_decimals: number | string;
        payout_network: string;
      }>(
        `select c.payout_token_symbol, c.payout_token_mint, c.payout_token_decimals, c.payout_network
         from submissions s join campaigns c on c.id=s.campaign_id where s.id=$1`,
        [submissionId],
      )
    )[0];
    if (!campaignAsset)
      return { status: "processing", message: "Submission was not found." };
    const asset = configuredAssetMatches(
      campaignAsset.payout_token_symbol,
      campaignAsset.payout_token_mint,
      campaignAsset.payout_token_decimals,
      campaignAsset.payout_network,
    );
    if (!asset)
      return {
        status: "processing",
        message:
          "The campaign payout token is not in the configured Solana-token allowlist; no transfer was created.",
      };
    row = await sql.transaction(async (tx) => {
      const locked = await tx.query<{
        id: number;
        user_id: string;
        payout_wallet_address: string;
        suspended: boolean;
        payout_token_symbol: string;
        payout_token_mint: string;
        payout_token_decimals: number | string;
        payout_network: string;
      }>(
        `select p.user_id, s.payout_wallet_address, p.suspended,
                c.payout_token_symbol, c.payout_token_mint, c.payout_token_decimals, c.payout_network
         from submissions s join profiles p on p.user_id=s.user_id
         join campaigns c on c.id=s.campaign_id
         where s.id=$1 for update of s, p, c`,
        [submissionId],
      );
      if (!locked.length) return undefined;
      const current = locked[0];
      if (
        current.payout_token_symbol !== asset.symbol ||
        current.payout_token_mint !== asset.mint ||
        Number(current.payout_token_decimals) !== asset.decimals ||
        current.payout_network !== asset.network
      )
        return undefined;
      const claimed = await tx.query<RequestRow>(
        `with eligible as (
           select s.id, s.payout_wallet_address as wallet,
                  round(s.estimated_payout::numeric * power(10::numeric, $8::int)) as units
           from submissions s
           join profiles p on p.user_id=s.user_id
           join campaigns c on c.id=s.campaign_id
           where s.id=$1 and s.status='approved' and s.payout_proof_status='accepted'
             and s.verification_status='verified' and s.flagged=false and s.views >= s.min_views
             and nullif(trim(s.analytics_proof_url),'') is not null
             and p.suspended=false
             and nullif(trim(s.payout_wallet_address),'') is not null
             and s.estimated_payout > 0
             and c.payout_token_symbol=$7 and c.payout_token_mint=$2
             and c.payout_token_decimals=$8 and c.payout_network=$3
             and not exists (select 1 from payouts old where old.submission_id=s.id)
             and not exists (select 1 from payout_items old where old.submission_id=s.id)
         ), claimed as (
           insert into direct_payout_requests
             (submission_id,idempotency_key,creator_wallet,amount_units,token_symbol,token_mint,token_decimals,network,treasury_wallet,requesting_admin)
           select id, $6 || ':vuze-direct:' || id::text, wallet, units, $7, $2, $8, $3, $4, $5
           from eligible on conflict (submission_id) do nothing returning ${rowSelect}
         )
         update submissions s set status='payment_processing'
         from claimed c where s.id=c.submission_id returning c.*`,
        [
          submissionId,
          asset.mint,
          asset.network,
          asset.treasuryWallet,
          adminId,
          env("SOLANA_PAYOUT_NAMESPACE"),
          asset.symbol,
          asset.decimals,
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
      message:
        "Submission is not payout-eligible, its campaign token changed, or it is already paid.",
    };
  if (
    !validWallet(row.creator_wallet) ||
    !validWallet(row.treasury_wallet) ||
    !validWallet(row.token_mint) ||
    !Number.isInteger(Number(row.token_decimals)) ||
    Number(row.token_decimals) < 0 ||
    Number(row.token_decimals) > 18 ||
    row.network !== SOLANA_MAINNET ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,15}$/.test(row.token_symbol)
  ) {
    await sql.query(
      `update direct_payout_requests set status='blocked', failure_reason='INVALID_IMMUTABLE_SNAPSHOT', updated_at=now() where id=$1 and status='processing'`,
      [row.id],
    );
    return {
      status: "processing",
      message:
        "Payout is blocked because the immutable wallet or asset snapshot is invalid.",
    };
  }
  const payoutAsset = reconcileOnly
    ? undefined
    : configuredAssetMatches(
        row.token_symbol,
        row.token_mint,
        row.token_decimals,
        row.network,
      );
  const requestedUnits = decimal(row.amount_units);
  if (
    requestedUnits === null ||
    (!reconcileOnly &&
      (!payoutAsset ||
        payoutAsset.treasuryWallet !== row.treasury_wallet ||
        requestedUnits > BigInt(payoutAsset.maxPayoutUnits)))
  ) {
    await sql.query(
      `update direct_payout_requests set status='blocked', failure_reason='ASSET_OR_PAYOUT_CAP', updated_at=now() where id=$1 and status='processing'`,
      [row.id],
    );
    return {
      status: "processing",
      message:
        reconcileOnly
          ? "Payout is blocked because its immutable amount is invalid."
          : "Payout is blocked because its token, treasury, or amount exceeds the current signer allowlist.",
    };
  }
  if (row.status === "blocked")
    return {
      status: "processing",
      message: `Payout is blocked (${row.failure_reason || "manual review required"}); no transfer was made.`,
    };
  if (row.status === "confirmed" && row.transaction_signature)
    return { status: "paid" };
  let signature = row.transaction_signature;
  if (!signature) {
    let signerRequestMissing = false;
    const reconciled = await signerRequest("GET", row.idempotency_key);
    signerRequestMissing = !reconciled.ok && reconciled.status === 404;
    if (!reconciled.ok && [409, 422].includes(reconciled.status)) {
      const code = safeSignerCode(reconciled.body?.code, reconciled.status);
      await sql.query(
        `update direct_payout_requests set status='blocked',failure_reason=$2,updated_at=now() where id=$1 and status='processing'`,
        [row.id, code],
      );
      return {
        status: "processing",
        message: `Signer blocked this payout (${code}); no transfer was made.`,
      };
    }
    signature =
      reconciled.ok && validSignature(reconciled.body?.signature)
        ? reconciled.body.signature
        : null;
    if (!signature && (newlyClaimed || signerRequestMissing)) {
      const sent = await signerRequest("POST", row.idempotency_key, {
        idempotencyKey: row.idempotency_key,
        destination: row.creator_wallet,
        treasuryWallet: row.treasury_wallet,
        mint: row.token_mint,
        amountUnits: row.amount_units,
        network: row.network,
      });
      if (!sent.ok && [409, 422].includes(sent.status)) {
        const code = safeSignerCode(sent.body?.code, sent.status);
        await sql.query(
          `update direct_payout_requests set status='blocked',failure_reason=$2,updated_at=now() where id=$1 and status='processing'`,
          [row.id, code],
        );
        return {
          status: "processing",
          message: `Signer blocked this payout (${code}); no transfer was made.`,
        };
      }
      signature =
        sent.ok && validSignature(sent.body?.signature)
          ? sent.body.signature
          : null;
    }
    if (!signature)
      return {
        status: "processing",
        message:
          "Signer is still processing this payout; Vuze will keep reconciling the existing request automatically. No new transfer will be created.",
      };
    const cas = await sql.query<RequestRow>(
      `update direct_payout_requests set transaction_signature=$2, updated_at=now()
       where id=$1 and transaction_signature is null and status='processing'
       returning ${rowSelect}`,
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
