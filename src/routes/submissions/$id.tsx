import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/app-shell";
import {
  AnalyticsProofUpload,
  type AnalyticsProof,
} from "@/components/analytics-proof-upload";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  getMySubmission,
  getSubmissionReviews,
  retrySubmissionVerification,
} from "@/lib/vuze/server";
import { SubmissionStatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { compactNumber, money } from "@/lib/utils";

export const Route = createFileRoute("/submissions/$id")({
  component: SubmissionDetail,
});

function SubmissionDetail() {
  const { user, isPending } = useCurrentUserState();
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["mysub", id],
    queryFn: () => getMySubmission({ data: { id: Number(id) } }),
    enabled: !!user,
    refetchInterval: (query) =>
      ["verifying", "payment_processing", "under_review", "approved"].includes(
        query.state.data?.status ?? "",
      )
        ? 5000
        : false,
  });
  const reviews = useQuery({
    queryKey: ["my-sub-reviews", id],
    queryFn: () => getSubmissionReviews({ data: { id: Number(id) } }),
    enabled: !!user,
  });
  const [busy, setBusy] = useState(false);
  const [replacement, setReplacement] = useState<AnalyticsProof | null>(null);
  const s = q.data;
  if (isPending || q.isLoading)
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  if (!user) return <RedirectToSignIn to="/login" />;
  if (!s)
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">
          {q.isError ? "Could not load this submission." : "Not found."}
        </p>
      </AppShell>
    );

  async function retry() {
    if (!s || busy) return;
    setBusy(true);
    try {
      await retrySubmissionVerification({
        data: { id: s.id, proofUploadId: replacement?.id },
      });
      setReplacement(null);
      toast.success("Verification updated");
      await q.refetch();
      await reviews.refetch();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not retry verification",
      );
    } finally {
      setBusy(false);
    }
  }

  const canRetry = ["verification_failed", "needs_proof", "verifying"].includes(
    s.status,
  );
  const needsReplacement = s.status === "needs_proof" || !s.analyticsProofUrl;
  return (
    <AppShell>
      <PageHeader title={s.campaignTitle} description={s.campaignBrand} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <SubmissionStatusBadge status={s.status} />
              <a
                href={s.postUrl}
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                Open post
              </a>
            </div>
            <div className="rounded-lg bg-secondary p-3">
              <p className="font-medium">
                Automated verification:{" "}
                {s.verificationStatus === "verified"
                  ? "Verified"
                  : s.verificationStatus === "unavailable"
                    ? "Unavailable"
                    : "Pending"}
              </p>
              <p className="mt-1 text-muted-foreground">
                {s.verificationReason ||
                  "Checking the platform API. No creator-entered view count is used."}
              </p>
              {s.verifiedAt ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.verificationSource} ·{" "}
                  {new Date(s.verifiedAt).toLocaleString()}
                </p>
              ) : null}
            </div>
            <p className="tabular-nums">
              {s.verificationStatus === "verified"
                ? `${compactNumber(s.views)} API-verified views`
                : "Views not yet verified"}{" "}
              · minimum {compactNumber(s.minViews)} required
            </p>
            {s.notes ? <p>{s.notes}</p> : null}
            {s.adminNotes ? (
              <p className="rounded-lg bg-secondary p-3 text-muted-foreground">
                Reviewer: {s.adminNotes}
              </p>
            ) : null}
            {s.analyticsProofUrl ? (
              <a
                href={s.analyticsProofUrl}
                className="block underline"
                target="_blank"
                rel="noreferrer"
              >
                Open submitted analytics proof
              </a>
            ) : null}
            {canRetry ? (
              <section className="space-y-3 border-t border-border pt-4">
                <h2 className="font-medium">
                  {needsReplacement
                    ? "Upload analytics proof"
                    : "Verification recovery"}
                </h2>
                {s.status === "verifying" ? (
                  <p className="text-muted-foreground">
                    If the check was interrupted, wait one minute and retry.
                    Active checks cannot be duplicated.
                  </p>
                ) : null}
                {needsReplacement ? (
                  <AnalyticsProofUpload
                    value={replacement}
                    onChange={setReplacement}
                    disabled={busy}
                  />
                ) : null}
                <Button
                  onClick={() => void retry()}
                  disabled={busy || (needsReplacement && !replacement)}
                >
                  {busy
                    ? "Checking…"
                    : needsReplacement
                      ? "Submit proof and verify"
                      : "Retry verification"}
                </Button>
              </section>
            ) : null}
            {s.status === "payment_processing" ? (
              <p className="text-muted-foreground">
                Your USD1 transfer is pending confirmation. The entry closes
                only after the finalized Solana transaction is verified.
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {s.status === "paid" ? "Paid" : "Estimated payout"}
            </p>
            <p className="mt-1 font-display text-2xl tabular-nums">
              {money(s.estimatedPayout)} USD1
            </p>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardContent className="space-y-3">
          <h2 className="text-sm font-medium">Review history</h2>
          {(reviews.data ?? []).length ? (
            <ul className="space-y-3">
              {reviews.data!.map((review) => (
                <li
                  key={review.id}
                  className="border-l-2 border-border pl-3 text-sm"
                >
                  <p className="font-medium">
                    {review.action.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {review.reason || "No reason provided"} ·{" "}
                    {new Date(review.createdAt).toLocaleString()}
                  </p>
                  {review.notes ? (
                    <p className="mt-1 text-muted-foreground">{review.notes}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your submission has not been reviewed yet.
            </p>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
