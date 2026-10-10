import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { num } from "@/lib/utils";
import type {
  AdminOverview,
  AssetItem,
  Campaign,
  CampaignApplication,
  DashboardStats,
  Guide,
  Payout,
  Profile,
  Submission,
  SubmissionReview,
} from "./types";

function mapCampaign(r: Record<string, unknown>): Campaign {
  return {
    id: num(r.id),
    title: String(r.title),
    brand: String(r.brand),
    type: r.type as Campaign["type"],
    status: r.status as Campaign["status"],
    summary: String(r.summary),
    brief: String(r.brief),
    requirements: String(r.requirements),
    payoutLabel: String(r.payout_label),
    payoutKind: String(r.payout_kind),
    payoutRate: num(r.payout_rate),
    deadline: r.deadline ? String(r.deadline) : null,
    organicOnly: Boolean(r.organic_only),
    maxSubmissions: r.max_submissions == null ? null : num(r.max_submissions),
    submissionCount: num(r.submission_count),
  };
}

function mapApplication(r: Record<string, unknown>): CampaignApplication {
  return {
    id: num(r.id),
    campaignId: num(r.campaign_id),
    campaignTitle: String(r.campaign_title ?? ""),
    campaignBrand: String(r.campaign_brand ?? ""),
    userId: String(r.user_id),
    creatorName: String(r.creator_name ?? ""),
    pitch: String(r.pitch ?? ""),
    status: r.status as CampaignApplication["status"],
    adminNotes: String(r.admin_notes ?? ""),
    createdAt: String(r.created_at),
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
  };
}

function mapSubmission(r: Record<string, unknown>): Submission {
  return {
    id: num(r.id),
    campaignId: num(r.campaign_id),
    campaignTitle: String(r.campaign_title ?? ""),
    campaignBrand: String(r.campaign_brand ?? ""),
    userId: String(r.user_id),
    creatorName: String(r.creator_name ?? ""),
    postUrl: String(r.post_url),
    platform: String(r.platform),
    notes: String(r.notes ?? ""),
    analyticsUrls: String(r.analytics_urls ?? ""),
    views: num(r.views),
    watchTimePct: r.watch_time_pct == null ? null : num(r.watch_time_pct),
    retentionPct: r.retention_pct == null ? null : num(r.retention_pct),
    likes: num(r.likes),
    commentsCount: num(r.comments_count),
    shares: num(r.shares),
    status: r.status as Submission["status"],
    estimatedPayout: num(r.estimated_payout),
    adminNotes: String(r.admin_notes ?? ""),
    payoutProofUrl: String(r.payout_proof_url ?? ""),
    flagged: Boolean(r.flagged),
    createdAt: String(r.created_at),
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
    paidAt: r.paid_at ? String(r.paid_at) : null,
  };
}

function mapSubmissionReview(r: Record<string, unknown>): SubmissionReview {
  return {
    id: num(r.id),
    submissionId: num(r.submission_id),
    reviewerName: String(r.reviewer_name ?? "VUZE desk"),
    action: r.action as SubmissionReview["action"],
    reason: String(r.reason ?? ""),
    notes: String(r.notes ?? ""),
    createdAt: String(r.created_at),
  };
}

function estimatePayout(kind: string, rate: number, views: number) {
  if (kind === "flat") return rate;
  if (kind === "per_1k") return (views / 1000) * rate;
  return 0;
}

async function ensureProfile(userId: string, displayName?: string) {
  const sql = await getSql();
  const existing = await sql<{ user_id: string; role: string }>`
    select user_id, role from profiles where user_id = ${userId}
  `;
  if (existing[0]) {
    return existing[0];
  }
  const admins = await sql<{ c: number }>`select count(*)::int as c from profiles where role = 'admin'`;
  const role = num(admins[0]?.c) === 0 ? "admin" : "creator";
  const name = displayName?.trim() || "Creator";
  await sql`
    insert into profiles (user_id, display_name, role)
    values (${userId}, ${name}, ${role})
  `;
  return { user_id: userId, role };
}

async function requireAdmin(userId: string) {
  const row = await ensureProfile(userId);
  if (row.role !== "admin") {
    throw new Error("Admin only");
  }
}

const campaignSelect = `
  c.id, c.title, c.brand, c.type, c.status, c.summary, c.brief, c.requirements,
  c.payout_label, c.payout_kind, c.payout_rate, c.deadline, c.organic_only,
  c.max_submissions, (select count(*)::int from submissions s where s.campaign_id = c.id) as submission_count
`;

export const listCampaigns = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const list = await sql.query<Record<string, unknown>>(
    `select ${campaignSelect} from campaigns c order by case c.status when 'live' then 0 when 'draft' then 1 else 2 end, c.created_at desc`,
  );
  return list.map(mapCampaign);
});

export const getCampaign = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const list = await sql.query<Record<string, unknown>>(
      `select ${campaignSelect} from campaigns c where c.id = $1`,
      [data.id],
    );
    return list[0] ? mapCampaign(list[0]) : null;
  });

const applicationSelect = `
  a.id, a.campaign_id, a.user_id, a.pitch, a.status, a.admin_notes, a.created_at, a.reviewed_at,
  c.title as campaign_title, c.brand as campaign_brand, p.display_name as creator_name
`;

export const getMyCampaignApplication = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ campaignId: z.number() }))
  .handler(async ({ context, data }): Promise<CampaignApplication | null> => {
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select ${applicationSelect}
       from campaign_applications a
       join campaigns c on c.id = a.campaign_id
       join profiles p on p.user_id = a.user_id
       where a.campaign_id = $1 and a.user_id = $2`,
      [data.campaignId, context.userId],
    );
    return rows[0] ? mapApplication(rows[0]) : null;
  });

export const listMyApplications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CampaignApplication[]> => {
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select ${applicationSelect}
       from campaign_applications a
       join campaigns c on c.id = a.campaign_id
       join profiles p on p.user_id = a.user_id
       where a.user_id = $1
       order by a.created_at desc`,
      [context.userId],
    );
    return rows.map(mapApplication);
  });

export const applyToCampaign = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ campaignId: z.number(), pitch: z.string().max(800).optional() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureProfile(context.userId);
    const profile = await getProfileRow(context.userId);
    if (profile?.suspended) throw new Error("This account is suspended from campaigns");

    const campaigns = await sql<Record<string, unknown>>`
      select id, status from campaigns where id = ${data.campaignId}
    `;
    if (!campaigns[0]) throw new Error("Campaign not found");
    if (String(campaigns[0].status) !== "live") throw new Error("This campaign is no longer accepting applications");

    const existing = await sql<{ id: number; status: string }>`
      select id, status from campaign_applications
      where campaign_id = ${data.campaignId} and user_id = ${context.userId}
    `;
    if (existing[0] && existing[0].status !== "withdrawn") {
      throw new Error("You have already applied to this campaign");
    }

    if (existing[0]) {
      await sql`
        update campaign_applications
        set pitch = ${data.pitch?.trim() ?? ""}, status = 'pending', admin_notes = '', reviewed_at = null, reviewed_by = null, created_at = now()
        where id = ${existing[0].id}
      `;
      return { id: num(existing[0].id) };
    }

    const rows = await sql<{ id: number }>`
      insert into campaign_applications (campaign_id, user_id, pitch)
      values (${data.campaignId}, ${context.userId}, ${data.pitch?.trim() ?? ""})
      returning id
    `;
    return { id: num(rows[0]?.id) };
  });

export const bootstrapMe = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ displayName: z.string().optional() }))
  .handler(async ({ context, data }) => {
    await ensureProfile(context.userId, data.displayName);
    return getProfileRow(context.userId);
  });

async function getProfileRow(userId: string): Promise<Profile | null> {
  const sql = await getSql();
  const rows = await sql<Record<string, unknown>>`
    select user_id, display_name, handle, bio, tiktok_url, instagram_url, youtube_url, role, organic_verified, suspended
    from profiles where user_id = ${userId}
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    userId: String(r.user_id),
    displayName: String(r.display_name),
    handle: r.handle ? String(r.handle) : null,
    bio: String(r.bio ?? ""),
    tiktokUrl: r.tiktok_url ? String(r.tiktok_url) : null,
    instagramUrl: r.instagram_url ? String(r.instagram_url) : null,
    youtubeUrl: r.youtube_url ? String(r.youtube_url) : null,
    role: r.role as Profile["role"],
    organicVerified: Boolean(r.organic_verified),
    suspended: Boolean(r.suspended),
  };
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureProfile(context.userId);
    return getProfileRow(context.userId);
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      displayName: z.string().min(1).max(80),
      handle: z.string().max(40).optional(),
      bio: z.string().max(400).optional(),
      tiktokUrl: z.string().max(200).optional(),
      instagramUrl: z.string().max(200).optional(),
      youtubeUrl: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureProfile(context.userId, data.displayName);
    await sql`
      update profiles set
        display_name = ${data.displayName},
        handle = ${data.handle || null},
        bio = ${data.bio || ""},
        tiktok_url = ${data.tiktokUrl || null},
        instagram_url = ${data.instagramUrl || null},
        youtube_url = ${data.youtubeUrl || null}
      where user_id = ${context.userId}
    `;
    return getProfileRow(context.userId);
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ stats: DashboardStats; recent: Submission[]; live: Campaign[] }> => {
    await ensureProfile(context.userId);
    const sql = await getSql();
    const pending = await sql<{ c: number }>`select count(*)::int as c from submissions where user_id = ${context.userId} and status in ('under_review', 'needs_proof')`;
    const approved = await sql<{ c: number }>`select count(*)::int as c from submissions where user_id = ${context.userId} and status in ('approved', 'paid')`;
    const earned = await sql<{ s: string }>`select coalesce(sum(amount),0)::text as s from payouts where user_id = ${context.userId}`;
    const pendingPay = await sql<{ s: string }>`select coalesce(sum(estimated_payout),0)::text as s from submissions where user_id = ${context.userId} and status = 'approved'`;
    const liveCount = await sql<{ c: number }>`select count(*)::int as c from campaigns where status = 'live'`;
    const recentRows = await sql.query<Record<string, unknown>>(
      `select s.*, c.title as campaign_title, c.brand as campaign_brand, p.display_name as creator_name
       from submissions s
       join campaigns c on c.id = s.campaign_id
       join profiles p on p.user_id = s.user_id
       where s.user_id = $1
       order by s.created_at desc limit 6`,
      [context.userId],
    );
    const liveRows = await sql.query<Record<string, unknown>>(
      `select ${campaignSelect} from campaigns c where c.status = 'live' order by c.created_at desc`,
    );
    return {
      stats: {
        activeCampaigns: num(liveCount[0]?.c),
        pending: num(pending[0]?.c),
        approved: num(approved[0]?.c),
        earned: num(earned[0]?.s),
        pendingPay: num(pendingPay[0]?.s),
      },
      recent: recentRows.map(mapSubmission),
      live: liveRows.map(mapCampaign),
    };
  });

const submitSchema = z.object({
  campaignId: z.number(),
  postUrl: z.string().url(),
  platform: z.string().min(2),
  notes: z.string().max(800).optional(),
  analyticsUrls: z.string().max(1200).optional(),
  views: z.number().int().min(0),
  watchTimePct: z.number().min(0).max(100).optional(),
  retentionPct: z.number().min(0).max(100).optional(),
  likes: z.number().int().min(0),
  commentsCount: z.number().int().min(0),
  shares: z.number().int().min(0),
});

export const submitClip = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(submitSchema)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureProfile(context.userId);
    const profile = await getProfileRow(context.userId);
    if (profile?.suspended) throw new Error("This account is suspended from campaigns");

    const camp = await sql<Record<string, unknown>>`select * from campaigns where id = ${data.campaignId}`;
    const campaign = camp[0];
    if (!campaign) throw new Error("Campaign not found");
    if (String(campaign.status) !== "live") throw new Error("Campaign is closed");

    const dup = await sql<{ c: number }>`
      select count(*)::int as c from submissions
      where campaign_id = ${data.campaignId} and post_url = ${data.postUrl}
    `;
    if (num(dup[0]?.c) > 0) throw new Error("This link is already submitted to this campaign");

    if (data.watchTimePct == null && data.retentionPct == null) {
      throw new Error("Retention or average watch time is required. Views alone are not accepted.");
    }

    const payout = estimatePayout(String(campaign.payout_kind), num(campaign.payout_rate), data.views);
    const rows = await sql<{ id: number }>`
      insert into submissions (
        campaign_id, user_id, post_url, platform, notes, analytics_urls,
        views, watch_time_pct, retention_pct, likes, comments_count, shares,
        estimated_payout, status
      ) values (
        ${data.campaignId}, ${context.userId}, ${data.postUrl}, ${data.platform},
        ${data.notes ?? ""}, ${data.analyticsUrls ?? ""},
        ${data.views}, ${data.watchTimePct ?? null}, ${data.retentionPct ?? null},
        ${data.likes}, ${data.commentsCount}, ${data.shares},
        ${payout}, 'under_review'
      ) returning id
    `;
    return { id: num(rows[0]?.id) };
  });

export const listMySubmissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select s.*, c.title as campaign_title, c.brand as campaign_brand, p.display_name as creator_name
       from submissions s
       join campaigns c on c.id = s.campaign_id
       join profiles p on p.user_id = s.user_id
       where s.user_id = $1
       order by s.created_at desc`,
      [context.userId],
    );
    return rows.map(mapSubmission);
  });

export const getMySubmission = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select s.*, c.title as campaign_title, c.brand as campaign_brand, p.display_name as creator_name
       from submissions s
       join campaigns c on c.id = s.campaign_id
       join profiles p on p.user_id = s.user_id
       where s.id = $1 and s.user_id = $2`,
      [data.id, context.userId],
    );
    return rows[0] ? mapSubmission(rows[0]) : null;
  });

export const submitPayoutProof = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number(), payoutProofUrl: z.string().url() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<Record<string, unknown>>`
      select id, status from submissions where id = ${data.id} and user_id = ${context.userId}
    `;
    if (!rows[0]) throw new Error("Submission not found");
    if (String(rows[0].status) !== "approved") throw new Error("Payout proof is available after approval");
    await sql`
      update submissions set payout_proof_url = ${data.payoutProofUrl}
      where id = ${data.id} and user_id = ${context.userId}
    `;
    return { ok: true };
  });

export const getSubmissionReviews = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number() }))
  .handler(async ({ context, data }): Promise<SubmissionReview[]> => {
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select r.*, p.display_name as reviewer_name
       from submission_reviews r
       left join profiles p on p.user_id = r.reviewer_id
       join submissions s on s.id = r.submission_id
       where r.submission_id = $1 and s.user_id = $2
       order by r.created_at desc`,
      [data.id, context.userId],
    );
    return rows.map(mapSubmissionReview);
  });

export const resubmitProof = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.number(),
      analyticsUrls: z.string().max(1200),
      views: z.number().int().min(0),
      watchTimePct: z.number().min(0).max(100).optional(),
      retentionPct: z.number().min(0).max(100).optional(),
      likes: z.number().int().min(0),
      commentsCount: z.number().int().min(0),
      shares: z.number().int().min(0),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const camp = await sql<Record<string, unknown>>`
      select c.payout_kind, c.payout_rate, s.status
      from submissions s join campaigns c on c.id = s.campaign_id
      where s.id = ${data.id} and s.user_id = ${context.userId}
    `;
    if (!camp[0]) throw new Error("Not found");
    if (!["needs_proof", "rejected", "under_review"].includes(String(camp[0].status))) {
      throw new Error("This submission can no longer be updated");
    }
    const payout = estimatePayout(String(camp[0].payout_kind), num(camp[0].payout_rate), data.views);
    await sql`
      update submissions set
        analytics_urls = ${data.analyticsUrls},
        views = ${data.views},
        watch_time_pct = ${data.watchTimePct ?? null},
        retention_pct = ${data.retentionPct ?? null},
        likes = ${data.likes},
        comments_count = ${data.commentsCount},
        shares = ${data.shares},
        estimated_payout = ${payout},
        status = 'under_review'
      where id = ${data.id} and user_id = ${context.userId}
    `;
    return { ok: true };
  });

export const getEarnings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ payouts: Payout[]; pending: number; paid: number }> => {
    const sql = await getSql();
    const payouts = await sql<Record<string, unknown>>`
      select p.id, p.amount, p.reference, p.paid_at, p.submission_id, c.title as campaign_title
      from payouts p
      left join submissions s on s.id = p.submission_id
      left join campaigns c on c.id = s.campaign_id
      where p.user_id = ${context.userId}
      order by p.paid_at desc
    `;
    const pending = await sql<{ s: string }>`select coalesce(sum(estimated_payout),0)::text as s from submissions where user_id = ${context.userId} and status = 'approved'`;
    const paid = await sql<{ s: string }>`select coalesce(sum(amount),0)::text as s from payouts where user_id = ${context.userId}`;
    return {
      pending: num(pending[0]?.s),
      paid: num(paid[0]?.s),
      payouts: payouts.map((r) => ({
        id: num(r.id),
        amount: num(r.amount),
        reference: String(r.reference ?? ""),
        paidAt: String(r.paid_at),
        submissionId: r.submission_id == null ? null : num(r.submission_id),
        campaignTitle: r.campaign_title ? String(r.campaign_title) : null,
      })),
    };
  });

export const listGuides = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  return sql<Guide>`
    select slug, category, title, summary, body from guides order by sort_order
  `;
});

export const getGuide = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<Guide>`select slug, category, title, summary, body from guides where slug = ${data.slug}`;
    return rows[0] ?? null;
  });

export const listAssets = createServerFn({ method: "GET" }).handler(async (): Promise<AssetItem[]> => {
  const sql = await getSql();
  const rows = await sql<Record<string, unknown>>`select id, title, kind, description, content from assets order by id`;
  return rows.map((r) => ({
    id: num(r.id),
    title: String(r.title),
    kind: String(r.kind),
    description: String(r.description),
    content: String(r.content),
  }));
});

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminOverview> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const pending = await sql<{ c: number }>`select count(*)::int as c from submissions where status in ('under_review', 'needs_proof')`;
    const live = await sql<{ c: number }>`select count(*)::int as c from campaigns where status = 'live'`;
    const paid = await sql<{ s: string }>`select coalesce(sum(amount),0)::text as s from payouts where paid_at >= date_trunc('month', now())`;
    const flagged = await sql<{ c: number }>`select count(*)::int as c from submissions where flagged = true`;
    const creators = await sql<{ c: number }>`select count(*)::int as c from profiles`;
    return {
      pendingReview: num(pending[0]?.c),
      liveCampaigns: num(live[0]?.c),
      paidThisMonth: num(paid[0]?.s),
      flagged: num(flagged[0]?.c),
      creators: num(creators[0]?.c),
    };
  });

export const adminListApplications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ status: z.string().optional() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select ${applicationSelect}
       from campaign_applications a
       join campaigns c on c.id = a.campaign_id
       join profiles p on p.user_id = a.user_id
       where ($1::text is null or a.status = $1)
       order by a.created_at desc`,
      [data.status ?? null],
    );
    return rows.map(mapApplication);
  });

export const adminReviewApplication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.number(),
      action: z.enum(["accept", "decline"]),
      notes: z.string().max(600).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const status = data.action === "accept" ? "accepted" : "declined";
    const rows = await sql<{ id: number }>`
      update campaign_applications
      set status = ${status}, admin_notes = ${data.notes?.trim() ?? ""}, reviewed_at = now(), reviewed_by = ${context.userId}
      where id = ${data.id} and status = 'pending'
      returning id
    `;
    if (!rows[0]) throw new Error("Application is no longer pending");
    return { ok: true };
  });

export const adminListSubmissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      status: z.string().optional(),
      flagged: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select s.*, c.title as campaign_title, c.brand as campaign_brand, p.display_name as creator_name
       from submissions s
       join campaigns c on c.id = s.campaign_id
       join profiles p on p.user_id = s.user_id
       where ($1::text is null or s.status = $1)
         and ($2::boolean is null or s.flagged = $2)
       order by s.created_at desc`,
      [data.status ?? null, data.flagged ?? null],
    );
    return rows.map(mapSubmission);
  });

export const adminGetSubmission = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select s.*, c.title as campaign_title, c.brand as campaign_brand, p.display_name as creator_name
       from submissions s
       join campaigns c on c.id = s.campaign_id
       join profiles p on p.user_id = s.user_id
       where s.id = $1`,
      [data.id],
    );
    return rows[0] ? mapSubmission(rows[0]) : null;
  });

export const adminGetSubmissionReviews = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number() }))
  .handler(async ({ context, data }): Promise<SubmissionReview[]> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select r.*, p.display_name as reviewer_name
       from submission_reviews r
       left join profiles p on p.user_id = r.reviewer_id
       where r.submission_id = $1
       order by r.created_at desc`,
      [data.id],
    );
    return rows.map(mapSubmissionReview);
  });

export const adminReviewSubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.number(),
      action: z.enum(["approve", "reject", "needs_proof", "flag"]),
      reason: z.string().max(120).optional(),
      notes: z.string().max(600).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    await sql`
      insert into submission_reviews (submission_id, reviewer_id, action, reason, notes)
      values (${data.id}, ${context.userId}, ${data.action}, ${data.reason ?? ""}, ${data.notes ?? ""})
    `;
    if (data.action === "flag") {
      await sql`update submissions set flagged = true, admin_notes = ${data.notes ?? ""} where id = ${data.id}`;
      return { ok: true };
    }
    const status =
      data.action === "approve" ? "approved" : data.action === "reject" ? "rejected" : "needs_proof";
    await sql`
      update submissions set
        status = ${status},
        admin_notes = ${data.notes ?? ""},
        reviewed_at = now(),
        flagged = ${data.action === "reject"}
      where id = ${data.id}
    `;
    return { ok: true };
  });

export const adminMarkPaid = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      submissionId: z.number(),
      reference: z.string().max(120),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    if (new Date().getDay() !== 5) throw new Error("Payouts are processed every Friday");
    const sql = await getSql();
    const rows = await sql<Record<string, unknown>>`
      select id, user_id, estimated_payout, status, payout_proof_url from submissions where id = ${data.submissionId}
    `;
    const s = rows[0];
    if (!s) throw new Error("Not found");
    if (String(s.status) !== "approved") throw new Error("Only approved submissions can be paid");
    if (!String(s.payout_proof_url ?? "")) throw new Error("Creator must submit an analytics screen recording before payout");
    const alreadyPaid = await sql<{ c: number }>`select count(*)::int as c from payouts where submission_id = ${data.submissionId}`;
    if (num(alreadyPaid[0]?.c) > 0) throw new Error("This video has already been paid");
    await sql`
      insert into payouts (user_id, submission_id, amount, reference)
      values (${String(s.user_id)}, ${data.submissionId}, ${num(s.estimated_payout)}, ${data.reference})
    `;
    await sql`update submissions set status = 'paid', paid_at = now() where id = ${data.submissionId}`;
    return { ok: true };
  });

export const adminListPayouts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<Record<string, unknown>>`
      select p.id, p.user_id, p.amount, p.reference, p.paid_at, p.submission_id,
             pr.display_name as creator_name, c.title as campaign_title
      from payouts p
      left join profiles pr on pr.user_id = p.user_id
      left join submissions s on s.id = p.submission_id
      left join campaigns c on c.id = s.campaign_id
      order by p.paid_at desc
    `;
    const pending = await sql.query<Record<string, unknown>>(
      `select s.*, c.title as campaign_title, c.brand as campaign_brand, p.display_name as creator_name
       from submissions s
       join campaigns c on c.id = s.campaign_id
       join profiles p on p.user_id = s.user_id
       where s.status = 'approved' and s.payout_proof_url <> ''
       order by s.reviewed_at desc`,
    );
    return {
      history: rows.map((r) => ({
        id: num(r.id),
        userId: String(r.user_id),
        creatorName: String(r.creator_name ?? ""),
        amount: num(r.amount),
        reference: String(r.reference ?? ""),
        paidAt: String(r.paid_at),
        submissionId: r.submission_id == null ? null : num(r.submission_id),
        campaignTitle: r.campaign_title ? String(r.campaign_title) : null,
      })),
      pending: pending.map(mapSubmission),
    };
  });

export const adminListCreators = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<Record<string, unknown>>`
      select p.*,
        (select count(*)::int from submissions s where s.user_id = p.user_id) as submissions,
        (select coalesce(sum(amount),0)::text from payouts x where x.user_id = p.user_id) as earned
      from profiles p
      order by p.created_at desc
    `;
    return rows.map((r) => ({
      userId: String(r.user_id),
      displayName: String(r.display_name),
      handle: r.handle ? String(r.handle) : null,
      role: String(r.role),
      organicVerified: Boolean(r.organic_verified),
      suspended: Boolean(r.suspended),
      submissions: num(r.submissions),
      earned: num(r.earned),
    }));
  });

export const adminUpdateCreator = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      userId: z.string(),
      suspended: z.boolean().optional(),
      organicVerified: z.boolean().optional(),
      role: z.enum(["creator", "admin"]).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    if (data.suspended != null) {
      await sql`update profiles set suspended = ${data.suspended} where user_id = ${data.userId}`;
    }
    if (data.organicVerified != null) {
      await sql`update profiles set organic_verified = ${data.organicVerified} where user_id = ${data.userId}`;
    }
    if (data.role) {
      await sql`update profiles set role = ${data.role} where user_id = ${data.userId}`;
    }
    return { ok: true };
  });

export const adminSaveCampaign = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.number().optional(),
      title: z.string().min(2),
      brand: z.string().min(1),
      type: z.enum(["ugc", "clipping"]),
      status: z.enum(["draft", "live", "closed"]),
      summary: z.string().min(8),
      brief: z.string().min(8),
      requirements: z.string().min(8),
      payoutLabel: z.string().min(2),
      payoutKind: z.enum(["per_1k", "flat"]),
      payoutRate: z.number().min(0),
      organicOnly: z.boolean(),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    if (data.id) {
      await sql`
        update campaigns set
          title = ${data.title},
          brand = ${data.brand},
          type = ${data.type},
          status = ${data.status},
          summary = ${data.summary},
          brief = ${data.brief},
          requirements = ${data.requirements},
          payout_label = ${data.payoutLabel},
          payout_kind = ${data.payoutKind},
          payout_rate = ${data.payoutRate},
          organic_only = ${data.organicOnly}
        where id = ${data.id}
      `;
      return { id: data.id };
    }
    const rows = await sql<{ id: number }>`
      insert into campaigns (
        title, brand, type, status, summary, brief, requirements,
        payout_label, payout_kind, payout_rate, organic_only, created_by
      ) values (
        ${data.title}, ${data.brand}, ${data.type}, ${data.status}, ${data.summary},
        ${data.brief}, ${data.requirements}, ${data.payoutLabel}, ${data.payoutKind},
        ${data.payoutRate}, ${data.organicOnly}, ${context.userId}
      ) returning id
    `;
    return { id: num(rows[0]?.id) };
  });
