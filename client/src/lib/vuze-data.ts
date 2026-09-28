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

// Illustrative sample data only. Live campaign terms must be supplied by the VUZE team.
export const campaigns: Campaign[] = [
  { id: "orbit", name: "Orbit Protocol", ticker: "$ORBIT", description: "Make the next wave of onchain finance feel simple. Show how Orbit brings fast, low-friction swaps to everyone.", category: "DeFi", accent: "#d9e7f4", platforms: ["TikTok", "Reels", "Shorts"], rate: 4.8, budget: 18000, remaining: 12420, minViews: 2500, maxPayout: 750, deadline: "Oct 18", tags: ["Explainer", "Storytime"], featured: true },
  { id: "memehouse", name: "Memehouse", ticker: "$MEME", description: "A community-first meme coin with a big personality. Bring the lore, the humor, and your own format.", category: "Memecoin", accent: "#fde5c1", platforms: ["TikTok", "Reels", "X"], rate: 3.2, budget: 12000, remaining: 6830, minViews: 1500, maxPayout: 500, deadline: "Oct 12", tags: ["Comedy", "Meme format"], featured: true },
  { id: "solstice", name: "Solstice", ticker: "$SOLST", description: "A brighter way to explore Solana. Create a quick tutorial or reaction that helps new users get started.", category: "Solana", accent: "#e8ddff", platforms: ["TikTok", "Shorts"], rate: 5.5, budget: 22000, remaining: 15750, minViews: 3000, maxPayout: 900, deadline: "Oct 22", tags: ["Tutorial", "Reaction"], featured: true },
  { id: "pixel", name: "Pixel Pets", ticker: "$PIXEL", description: "Meet the collectible companions that live in your wallet. Show your favorite character and why it belongs in your feed.", category: "Gaming", accent: "#d8f1e8", platforms: ["Reels", "TikTok", "Shorts"], rate: 3.8, budget: 8500, remaining: 4210, minViews: 2000, maxPayout: 420, deadline: "Oct 9", tags: ["Unboxing", "Character POV"] },
  { id: "northstar", name: "Northstar Wallet", ticker: "$NORTH", description: "Your first wallet should feel like second nature. Make an honest, beginner-friendly walkthrough.", category: "Wallets", accent: "#dfe8e6", platforms: ["Shorts", "Reels"], rate: 6.1, budget: 15000, remaining: 9125, minViews: 3500, maxPayout: 1000, deadline: "Oct 25", tags: ["How-to", "Beginner guide"] },
  { id: "afterhours", name: "Afterhours", ticker: "$AFTR", description: "An internet-native culture project. Give the community a reason to stop scrolling and join the conversation.", category: "Community", accent: "#f2dce3", platforms: ["X", "TikTok"], rate: 2.9, budget: 6000, remaining: 2980, minViews: 1200, maxPayout: 350, deadline: "Oct 15", tags: ["Trend", "Community"] },
];

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

export const sampleClips: Clip[] = [
  { id: "VZ-2048", campaign: "Orbit Protocol", platform: "TikTok", views: 28400, earned: 136.32, status: "Approved", submitted: "Sep 24" },
  { id: "VZ-2042", campaign: "Memehouse", platform: "Instagram", views: 19200, earned: 61.44, status: "Tracking", submitted: "Sep 26" },
  { id: "VZ-2031", campaign: "Solstice", platform: "YouTube", views: 12700, earned: 69.85, status: "Under review", submitted: "Sep 27" },
];

export type LeaderboardCreator = { handle: string; name: string; earned: number; views: number; clips: number };

// Fictional creator standings for the dashboard preview only.
export const weeklyLeaderboard: LeaderboardCreator[] = [
  { handle: "@midas_x", name: "Midas", earned: 1240.8, views: 286400, clips: 14 },
  { handle: "@pixelpilot", name: "Pixel Pilot", earned: 980.25, views: 201800, clips: 11 },
  { handle: "@mariomakes", name: "Mario Makes", earned: 742.5, views: 168200, clips: 9 },
  { handle: "@chaincoffee", name: "Chain Coffee", earned: 618.4, views: 143600, clips: 8 },
  { handle: "@alexmakes", name: "Alex Morgan", earned: 426.8, views: 102300, clips: 7 },
];

export const monthlyLeaderboard: LeaderboardCreator[] = [
  { handle: "@pixelpilot", name: "Pixel Pilot", earned: 4980.5, views: 1146200, clips: 58 },
  { handle: "@midas_x", name: "Midas", earned: 4620.8, views: 1024800, clips: 52 },
  { handle: "@chaincoffee", name: "Chain Coffee", earned: 3318.4, views: 836500, clips: 43 },
  { handle: "@mariomakes", name: "Mario Makes", earned: 2892.5, views: 768200, clips: 37 },
  { handle: "@alexmakes", name: "Alex Morgan", earned: 1686.8, views: 402300, clips: 28 },
];

export const moderationItems = [
  { id: "Q-0814", creator: "@pixelpilot", campaign: "Orbit Protocol", platform: "TikTok", views: 48200, age: "12 min ago", risk: "High view velocity", detail: "Views rose 8.4× in 11 minutes; engagement ratio is below this campaign's usual range.", riskLevel: "high" },
  { id: "Q-0812", creator: "@mariomakes", campaign: "Memehouse", platform: "Instagram", views: 16400, age: "34 min ago", risk: "Unusual engagement mix", detail: "Like-to-view ratio differs from the creator's recent verified baseline.", riskLevel: "medium" },
  { id: "Q-0809", creator: "@chaincoffee", campaign: "Solstice", platform: "YouTube", views: 8200, age: "1 hr ago", risk: "New device signal", detail: "Submission came from a device with limited history; no single signal is conclusive.", riskLevel: "low" },
];

export const resources = [
  { category: "Creative playbook", title: "The 3-second hook", description: "A practical structure for earning the pause before the scroll.", time: "6 min read", icon: "✳" },
  { category: "Creative playbook", title: "Explain a token without sounding like a token", description: "Turn a product detail into a human story people actually remember.", time: "8 min read", icon: "◉" },
  { category: "Creator growth", title: "A calmer approach to posting cadence", description: "Build a sustainable rhythm around testing, learning, and iteration.", time: "5 min read", icon: "↗" },
  { category: "Trust & safety", title: "What happens after you submit a clip?", description: "A clear look at view tracking, quality checks, and human review.", time: "4 min read", icon: "◎" },
  { category: "Platform guides", title: "Short-form framing checklist", description: "Simple framing and caption habits that make a video easier to watch.", time: "3 min read", icon: "▣" },
  { category: "Trust & safety", title: "Keeping your creator account secure", description: "How to connect accounts safely and recognize an official VUZE request.", time: "4 min read", icon: "⌑" },
];
