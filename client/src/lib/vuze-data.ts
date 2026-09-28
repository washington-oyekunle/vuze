export type Campaign = {
  id: string;
  name: string;
  ticker: string;
  description: string;
  category: string;
  accent: string;
  platforms: string[];
  rate: number;
  budget: number;
  remaining: number;
  minViews: number;
  maxPayout: number;
  deadline: string;
  tags: string[];
  featured?: boolean;
};

export type Clip = {
  id: string;
  campaign: string;
  platform: string;
  views: number;
  earned: number;
  status: "Approved" | "Tracking" | "Under review" | "Rejected";
  submitted: string;
  reason?: string;
};

export type LeaderboardCreator = { handle: string; name: string; earned: number; views: number; clips: number };
export type ModerationItem = { id: string; creator: string; campaign: string; platform: string; views: number; age: string; risk: string; detail: string; riskLevel: "high" | "medium" | "low" };
export type Resource = { category: string; title: string; description: string; time: string; icon: string };

// Live product records will be supplied by connected backend services; no seed/demo records are included.
export const campaigns: Campaign[] = [];
export const clips: Clip[] = [];
export const weeklyLeaderboard: LeaderboardCreator[] = [];
export const monthlyLeaderboard: LeaderboardCreator[] = [];
export const moderationItems: ModerationItem[] = [];
export const resources: Resource[] = [];
