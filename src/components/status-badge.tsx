import { Badge } from "@/components/ui/badge";
import type { ApplicationStatus, CampaignStatus, SubmissionStatus } from "@/lib/vuze/types";

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const map: Record<ApplicationStatus, { tone: "neutral" | "good" | "warn" | "bad"; label: string }> = {
    pending: { tone: "warn", label: "Pending review" },
    accepted: { tone: "good", label: "Accepted" },
    declined: { tone: "bad", label: "Declined" },
    withdrawn: { tone: "neutral", label: "Withdrawn" },
  };
  const m = map[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

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
