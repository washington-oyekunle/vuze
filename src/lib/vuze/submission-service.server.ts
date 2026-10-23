import type { Sql } from "../db";
import {
  eligibility,
  parseVideoUrl,
  verifyVideo,
  type VerificationResult,
} from "./verification.server.ts";

type SubmitInput = {
  campaignId: number;
  postUrl: string;
  platform: string;
  notes?: string;
  proofUploadId: string;
};
type Entry = {
  id: number;
  status: string;
  user_id: string;
  platform: string;
  post_url: string;
  video_id: string | null;
  proof_upload_id: string | null;
  verification_started_at: string | null;
  verification_status: string;
  min_views: number;
  views: number;
  flagged: boolean;
};
type VerificationSnapshot = {
  status: string;
  verificationStatus: string;
  verificationReason: string;
  views: number;
  minViews: number;
};

async function attachProof(sql: Sql, id: string, userId: string) {
  const uploads = await sql<{ id: string; content_type: string }>`
    update analytics_proof_uploads set status = 'claimed', claimed_at = now()
    where id = ${id} and user_id = ${userId} and status = 'ready'
      and created_at > now() - interval '24 hours'
    returning id, content_type
  `;
  if (!uploads[0])
    throw new Error(
      "Upload analytics proof first. The file must be yours and cannot be reused.",
    );
  return {
    url: `/api/analytics-proof?id=${encodeURIComponent(id)}`,
    contentType: uploads[0].content_type,
  };
}

async function getVerificationSnapshot(
  sql: Sql,
  id: number,
): Promise<VerificationSnapshot> {
  const rows = await sql<{
    status: string;
    verification_status: string;
    verification_reason: string;
    views: number;
    min_views: number;
  }>`select status, verification_status, verification_reason, views, min_views from submissions where id = ${id}`;
  const row = rows[0];
  if (!row) throw new Error("Submission not found after verification");
  return {
    status: row.status,
    verificationStatus: row.verification_status,
    verificationReason: row.verification_reason,
    views: Number(row.views),
    minViews: Number(row.min_views),
  };
}

export async function createSubmission(
  sql: Sql,
  userId: string,
  data: SubmitInput,
) {
  const identity = parseVideoUrl(data.postUrl, data.platform);
  const attemptId = crypto.randomUUID();
  const { id, created } = await sql.transaction(async (tx) => {
    const profiles = await tx<{
      suspended: boolean;
    }>`select suspended from profiles where user_id = ${userId} for update`;
    if (!profiles[0] || profiles[0].suspended)
      throw new Error("This account cannot submit to campaigns");
    const campaigns = await tx<{
      id: number;
      status: string;
      deadline: string | null;
      max_submissions: number | null;
      min_views: number;
    }>`
      select id, status, deadline, max_submissions, min_views from campaigns where id = ${data.campaignId} for update
    `;
    const campaign = campaigns[0];
    if (!campaign || campaign.status !== "live")
      throw new Error("Campaign is closed or not found");
    if (
      campaign.deadline &&
      new Date(campaign.deadline).getTime() <= Date.now()
    )
      throw new Error("Campaign deadline has passed");
    const existing = await tx<{
      id: number;
      user_id: string;
      proof_upload_id: string;
      campaign_id: number;
    }>`
      select id, user_id, proof_upload_id, campaign_id from submissions where platform = ${identity.platform} and video_id = ${identity.videoId}
    `;
    if (existing[0]) {
      if (
        existing[0].user_id === userId &&
        existing[0].proof_upload_id === data.proofUploadId &&
        Number(existing[0].campaign_id) === data.campaignId
      )
        return { id: Number(existing[0].id), created: false };
      throw new Error("This video has already been submitted");
    }
    if (campaign.max_submissions != null) {
      const counts = await tx<{
        count: number;
      }>`select count(*)::int as count from submissions where campaign_id = ${data.campaignId}`;
      if (Number(counts[0].count) >= campaign.max_submissions)
        throw new Error("This campaign has reached its submission limit");
    }
    const recent = await tx<{
      count: number;
    }>`select count(*)::int as count from submissions where user_id = ${userId} and created_at > now() - interval '1 hour'`;
    if (Number(recent[0].count) >= 20)
      throw new Error("Too many submissions. Try again later.");
    const proof = await attachProof(tx, data.proofUploadId, userId);
    const inserted = await tx<{ id: number }>`
      insert into submissions (campaign_id, user_id, post_url, platform, video_id, notes,
        proof_upload_id, analytics_proof_url, analytics_proof_type, min_views,
        views, estimated_payout, status, verification_status, verification_started_at, verification_attempt_id)
      values (${data.campaignId}, ${userId}, ${identity.canonicalUrl}, ${identity.platform}, ${identity.videoId}, ${data.notes?.trim() ?? ""},
        ${data.proofUploadId}, ${proof.url}, ${proof.contentType}, ${campaign.min_views},
        0, 0, 'verifying', 'pending', now(), ${attemptId}) returning id
    `;
    return { id: Number(inserted[0].id), created: true };
  });
  // The durable entry already exists if the API times out or this process is interrupted.
  if (created)
    await completeVerification(sql, id, attemptId, await verifyVideo(identity));
  return { id, ...(await getVerificationSnapshot(sql, id)) };
}

export async function completeVerification(
  sql: Sql,
  id: number,
  attemptId: string,
  result: VerificationResult,
) {
  if (result.status === "unavailable") {
    await sql`update submissions set status = 'verification_failed', verification_status = 'unavailable',
      verification_reason = ${result.reason}, verified_at = null, verification_source = '', estimated_payout = 0
      where id = ${id} and status = 'verifying' and verification_attempt_id = ${attemptId}`;
  } else {
    const metrics = result.metrics;
    // SQL numeric arithmetic preserves the campaign rate; no creator-supplied views participate.
    await sql`update submissions s set views = ${metrics.views}, verification_status = 'verified',
      verification_source = ${metrics.source}, verified_at = ${metrics.observedAt},
      status = case when ${metrics.views} >= s.min_views then 'under_review' else 'rejected' end,
      verification_reason = case when ${metrics.views} >= s.min_views then 'Minimum verified views reached; awaiting visual proof review.'
        else 'Minimum threshold not reached yet. Retry after the post reaches the minimum.' end,
      estimated_payout = case when ${metrics.views} < s.min_views then 0
        when c.payout_kind = 'flat' then c.payout_rate
        when c.payout_kind = 'per_1k' then round(c.payout_rate * ${metrics.views}::numeric / 1000, 6) else 0 end
      from campaigns c where s.campaign_id = c.id and s.id = ${id}
        and s.status = 'verifying' and s.verification_attempt_id = ${attemptId}`;
  }
  return getVerificationSnapshot(sql, id);
}

export async function retryVerification(
  sql: Sql,
  userId: string,
  id: number,
  proofUploadId?: string,
) {
  const attemptId = crypto.randomUUID();
  const identity = await sql.transaction(async (tx) => {
    const profiles = await tx<{
      suspended: boolean;
    }>`select suspended from profiles where user_id = ${userId} for update`;
    if (!profiles[0] || profiles[0].suspended)
      throw new Error("This account cannot update submissions");
    const rows =
      await tx<Entry>`select * from submissions where id = ${id} and user_id = ${userId} for update`;
    const entry = rows[0];
    if (!entry) throw new Error("Submission not found");
    const stale =
      entry.status === "verifying" &&
      (!entry.verification_started_at ||
        new Date(entry.verification_started_at).getTime() < Date.now() - 60000);
    const belowThreshold =
      entry.status === "rejected" &&
      entry.verification_status === "verified" &&
      Number(entry.views) < Number(entry.min_views);
    if (!(
      entry.status === "verification_failed" ||
      entry.status === "needs_proof" ||
      stale ||
      belowThreshold
    ))
      throw new Error("This submission cannot be reverified right now");
    if (entry.status === "needs_proof" && !proofUploadId)
      throw new Error(
        "Upload replacement proof to address the reviewer’s request",
      );
    if (
      entry.verification_started_at &&
      new Date(entry.verification_started_at).getTime() > Date.now() - 30000
    )
      throw new Error("Wait 30 seconds before retrying verification");
    const identity = parseVideoUrl(entry.post_url, entry.platform);
    let proofId = entry.proof_upload_id;
    if (proofUploadId) {
      const proof = await attachProof(tx, proofUploadId, userId);
      await tx`update submissions set proof_upload_id = ${proofUploadId}, analytics_proof_url = ${proof.url}, analytics_proof_type = ${proof.contentType} where id = ${id}`;
      proofId = proofUploadId;
    }
    if (!proofId)
      throw new Error("Upload analytics proof before retrying verification");
    await tx`update submissions set video_id = ${identity.videoId}, post_url = ${identity.canonicalUrl},
      status = 'verifying', verification_status = 'pending', verification_reason = '',
      verification_started_at = now(), verification_attempt_id = ${attemptId},
      payout_proof_status = 'none', verified_at = null, estimated_payout = 0
      where id = ${id}`;
    return identity;
  });
  const verification = await completeVerification(
    sql,
    id,
    attemptId,
    await verifyVideo(identity),
  );
  return verification;
}

export async function reviewSubmission(
  sql: Sql,
  adminId: string,
  data: {
    id: number;
    action: "approve" | "reject" | "needs_proof" | "flag";
    reason?: string;
    notes?: string;
  },
) {
  if (data.action !== "approve" && !data.reason?.trim())
    throw new Error("A decision reason is required");
  return sql.transaction(async (tx) => {
    const entries = await tx<
      Entry & { analytics_proof_url: string }
    >`select * from submissions where id = ${data.id} for update`;
    const entry = entries[0];
    if (!entry || !["under_review", "needs_proof"].includes(entry.status))
      throw new Error(
        "Entry is not in the review queue or another admin already decided",
      );
    if (
      entry.verification_status !== "verified" ||
      eligibility(Number(entry.views), Number(entry.min_views)) !==
        "under_review" ||
      !entry.analytics_proof_url
    ) {
      throw new Error(
        "API-verified eligibility and uploaded proof are required before review",
      );
    }
    if (data.action === "approve" && entry.flagged)
      throw new Error("Flagged entries must be resolved before approval");
    const reason = data.reason?.trim() || "Visual analytics proof accepted";
    await tx`insert into submission_reviews (submission_id, reviewer_id, action, reason, notes)
      values (${data.id}, ${adminId}, ${data.action}, ${reason}, ${data.notes?.trim() ?? ""})`;
    if (data.action === "flag") {
      await tx`update submissions set flagged = true, admin_notes = ${reason + (data.notes ? ": " + data.notes.trim() : "")} where id = ${data.id}`;
    } else {
      const status =
        data.action === "approve"
          ? "approved"
          : data.action === "reject"
            ? "rejected"
            : "needs_proof";
      await tx`update submissions set status = ${status}, reviewed_at = now(),
        admin_notes = ${reason + (data.notes ? ": " + data.notes.trim() : "")},
        payout_proof_status = ${data.action === "approve" ? "accepted" : "none"},
        payout_proof_reviewed_at = ${data.action === "approve" ? new Date().toISOString() : null}
        where id = ${data.id}`;
    }
    return { ok: true };
  });
}
