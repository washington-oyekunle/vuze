import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const PROOF_BUCKET =
  process.env.SUPABASE_ANALYTICS_BUCKET?.trim() || "analytics-proof";

export class ProofStorageConfigError extends Error {
  constructor(message = "Analytics proof storage is not configured") {
    super(message);
    this.name = "ProofStorageConfigError";
  }
}

let client: SupabaseClient | undefined;

export function getProofStorage(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new ProofStorageConfigError();
  if (!client)
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  return client;
}

export async function assertPrivateProofBucket(
  storage: SupabaseClient,
): Promise<void> {
  const { data, error } = await storage.storage.getBucket(PROOF_BUCKET);
  if (error || !data)
    throw new ProofStorageConfigError("Analytics proof bucket is unavailable");
  if (data.public)
    throw new ProofStorageConfigError("Analytics proof bucket must be private");
}

export function storagePathForUser(userId: string): string {
  return `analytics/${userId}/${crypto.randomUUID()}/proof`;
}
