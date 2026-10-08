export type CampaignType = "ugc" | "clipping";
export type CampaignStatus = "draft" | "live" | "closed";
export type SubmissionStatus =
  | "under_review"
  | "needs_proof"
  | "approved"
  | "rejected"
  | "paid";
export type ProfileRole = "creator" | "admin";

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
  deadline: string | null;
  organicOnly: boolean;
  maxSubmissions: number | null;
  submissionCount: number;
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
  notes: string;
  analyticsUrls: string;
  views: number;
  watchTimePct: number | null;
  retentionPct: number | null;
  likes: number;
  commentsCount: number;
  shares: number;
  status: SubmissionStatus;
  estimatedPayout: number;
  adminNotes: string;
  flagged: boolean;
  createdAt: string;
  reviewedAt: string | null;
  paidAt: string | null;
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
  reference: string;
  paidAt: string;
  submissionId: number | null;
  campaignTitle: string | null;
};

export type DashboardStats = {
  activeCampaigns: number;
  pending: number;
  approved: number;
  earned: number;
  pendingPay: number;
};

export type AdminOverview = {
  pendingReview: number;
  liveCampaigns: number;
  paidThisMonth: number;
  flagged: number;
  creators: number;
};
