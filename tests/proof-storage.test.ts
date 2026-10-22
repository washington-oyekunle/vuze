import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPrivateProofBucket,
  getProofStorage,
  ProofStorageConfigError,
} from "../src/lib/vuze/proof-storage.server.ts";

test("missing Supabase credentials never fall back to public storage", () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(() => getProofStorage(), ProofStorageConfigError);
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});
test("public or unavailable proof buckets are rejected", async () => {
  await assert.rejects(
    assertPrivateProofBucket({
      storage: {
        getBucket: async () => ({ data: { public: true }, error: null }),
      },
    } as never),
    /must be private/,
  );
  await assert.rejects(
    assertPrivateProofBucket({
      storage: {
        getBucket: async () => ({
          data: null,
          error: { message: "not found" },
        }),
      },
    } as never),
    /unavailable/,
  );
  await assert.doesNotReject(
    assertPrivateProofBucket({
      storage: {
        getBucket: async () => ({ data: { public: false }, error: null }),
      },
    } as never),
  );
});
