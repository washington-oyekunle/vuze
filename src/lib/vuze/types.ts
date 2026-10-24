export type CampaignType = "ugc" | "clipping";
export type CampaignStatus = "draft" | "live" | "closed";
export type SubmissionStatus =
  | "verifying"
  | "verification_failed"
  | "payment_processing"
  | "under_review"
  | "needs_proof"
  | "approved"
  | "rejected"
  | "paid";
export type PayoutProofStatus = "none" | "pending" | "accepted" | "rejected";
export type ApplicationStatus =
  "pending" | "accepted" | "declined" | "withdrawn";
export type ProfileRole = "creator" | "admin";
export type PayoutWalletStatus =
  "not_set" | "pending" | "verified" | "rejected";

export type TokenAmount = {
  symbol: string;
  mint: string | null;
  decimals: number | null;
  amount: number;
};

export type Profile = {
  userId: string;
  displayName: string;
  handle: string | null;
  bio: string;
  tiktokUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  role: ProfileRole;
  organicVerified: boolean;
  suspended: boolean;
  payoutWalletAddress: string | null;
  payoutWalletStatus: PayoutWalletStatus;
  payoutWalletVerifiedAt: string | null;
};

export type PayoutBatch = {
  id: number;
  batchDate: string;
  asset: string;
  network: string;
  tokenMint: string;
  tokenDecimals: number;
  status: "draft" | "approved" | "processing" | "paid" | "failed";
  totalUnits: number;
  itemCount: number;
  createdAt: string;
};

export type Campaign = {
  id: number;
  title: string;
  brand: string;
  type: CampaignType;
  status: CampaignStatus;
  summary: string;
  brief: string;
  requirements: string;
  payoutLabel: string;
  payoutKind: string;
  payoutRate: number;
  payoutTokenSymbol: string;
  payoutTokenMint: string;
  payoutTokenDecimals: number;
  payoutNetwork: string;
  deadline: string | null;
  organicOnly: boolean;
  maxSubmissions: number | null;
  submissionCount: number;
  minViews: number;
};

export type CampaignApplication = {
  id: number;
  campaignId: number;
  campaignTitle: string;
  campaignBrand: string;
  userId: string;
  creatorName: string;
  pitch: string;
  status: ApplicationStatus;
  adminNotes: string;
  createdAt: string;
  reviewedAt: string | null;
};

export type Submission = {
  id: number;
  campaignId: number;
  campaignTitle: string;
  campaignBrand: string;
  userId: string;
  creatorName: string;
  postUrl: string;
  platform: string;
  payoutWalletAddress: string | null;
  notes: string;
  analyticsUrls: string;
  analyticsProofUrl: string;
  analyticsProofType: string;
  verificationStatus: "pending" | "verified" | "unavailable";
  verificationReason: string;
  verificationSource: string;
  verifiedAt: string | null;
  minViews: number;
  views: number;
  watchTimePct: number | null;
  retentionPct: number | null;
  likes: number;
  commentsCount: number;
  shares: number;
  status: SubmissionStatus;
  estimatedPayout: number;
  payoutTokenSymbol: string;
  payoutTokenMint: string;
  payoutTokenDecimals: number;
  payoutNetwork: string;
  adminNotes: string;
  payoutProofUrl: string;
  payoutProofStatus: PayoutProofStatus;
  payoutProofAdminNotes: string;
  flagged: boolean;
  createdAt: string;
  reviewedAt: string | null;
  paidAt: string | null;
};

export type SubmissionReview = {
  id: number;
  submissionId: number;
  reviewerName: string;
  action: "approve" | "reject" | "needs_proof" | "flag";
  reason: string;
  notes: string;
  createdAt: string;
};

export type Guide = {
  slug: string;
  category: string;
  title: string;
  summary: string;
  body: string;
};

export type AssetItem = {
  id: number;
  title: string;
  kind: string;
  description: string;
  content: string;
};

export type Payout = {
  id: number;
  amount: number;
  tokenSymbol: string;
  tokenMint: string | null;
  tokenDecimals: number | null;
  network: string | null;
  reference: string;
  paidAt: string;
  submissionId: number | null;
  campaignTitle: string | null;
};

export type DashboardStats = {
  activeCampaigns: number;
  pending: number;
  approved: number;
  earnedByAsset: TokenAmount[];
  pendingPayByAsset: TokenAmount[];
};

export type AdminOverview = {
  pendingReview: number;
  liveCampaigns: number;
  paidThisMonthByAsset: TokenAmount[];
  flagged: number;
  creators: number;
};
