import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { num } from "@/lib/utils";
import {
  createSubmission,
  retryVerification,
  reviewSubmission,
} from "./submission-service.server";
import {
  getPayoutAssetOptions,
  getPayoutReadiness,
  paySubmission,
} from "./payout-service.server";
import { reviewPayoutWallet } from "./payout-wallet-review.server";
import type {
  AdminOverview,
  AssetItem,
  Campaign,
  CampaignApplication,
  DashboardStats,
  Guide,
  Payout,
  PayoutBatch,
  Profile,
  Submission,
  SubmissionReview,
  TokenAmount,
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
    payoutTokenSymbol: String(r.payout_token_symbol ?? "UNKNOWN"),
    payoutTokenMint: String(r.payout_token_mint ?? ""),
    payoutTokenDecimals: num(r.payout_token_decimals),
    payoutNetwork: String(r.payout_network ?? "solana-mainnet"),
    deadline: r.deadline ? String(r.deadline) : null,
    organicOnly: Boolean(r.organic_only),
    maxSubmissions: r.max_submissions == null ? null : num(r.max_submissions),
    submissionCount: num(r.submission_count),
    minViews: num(r.min_views ?? 1000),
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
    payoutWalletAddress: r.payout_wallet_address
      ? String(r.payout_wallet_address)
      : null,
    notes: String(r.notes ?? ""),
    analyticsUrls: String(r.analytics_urls ?? ""),
    analyticsProofUrl: String(r.analytics_proof_url ?? ""),
    analyticsProofType: String(r.analytics_proof_type ?? ""),
    verificationStatus: (r.verification_status ??
      "pending") as Submission["verificationStatus"],
    verificationReason: String(r.verification_reason ?? ""),
    verificationSource: String(r.verification_source ?? ""),
    verifiedAt: r.verified_at ? String(r.verified_at) : null,
    minViews: num(r.min_views ?? 1000),
    views: num(r.views),
    watchTimePct: r.watch_time_pct == null ? null : num(r.watch_time_pct),
    retentionPct: r.retention_pct == null ? null : num(r.retention_pct),
    likes: num(r.likes),
    commentsCount: num(r.comments_count),
    shares: num(r.shares),
    status: r.status as Submission["status"],
    estimatedPayout: num(r.estimated_payout),
    payoutTokenSymbol: String(r.payout_token_symbol ?? "UNKNOWN"),
    payoutTokenMint: String(r.payout_token_mint ?? ""),
    payoutTokenDecimals: num(r.payout_token_decimals),
    payoutNetwork: String(r.payout_network ?? "solana-mainnet"),
    adminNotes: String(r.admin_notes ?? ""),
    payoutProofUrl: String(r.payout_proof_url ?? ""),
    payoutProofStatus: (r.payout_proof_status ??
      "none") as Submission["payoutProofStatus"],
    payoutProofAdminNotes: String(r.payout_proof_admin_notes ?? ""),
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

function mapTokenAmounts(rows: Record<string, unknown>[]): TokenAmount[] {
  return rows.map((r) => ({
    symbol: String(r.token_symbol ?? "UNKNOWN"),
    mint: r.token_mint ? String(r.token_mint) : null,
    decimals: r.token_decimals == null ? null : num(r.token_decimals),
    amount: num(r.amount),
  }));
}

async function ensureProfile(userId: string, displayName?: string) {
  const sql = await getSql();
  const existing = await sql<{ user_id: string; role: string }>`
    select user_id, role from profiles where user_id = ${userId}
  `;
  if (existing[0]) {
    return existing[0];
  }
  const admins = await sql<{
    c: number;
  }>`select count(*)::int as c from profiles where role = 'admin'`;
  const configuredAdmins = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const localDemo =
    process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL?.trim();
  const role =
    configuredAdmins.includes(userId) || (localDemo && num(admins[0]?.c) === 0)
      ? "admin"
      : "creator";
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
  c.payout_label, c.payout_kind, c.payout_rate,
  c.payout_token_symbol, c.payout_token_mint, c.payout_token_decimals, c.payout_network,
  c.deadline, c.organic_only,
  c.max_submissions, c.min_views, (select count(*)::int from submissions s where s.campaign_id = c.id) as submission_count
`;

export const listCampaigns = createServerFn({ method: "GET" }).handler(
  async () => {
    const sql = await getSql();
    const list = await sql.query<Record<string, unknown>>(
      `select ${campaignSelect} from campaigns c order by case c.status when 'live' then 0 when 'draft' then 1 else 2 end, c.created_at desc`,
    );
    return list.map(mapCampaign);
  },
);

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

export const adminGetPayoutAssets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    return getPayoutAssetOptions();
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
  .validator(
    z.object({ campaignId: z.number(), pitch: z.string().max(800).optional() }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureProfile(context.userId);
    const profile = await getProfileRow(context.userId);
    if (profile?.suspended)
      throw new Error("This account is suspended from campaigns");

    const campaigns = await sql<Record<string, unknown>>`
      select id, status from campaigns where id = ${data.campaignId}
    `;
    if (!campaigns[0]) throw new Error("Campaign not found");
    if (String(campaigns[0].status) !== "live")
      throw new Error("This campaign is no longer accepting applications");

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
    select user_id, display_name, handle, bio, tiktok_url, instagram_url, youtube_url, role, organic_verified, suspended,
      payout_wallet_address, payout_wallet_status, payout_wallet_verified_at
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
    payoutWalletAddress: r.payout_wallet_address
      ? String(r.payout_wallet_address)
      : null,
    payoutWalletStatus: (r.payout_wallet_status ??
      "not_set") as Profile["payoutWalletStatus"],
    payoutWalletVerifiedAt: r.payout_wallet_verified_at
      ? String(r.payout_wallet_verified_at)
      : null,
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

export const updatePayoutWallet = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      walletAddress: z
        .string()
        .regex(
          /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
          "Enter a valid Solana wallet address",
        ),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureProfile(context.userId);
    await sql`
      update profiles
      set payout_wallet_address = ${data.walletAddress}, payout_wallet_status = 'pending', payout_wallet_verified_at = null
      where user_id = ${context.userId}
    `;
    return getProfileRow(context.userId);
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
    }): Promise<{
      stats: DashboardStats;
      recent: Submission[];
      live: Campaign[];
    }> => {
      await ensureProfile(context.userId);
      const sql = await getSql();
      const pending = await sql<{
        c: number;
      }>`select count(*)::int as c from submissions where user_id = ${context.userId} and status in ('verifying', 'verification_failed', 'under_review', 'needs_proof', 'payment_processing')`;
      const approved = await sql<{
        c: number;
      }>`select count(*)::int as c from submissions where user_id = ${context.userId} and status in ('approved', 'paid')`;
      const earned = await sql<Record<string, unknown>>`
        select token_symbol, token_mint, token_decimals, sum(amount)::text as amount
        from payouts where user_id = ${context.userId}
        group by token_symbol, token_mint, token_decimals order by token_symbol, token_mint
      `;
      const pendingPay = await sql<Record<string, unknown>>`
        select c.payout_token_symbol as token_symbol, c.payout_token_mint as token_mint,
               c.payout_token_decimals as token_decimals,
               sum(s.estimated_payout)::text as amount
        from submissions s join campaigns c on c.id = s.campaign_id
        where s.user_id = ${context.userId} and s.status = 'approved'
        group by c.payout_token_symbol, c.payout_token_mint, c.payout_token_decimals
        order by c.payout_token_symbol, c.payout_token_mint
      `;
      const liveCount = await sql<{
        c: number;
      }>`select count(*)::int as c from campaigns where status = 'live'`;
      const recentRows = await sql.query<Record<string, unknown>>(
        `select s.*, c.title as campaign_title, c.brand as campaign_brand,
                c.payout_token_symbol, c.payout_token_mint, c.payout_token_decimals, c.payout_network,
                p.display_name as creator_name
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
          earnedByAsset: mapTokenAmounts(earned),
          pendingPayByAsset: mapTokenAmounts(pendingPay),
        },
        recent: recentRows.map(mapSubmission),
        live: liveRows.map(mapCampaign),
      };
    },
  );

const submitSchema = z.object({
  campaignId: z.number().int().positive(),
  postUrl: z.string().url(),
  platform: z.enum(["youtube", "tiktok", "instagram"]),
  payoutWalletAddress: z
    .string()
    .trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Enter a valid Solana wallet address"),
  notes: z.string().max(800).optional(),
  proofUploadId: z.string().uuid(),
});

export const submitClip = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(submitSchema)
  .handler(async ({ context, data }) => {
    await ensureProfile(context.userId);
    return createSubmission(await getSql(), context.userId, data);
  });

export const listMySubmissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select s.*, c.title as campaign_title, c.brand as campaign_brand,
              c.payout_token_symbol, c.payout_token_mint, c.payout_token_decimals, c.payout_network,
              p.display_name as creator_name
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
    const owned = await sql.query<{ status: string }>(
      `select status from submissions where id=$1 and user_id=$2`,
      [data.id, context.userId],
    );
    if (owned[0]?.status === "payment_processing")
      await paySubmission(sql, data.id, context.userId, true);
    const rows = await sql.query<Record<string, unknown>>(
      `select s.*, c.title as campaign_title, c.brand as campaign_brand,
              c.payout_token_symbol, c.payout_token_mint, c.payout_token_decimals, c.payout_network,
              p.display_name as creator_name
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
  .handler(async () => {
    throw new Error(
      "Analytics proof is now uploaded with the original submission, not after approval.",
    );
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
      id: z.number().int().positive(),
      proofUploadId: z.string().uuid(),
    }),
  )
  .handler(async ({ context, data }) => {
    return retryVerification(
      await getSql(),
      context.userId,
      data.id,
      data.proofUploadId,
    );
  });

export const retrySubmissionVerification = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.number().int().positive(),
      proofUploadId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    return retryVerification(
      await getSql(),
      context.userId,
      data.id,
      data.proofUploadId,
    );
  });

export const getEarnings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
    }): Promise<{
      payouts: Payout[];
      pendingByAsset: TokenAmount[];
      paidByAsset: TokenAmount[];
    }> => {
      const sql = await getSql();
      const payouts = await sql<Record<string, unknown>>`
      select p.id, p.amount, p.token_symbol, p.token_mint, p.token_decimals, p.network,
             p.reference, p.paid_at, p.submission_id, c.title as campaign_title
      from payouts p
      left join submissions s on s.id = p.submission_id
      left join campaigns c on c.id = s.campaign_id
      where p.user_id = ${context.userId}
      order by p.paid_at desc
    `;
      const pending = await sql<Record<string, unknown>>`
        select c.payout_token_symbol as token_symbol, c.payout_token_mint as token_mint,
               c.payout_token_decimals as token_decimals,
               sum(s.estimated_payout)::text as amount
        from submissions s join campaigns c on c.id = s.campaign_id
        where s.user_id = ${context.userId} and s.status = 'approved'
        group by c.payout_token_symbol, c.payout_token_mint, c.payout_token_decimals
        order by c.payout_token_symbol, c.payout_token_mint
      `;
      const paid = await sql<Record<string, unknown>>`
        select token_symbol, token_mint, token_decimals, sum(amount)::text as amount
        from payouts where user_id = ${context.userId}
        group by token_symbol, token_mint, token_decimals order by token_symbol, token_mint
      `;
      return {
        pendingByAsset: mapTokenAmounts(pending),
        paidByAsset: mapTokenAmounts(paid),
        payouts: payouts.map((r) => ({
          id: num(r.id),
          amount: num(r.amount),
          tokenSymbol: String(r.token_symbol ?? "UNKNOWN"),
          tokenMint: r.token_mint ? String(r.token_mint) : null,
          tokenDecimals: r.token_decimals == null ? null : num(r.token_decimals),
          network: r.network ? String(r.network) : null,
          reference: String(r.reference ?? ""),
          paidAt: String(r.paid_at),
          submissionId: r.submission_id == null ? null : num(r.submission_id),
          campaignTitle: r.campaign_title ? String(r.campaign_title) : null,
        })),
      };
    },
  );

export const listGuides = createServerFn({ method: "GET" }).handler(
  async () => {
    const sql = await getSql();
    return sql<Guide>`
    select slug, category, title, summary, body from guides order by sort_order
  `;
  },
);

export const getGuide = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows =
      await sql<Guide>`select slug, category, title, summary, body from guides where slug = ${data.slug}`;
    return rows[0] ?? null;
  });

export const listAssets = createServerFn({ method: "GET" }).handler(
  async (): Promise<AssetItem[]> => {
    const sql = await getSql();
    const rows = await sql<
      Record<string, unknown>
    >`select id, title, kind, description, content from assets order by id`;
    return rows.map((r) => ({
      id: num(r.id),
      title: String(r.title),
      kind: String(r.kind),
      description: String(r.description),
      content: String(r.content),
    }));
  },
);

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminOverview> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const pending = await sql<{
      c: number;
    }>`select count(*)::int as c from submissions where status in ('under_review', 'needs_proof') and verification_status = 'verified'`;
    const live = await sql<{
      c: number;
    }>`select count(*)::int as c from campaigns where status = 'live'`;
    const paid = await sql<Record<string, unknown>>`
      select token_symbol, token_mint, token_decimals, sum(amount)::text as amount
      from payouts where paid_at >= date_trunc('month', now())
      group by token_symbol, token_mint, token_decimals order by token_symbol, token_mint
    `;
    const flagged = await sql<{
      c: number;
    }>`select count(*)::int as c from submissions where flagged = true`;
    const creators = await sql<{
      c: number;
    }>`select count(*)::int as c from profiles`;
    return {
      pendingReview: num(pending[0]?.c),
      liveCampaigns: num(live[0]?.c),
      paidThisMonthByAsset: mapTokenAmounts(paid),
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
      `select s.*, c.title as campaign_title, c.brand as campaign_brand,
              c.payout_token_symbol, c.payout_token_mint, c.payout_token_decimals, c.payout_network,
              p.display_name as creator_name
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
      `select s.*, c.title as campaign_title, c.brand as campaign_brand,
              c.payout_token_symbol, c.payout_token_mint, c.payout_token_decimals, c.payout_network,
              p.display_name as creator_name
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
    if (data.action === "approve") {
      const readiness = getPayoutReadiness();
      if (!readiness.enabled)
        throw new Error(`Automatic payout is unavailable: ${readiness.reason}`);
    }
    const sql = await getSql();
    const review = await reviewSubmission(sql, context.userId, data);
    if (data.action !== "approve") return review;
    const payout = await paySubmission(sql, data.id, context.userId);
    return { ...review, payout };
  });

export const adminGetPayoutReadiness = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    return getPayoutReadiness();
  });

export const adminPaySubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ submissionId: z.number().int().positive() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    return paySubmission(await getSql(), data.submissionId, context.userId);
  });

/** Reconcile an existing app request; retries keep its original key and payload. */
export const adminReconcilePayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ submissionId: z.number().int().positive() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const existing =
      await sql`select id from direct_payout_requests where submission_id = ${data.submissionId}`;
    if (!existing[0])
      throw new Error("No existing payment request to reconcile");
    return paySubmission(sql, data.submissionId, context.userId, true);
  });

export const adminReviewPayoutProof = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      submissionId: z.number(),
      action: z.enum(["accept", "reject"]),
      notes: z.string().max(600).optional(),
    }),
  )
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    throw new Error(
      "Proof is reviewed together with the submission. The separate payout-proof review is retired.",
    );
  });

export const adminReviewPayoutWallet = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      userId: z.string().min(1),
      walletAddress: z
        .string()
        .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Enter a valid Solana wallet address"),
      action: z.enum(["verify", "reject"]),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    return reviewPayoutWallet(
      sql,
      context.userId,
      data.userId,
      data.walletAddress,
      data.action,
    );
  });

/** Legacy write paths are deliberately closed; historical tables stay readable. */
export const adminPrepareUsd1Batch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PayoutBatch> => {
    await requireAdmin(context.userId);
    throw new Error(
      "Friday batches are retired; payouts are now per submission in the campaign token.",
    );
  });

export const adminApproveUsd1Batch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ batchId: z.number() }))
  .handler(async ({ context }): Promise<PayoutBatch> => {
    await requireAdmin(context.userId);
    throw new Error(
      "Legacy batches are audit-only. Reconcile reservations before direct payout.",
    );
  });

export const adminMarkPaid = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ submissionId: z.number(), reference: z.string().max(120) }),
  )
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    throw new Error(
      "Manual mark-paid is disabled. Only a finalized, verified Solana-token transfer closes an entry.",
    );
  });

export const adminListPayouts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<Record<string, unknown>>`
      select p.id, p.user_id, p.amount, p.token_symbol, p.token_mint, p.token_decimals, p.network,
             p.reference, p.paid_at, p.submission_id,
             pr.display_name as creator_name, c.title as campaign_title
      from payouts p
      left join profiles pr on pr.user_id = p.user_id
      left join submissions s on s.id = p.submission_id
      left join campaigns c on c.id = s.campaign_id
      order by p.paid_at desc
    `;
    const pending = await sql.query<Record<string, unknown>>(
      `select s.*, c.title as campaign_title, c.brand as campaign_brand,
              c.payout_token_symbol, c.payout_token_mint, c.payout_token_decimals, c.payout_network,
              p.display_name as creator_name
       from submissions s
       join campaigns c on c.id = s.campaign_id
       join profiles p on p.user_id = s.user_id
       where s.status in ('approved', 'payment_processing')
       order by s.reviewed_at desc`,
    );
    return {
      history: rows.map((r) => ({
        id: num(r.id),
        userId: String(r.user_id),
        creatorName: String(r.creator_name ?? ""),
        amount: num(r.amount),
        tokenSymbol: String(r.token_symbol ?? "UNKNOWN"),
        tokenMint: r.token_mint ? String(r.token_mint) : null,
        tokenDecimals: r.token_decimals == null ? null : num(r.token_decimals),
        network: r.network ? String(r.network) : null,
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
        p.payout_wallet_address, p.payout_wallet_status
      from profiles p
      order by p.created_at desc
    `;
    const totals = await sql<Record<string, unknown>>`
      select user_id, token_symbol, token_mint, token_decimals, sum(amount)::text as amount
      from payouts group by user_id, token_symbol, token_mint, token_decimals
      order by user_id, token_symbol, token_mint
    `;
    const totalsByUser = new Map<string, Record<string, unknown>[]>();
    for (const total of totals) {
      const userId = String(total.user_id);
      totalsByUser.set(userId, [...(totalsByUser.get(userId) ?? []), total]);
    }
    return rows.map((r) => ({
      userId: String(r.user_id),
      displayName: String(r.display_name),
      handle: r.handle ? String(r.handle) : null,
      role: String(r.role),
      organicVerified: Boolean(r.organic_verified),
      suspended: Boolean(r.suspended),
      submissions: num(r.submissions),
      earnedByAsset: mapTokenAmounts(totalsByUser.get(String(r.user_id)) ?? []),
      payoutWalletAddress: r.payout_wallet_address
        ? String(r.payout_wallet_address)
        : null,
      payoutWalletStatus: String(r.payout_wallet_status ?? "not_set"),
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
      payoutTokenSymbol: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,15}$/),
      payoutTokenMint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
      payoutTokenDecimals: z.number().int().min(0).max(18),
      organicOnly: z.boolean(),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const asset = getPayoutAssetOptions().find(
      (candidate) =>
        candidate.symbol === data.payoutTokenSymbol &&
        candidate.mint === data.payoutTokenMint &&
        candidate.decimals === data.payoutTokenDecimals,
    );
    if (!asset)
      throw new Error("Choose a payout token from the configured Solana allowlist.");
    if (data.id) {
      const existing = await sql<{
        payout_token_symbol: string;
        payout_token_mint: string;
        payout_token_decimals: number;
        payout_network: string;
      }>`select payout_token_symbol, payout_token_mint, payout_token_decimals, payout_network from campaigns where id = ${data.id}`;
      if (!existing[0]) throw new Error("Campaign not found");
      const submissions = await sql<{ count: number }>`select count(*)::int as count from submissions where campaign_id = ${data.id}`;
      if (
        num(submissions[0]?.count) > 0 &&
        (existing[0].payout_token_symbol !== asset.symbol ||
          existing[0].payout_token_mint !== asset.mint ||
          num(existing[0].payout_token_decimals) !== asset.decimals ||
          existing[0].payout_network !== asset.network)
      )
        throw new Error("A campaign's payout token cannot change after submissions exist.");
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
          payout_token_symbol = ${asset.symbol},
          payout_token_mint = ${asset.mint},
          payout_token_decimals = ${asset.decimals},
          payout_network = ${asset.network},
          organic_only = ${data.organicOnly}
        where id = ${data.id}
      `;
      return { id: data.id };
    }
    const rows = await sql<{ id: number }>`
      insert into campaigns (
        title, brand, type, status, summary, brief, requirements,
        payout_label, payout_kind, payout_rate, payout_token_symbol,
        payout_token_mint, payout_token_decimals, payout_network, organic_only, created_by
      ) values (
        ${data.title}, ${data.brand}, ${data.type}, ${data.status}, ${data.summary},
        ${data.brief}, ${data.requirements}, ${data.payoutLabel}, ${data.payoutKind},
        ${data.payoutRate}, ${asset.symbol}, ${asset.mint}, ${asset.decimals},
        ${asset.network}, ${data.organicOnly}, ${context.userId}
      ) returning id
    `;
    return { id: num(rows[0]?.id) };
  });
