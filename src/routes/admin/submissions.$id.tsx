import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  adminGetSubmission,
  adminGetSubmissionReviews,
  adminReviewSubmission,
  adminPaySubmission,
  adminReconcilePayment,
  adminGetPayoutReadiness,
  getMyProfile,
} from "@/lib/vuze/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SubmissionStatusBadge } from "@/components/status-badge";
import { compactNumber, tokenAmount } from "@/lib/utils";
export const Route = createFileRoute("/admin/submissions/$id")({
  component: AdminReview,
});
function AdminReview() {
  const { user, isPending } = useCurrentUserState();
  const { id } = Route.useParams();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => getMyProfile(),
    enabled: !!user,
  });
  const q = useQuery({
    queryKey: ["admin-sub", id],
    queryFn: () => adminGetSubmission({ data: { id: Number(id) } }),
    enabled: me.data?.role === "admin",
    refetchInterval: 5000,
  });
  const reviews = useQuery({
    queryKey: ["admin-sub-reviews", id],
    queryFn: () => adminGetSubmissionReviews({ data: { id: Number(id) } }),
    enabled: me.data?.role === "admin",
  });
  const readiness = useQuery({
    queryKey: ["payout-readiness"],
    queryFn: () => adminGetPayoutReadiness(),
    enabled: me.data?.role === "admin",
  });
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("Needs more analytics proof");
  const [busy, setBusy] = useState(false);
  const s = q.data!;
  useEffect(() => {
    if (s?.status !== "payment_processing" || !readiness.data?.enabled) return;
    let stopped = false;
    let running = false;
    async function reconcile() {
      if (running || stopped) return;
      running = true;
      try {
        await adminReconcilePayment({ data: { submissionId: Number(id) } });
        if (!stopped) await q.refetch();
      } catch {
        /* Keep the durable pending state; never issue a new payment. */
      } finally {
        running = false;
      }
    }
    const timer = setInterval(() => void reconcile(), 10000);
    void reconcile();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [s?.status, readiness.data?.enabled, id]);
  if (isPending)
    return (
      <AppShell>
        <p>Loading…</p>
      </AppShell>
    );
  if (!user) return <RedirectToSignIn to="/login" />;
  if (me.data && me.data.role !== "admin")
    return (
      <AppShell>
        <p>Admin only.</p>
      </AppShell>
    );
  if (!s)
    return (
      <AppShell>
        <p>Not found.</p>
      </AppShell>
    );
  async function act(action: "approve" | "reject" | "needs_proof") {
    setBusy(true);
    try {
      await adminReviewSubmission({
        data: {
          id: s.id,
          action,
          reason:
            action === "approve" ? "Visual analytics proof accepted" : reason,
          notes,
        },
      });
      toast.success("Updated");
      await q.refetch();
      await reviews.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    setBusy(true);
    try {
      const result = await adminPaySubmission({ data: { submissionId: s.id } });
      toast.success(
        result.message ||
          (result.status === "paid" ? "Paid" : "Payment processing"),
      );
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }
  const eligible =
    ["under_review", "needs_proof"].includes(s.status) &&
    s.verificationStatus === "verified" &&
    s.views >= s.minViews &&
    !!s.analyticsProofUrl;
  const proof = s.analyticsProofUrl;
  return (
    <AppShell>
      <PageHeader title={s.campaignTitle} description={s.creatorName} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <SubmissionStatusBadge status={s.status} />
              <a
                className="underline"
                href={s.postUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open post
              </a>
            </div>
            <p className="tabular-nums">
              {compactNumber(s.views)} verified views · minimum{" "}
              {compactNumber(s.minViews)} · {s.verificationStatus}
            </p>
            <div className="rounded-lg bg-secondary p-3">
              <p className="font-medium">Verification evidence</p>
              <p className="mt-1 text-muted-foreground">
                {s.verificationReason || "No reason provided"}
              </p>
              {s.verifiedAt ? (
                <p className="text-xs text-muted-foreground">
                  {s.verificationSource} · Verified{" "}
                  {new Date(s.verifiedAt).toLocaleString()}
                </p>
              ) : null}
            </div>
            {proof ? (
              <div className="space-y-2">
                <p className="font-medium">Submitted proof</p>
                {s.analyticsProofType?.startsWith("video/") ? (
                  <video
                    className="max-h-96 w-full rounded-lg bg-black"
                    controls
                    src={proof}
                  />
                ) : (
                  <img
                    className="max-h-96 w-full rounded-lg object-contain"
                    src={proof}
                    alt="Uploaded analytics proof"
                  />
                )}
                <a
                  className="text-xs underline"
                  href={proof}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original
                </a>
              </div>
            ) : null}
            {s.notes ? <p>{s.notes}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Estimated</p>
            <p className="font-display text-2xl tabular-nums">
              {tokenAmount(s.estimatedPayout, s.payoutTokenSymbol, s.payoutTokenDecimals, s.payoutTokenMint)}
            </p>
            <Textarea
              placeholder="Reviewer notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <select
              className="h-11 w-full rounded-lg border border-border bg-secondary px-3 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option>Needs more analytics proof</option>
              <option>Wrong audience or platform</option>
              <option>Off-brief creative</option>
              <option>Inorganic traffic concern</option>
              <option>Copyright or claim concern</option>
            </select>
            <Button
              className="w-full"
              disabled={!eligible || s.flagged || busy}
              onClick={() => void act("approve")}
            >
              Approve
            </Button>
            <Button
              className="w-full"
              variant="outline"
              disabled={!eligible || busy}
              onClick={() => void act("needs_proof")}
            >
              Request proof
            </Button>
            <Button
              className="w-full"
              variant="destructive"
              disabled={!eligible || busy}
              onClick={() => void act("reject")}
            >
              Reject
            </Button>
            {["approved", "payment_processing"].includes(s.status) ? (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-sm">
                  {readiness.data?.enabled
                    ? "Payout is configured."
                    : readiness.data?.reason || "Payout is not configured."}
                </p>
                <Button
                  className="w-full"
                  disabled={busy || !readiness.data?.enabled}
                  onClick={() => void pay()}
                >
                  {s.status === "payment_processing"
                    ? "Check payment"
                    : `Pay ${s.payoutTokenSymbol}`}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardContent className="space-y-3">
          <h2 className="text-sm font-medium">Review history</h2>
          {(reviews.data ?? []).map((r) => (
            <div key={r.id} className="border-l-2 border-border pl-3 text-sm">
              <p className="font-medium">{r.action.replaceAll("_", " ")}</p>
              <p className="text-xs text-muted-foreground">
                {r.reason || "No reason provided"} · {r.reviewerName} ·{" "}
                {new Date(r.createdAt).toLocaleString()}
              </p>
              {r.notes ? (
                <p className="mt-1 text-muted-foreground">{r.notes}</p>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </AppShell>
  );
}
