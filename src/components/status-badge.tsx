import { Badge } from "@/components/ui/badge";
import type { CampaignStatus, SubmissionStatus } from "@/lib/vuze/types";

export function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  const map: Record<SubmissionStatus, { tone: "neutral" | "good" | "warn" | "bad" | "accent"; label: string }> =
    {
      under_review: { tone: "warn", label: "Under review" },
      needs_proof: { tone: "warn", label: "Needs proof" },
      approved: { tone: "good", label: "Approved" },
      rejected: { tone: "bad", label: "Rejected" },
      paid: { tone: "accent", label: "Paid" },
    };
  const m = map[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  if (status === "live") return <Badge tone="good">Open</Badge>;
  if (status === "draft") return <Badge>Draft</Badge>;
  return <Badge>Closed</Badge>;
}
