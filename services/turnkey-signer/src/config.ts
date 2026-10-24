import { PublicKey } from "@solana/web3.js";

export type PayoutAsset = {
  symbol: string;
  mint: string;
  decimals: number;
  treasuryWallet: string;
  maxPayoutUnits: bigint;
  maxDailyPayoutUnits: bigint;
};

export type SignerConfig = {
  host: string;
  port: number;
  databaseUrl: string;
  rpcUrl: string;
  organizationId: string;
  apiPublicKey: string;
  apiPrivateKey: string;
  apiBaseUrl: string;
  bearerToken: string;
  assets: PayoutAsset[];
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function httpsUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error(`${name} must be a valid HTTPS URL without embedded credentials`);
  return url.toString().replace(/\/$/, "");
}

function publicKey(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a public key`);
  try {
    const key = new PublicKey(value.trim());
    if (key.toBase58() !== value.trim()) throw new Error();
    return key.toBase58();
  } catch {
    throw new Error(`${label} must be a valid Solana public key`);
  }
}

function positiveUnits(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value))
    throw new Error(`${label} must be a positive integer string`);
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error(`${label} must be a positive integer string`);
  return parsed;
}

export function parsePayoutAssets(raw: string): PayoutAsset[] {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("SOLANA_PAYOUT_ASSETS must be valid JSON");
  }
  if (!Array.isArray(value) || value.length < 1 || value.length > 50)
    throw new Error("SOLANA_PAYOUT_ASSETS must contain 1–50 allowed assets");

  const seenMints = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== "object")
      throw new Error(`SOLANA_PAYOUT_ASSETS[${index}] must be an object`);
    const row = item as Record<string, unknown>;
    const symbol = typeof row.symbol === "string" ? row.symbol.trim() : "";
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,15}$/.test(symbol))
      throw new Error(`SOLANA_PAYOUT_ASSETS[${index}].symbol is invalid`);
    const mint = publicKey(row.mint, `${symbol}.mint`);
    if (seenMints.has(mint)) throw new Error("Payout mints must be unique");
    seenMints.add(mint);
    const treasuryWallet = publicKey(row.treasuryWallet, `${symbol}.treasuryWallet`);
    const decimals = row.decimals;
    if (!Number.isInteger(decimals) || Number(decimals) < 0 || Number(decimals) > 18)
      throw new Error(`${symbol}.decimals must be an integer from 0 to 18`);
    const maxPayoutUnits = positiveUnits(row.maxPayoutUnits, `${symbol}.maxPayoutUnits`);
    const maxDailyPayoutUnits = positiveUnits(
      row.maxDailyPayoutUnits,
      `${symbol}.maxDailyPayoutUnits`,
    );
    if (maxDailyPayoutUnits < maxPayoutUnits)
      throw new Error(`${symbol}.maxDailyPayoutUnits cannot be below maxPayoutUnits`);
    return {
      symbol,
      mint,
      decimals: Number(decimals),
      treasuryWallet,
      maxPayoutUnits,
      maxDailyPayoutUnits,
    };
  });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SignerConfig {
  if (env.SOLANA_PAYOUTS_ENABLED !== "true")
    throw new Error("SOLANA_PAYOUTS_ENABLED must be true to start the signer");
  const databaseUrl = required(env, "DATABASE_URL");
  const db = new URL(databaseUrl);
  if (db.protocol !== "postgres:" && db.protocol !== "postgresql:")
    throw new Error("DATABASE_URL must use PostgreSQL");
  const bearerToken = required(env, "SOLANA_SIGNER_TOKEN");
  if (Buffer.byteLength(bearerToken, "utf8") < 32)
    throw new Error("SOLANA_SIGNER_TOKEN must be at least 32 bytes");
  const port = Number(env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer from 1 to 65535");

  return {
    host: env.HOST?.trim() || "0.0.0.0",
    port,
    databaseUrl,
    rpcUrl: httpsUrl(required(env, "SOLANA_RPC_URL"), "SOLANA_RPC_URL"),
    organizationId: required(env, "TURNKEY_ORGANIZATION_ID"),
    apiPublicKey: required(env, "TURNKEY_API_PUBLIC_KEY"),
    apiPrivateKey: required(env, "TURNKEY_API_PRIVATE_KEY"),
    apiBaseUrl: httpsUrl(env.TURNKEY_API_BASE_URL?.trim() || "https://api.turnkey.com", "TURNKEY_API_BASE_URL"),
    bearerToken,
    assets: parsePayoutAssets(required(env, "SOLANA_PAYOUT_ASSETS")),
  };
}
