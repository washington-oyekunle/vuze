import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { getSql, type Sql } from "@/lib/db";
import {
  assertPrivateProofBucket,
  getProofStorage,
  PROOF_BUCKET,
  ProofStorageConfigError,
} from "@/lib/vuze/proof-storage.server";

const MAX_BYTES = 25 * 1024 * 1024;
const RATE_LIMIT = 10;
const ALLOWED = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
} as const;
type ContentType = keyof typeof ALLOWED;
type ProofRow = {
  id: string;
  user_id: string;
  pathname: string;
  blob_url: string;
  content_type: string;
  size_bytes: number;
  status: string;
};
const SAFE_ERROR = "Unable to process analytics proof upload";

function errorResponse(status: number, message = SAFE_ERROR) {
  return Response.json({ error: message }, { status });
}
function isType(value: unknown): value is ContentType {
  return typeof value === "string" && value in ALLOWED;
}
function validId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  return request.headers.get("sec-fetch-site") !== "cross-site";
}
async function userId(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user?.id ? String(session.user.id) : null;
}
async function profile(user: string) {
  const sql = await getSql();
  const rows = await sql<{
    user_id: string;
    role: string;
    suspended: boolean;
  }>`select user_id, role, suspended from profiles where user_id = ${user}`;
  return rows[0] ?? null;
}
function storageErrorStatus(error: unknown) {
  return error instanceof ProofStorageConfigError ? 503 : 500;
}

async function prepare(request: Request, body: Record<string, unknown>) {
  const user = await userId(request);
  if (!user) return errorResponse(401, "Sign in to upload proof");
  const p = await profile(user);
  if (!p || p.suspended) return errorResponse(403, "You cannot upload proof");
  const contentType = body.contentType;
  const size = body.size;
  if (
    !isType(contentType) ||
    typeof size !== "number" ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > MAX_BYTES
  )
    return errorResponse(400, "Choose a supported, nonempty file up to 25 MB");
  const storage = getProofStorage();
  await assertPrivateProofBucket(storage);
  const id = crypto.randomUUID();
  const pathname = `analytics/${user}/${crypto.randomUUID()}/proof.${ALLOWED[contentType]}`;
  const sql = await getSql();
  await sql.transaction(async (tx: Sql) => {
    await tx`select user_id from profiles where user_id = ${user} for update`;
    const recent = await tx<{
      count: number;
    }>`select count(*)::int as count from analytics_proof_uploads where user_id = ${user} and created_at >= now() - interval '1 hour'`;
    if (Number(recent[0]?.count ?? 0) >= RATE_LIMIT)
      throw new Error("RATE_LIMIT");
    await tx`insert into analytics_proof_uploads (id, user_id, pathname, content_type, size_bytes) values (${id}, ${user}, ${pathname}, ${contentType}, ${size})`;
  });
  const { data, error } = await storage.storage
    .from(PROOF_BUCKET)
    .createSignedUploadUrl(pathname, { upsert: false });
  if (error || !data?.signedUrl) throw new Error("Could not create upload URL");
  return Response.json({ id, pathname, signedUploadUrl: data.signedUrl });
}

async function finalize(request: Request, body: Record<string, unknown>) {
  const user = await userId(request);
  if (!user) return errorResponse(401, "Sign in to finalize proof");
  if (!validId(body.id)) return errorResponse(400, "Invalid proof upload");
  const sql = await getSql();
  const rows =
    await sql<ProofRow>`select id, user_id, pathname, blob_url, content_type, size_bytes, status from analytics_proof_uploads where id = ${body.id} and user_id = ${user}`;
  const row = rows[0];
  if (!row || !row.pathname.startsWith(`analytics/${user}/`))
    return errorResponse(404, "Proof upload not found");
  if (row.status === "claimed")
    return errorResponse(409, "Proof has already been submitted");
  const storage = getProofStorage();
  await assertPrivateProofBucket(storage);
  const { data: file, error } = await storage.storage
    .from(PROOF_BUCKET)
    .download(row.pathname);
  if (
    error ||
    !file ||
    file.size < 1 ||
    file.size > MAX_BYTES ||
    file.size !== Number(row.size_bytes) ||
    file.type !== row.content_type ||
    !isType(file.type)
  )
    return errorResponse(
      400,
      "Uploaded proof does not match the declared file",
    );
  const updated =
    await sql<ProofRow>`update analytics_proof_uploads set blob_url = '', content_type = ${file.type}, size_bytes = ${file.size}, status = 'ready' where id = ${row.id} and user_id = ${user} and pathname = ${row.pathname} and status in ('pending', 'ready') returning id, user_id, pathname, blob_url, content_type, size_bytes, status`;
  if (!updated[0])
    return errorResponse(409, "Proof has already been submitted");
  return Response.json({
    id: row.id,
    url: `/api/analytics-proof?id=${encodeURIComponent(row.id)}`,
    contentType: file.type,
  });
}

async function serve(request: Request, headOnly: boolean) {
  const id = new URL(request.url).searchParams.get("id");
  if (!validId(id)) return errorResponse(404);
  const user = await userId(request);
  if (!user) return errorResponse(401);
  const p = await profile(user);
  if (!p) return errorResponse(403);
  const sql = await getSql();
  const rows =
    await sql<ProofRow>`select id, user_id, pathname, blob_url, content_type, size_bytes, status from analytics_proof_uploads where id = ${id} and status in ('ready', 'claimed') and (user_id = ${user} or ${p.role} = 'admin')`;
  const row = rows[0];
  if (!row || !row.pathname.startsWith("analytics/")) return errorResponse(404);
  const storage = getProofStorage();
  await assertPrivateProofBucket(storage);
  const { data: file, error } = await storage.storage
    .from(PROOF_BUCKET)
    .download(row.pathname);
  if (
    error ||
    !file ||
    !isType(file.type) ||
    file.type !== row.content_type ||
    file.size < 1 ||
    file.size > MAX_BYTES
  )
    return errorResponse(404);
  const headers = new Headers({
    "Content-Type": file.type,
    "Content-Length": String(file.size),
    "Content-Disposition": "inline",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
  });
  return headOnly
    ? new Response(null, { status: 200, headers })
    : new Response(file.stream(), { status: 200, headers });
}

export const Route = createFileRoute("/api/analytics-proof")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!sameOrigin(request))
          return errorResponse(403, "Request origin is not allowed");
        try {
          const body = (await request.json()) as Record<string, unknown>;
          if (body.action === "prepare") return await prepare(request, body);
          if (body.action === "finalize") return await finalize(request, body);
          return errorResponse(400);
        } catch (error) {
          if (error instanceof Error && error.message === "RATE_LIMIT")
            return errorResponse(429, "Upload limit reached; try again later");
          console.error("analytics proof route could not complete", error);
          return errorResponse(storageErrorStatus(error));
        }
      },
      GET: async ({ request }) => {
        try {
          return await serve(request, false);
        } catch (error) {
          console.error("analytics proof read failed", error);
          return errorResponse(storageErrorStatus(error));
        }
      },
      HEAD: async ({ request }) => {
        try {
          return await serve(request, true);
        } catch (error) {
          console.error("analytics proof head failed", error);
          return errorResponse(storageErrorStatus(error));
        }
      },
    },
  },
});
