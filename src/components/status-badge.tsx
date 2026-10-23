import { Badge } from "@/components/ui/badge";
import type { ApplicationStatus, CampaignStatus } from "@/lib/vuze/types";

export function ApplicationStatusBadge({
  status,
}: {
  status: ApplicationStatus;
}) {
  const map: Record<
    ApplicationStatus,
    { tone: "neutral" | "good" | "warn" | "bad"; label: string }
  > = {
    pending: { tone: "warn", label: "Pending review" },
    accepted: { tone: "good", label: "Accepted" },
    declined: { tone: "bad", label: "Declined" },
    withdrawn: { tone: "neutral", label: "Withdrawn" },
  };
  const m = map[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function SubmissionStatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { tone: "neutral" | "good" | "warn" | "bad" | "accent"; label: string }
  > = {
    verifying: { tone: "warn", label: "Verifying" },
    verification_failed: { tone: "bad", label: "Verification failed" },
    under_review: { tone: "warn", label: "Under review" },
    needs_proof: { tone: "warn", label: "Needs proof" },
    below_threshold: { tone: "warn", label: "Waiting for views" },
    approved: { tone: "good", label: "Approved" },
    rejected: { tone: "bad", label: "Rejected" },
    paid: { tone: "accent", label: "Paid" },
  };
  const m = map[status] ?? {
    tone: "neutral",
    label: status.replaceAll("_", " "),
  };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge
      tone={
        status === "live" ? "good" : status === "draft" ? "neutral" : "neutral"
      }
    >
      {status === "live" ? "Open" : status === "draft" ? "Draft" : "Closed"}
    </Badge>
  );
}
