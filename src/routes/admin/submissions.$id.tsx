import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useQuery } from "@tanstack/react-query";
import { adminGetSubmission, adminReviewSubmission, adminMarkPaid, getMyProfile } from "@/lib/vuze/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmissionStatusBadge } from "@/components/status-badge";
import { compactNumber, money } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/submissions/$id")({ component: AdminReview });

function AdminReview() {
  const { user, isPending } = useCurrentUserState();
  const { id } = Route.useParams();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile(), enabled: !!user });
  const q = useQuery({
    queryKey: ["admin-sub", id],
    queryFn: () => adminGetSubmission({ data: { id: Number(id) } }),
    enabled: me.data?.role === "admin",
  });
  const s = q.data;
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");

  if (isPending) return <AppShell><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  if (!user) return <RedirectToSignIn to="/login" />;
  if (me.data && me.data.role !== "admin") return <AppShell><p>Admin only.</p></AppShell>;
  if (!s) return <AppShell><p className="text-sm text-muted-foreground">Not found.</p></AppShell>;

  async function act(action: "approve" | "reject" | "needs_proof" | "flag") {
    if (!s) return;
    try {
      await adminReviewSubmission({ data: { id: s.id, action, notes } });
      toast.success("Updated");
      await q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function pay() {
    if (!s) return;
    try {
      await adminMarkPaid({ data: { submissionId: s.id, reference } });
      toast.success("Marked paid");
      await q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <AppShell>
      <PageHeader title={s.campaignTitle} description={s.creatorName} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardContent className="space-y-3 text-sm">
            <SubmissionStatusBadge status={s.status} />
            <a className="block underline" href={s.postUrl} target="_blank" rel="noreferrer">
              {s.postUrl}
            </a>
            <p className="tabular-nums">
              {compactNumber(s.views)} views · watch {s.watchTimePct ?? "—"}% · retention {s.retentionPct ?? "—"}%
            </p>
            <p className="tabular-nums text-muted-foreground">
              {s.likes} likes · {s.commentsCount} comments · {s.shares} shares
            </p>
            {s.analyticsUrls ? (
              <pre className="whitespace-pre-wrap rounded-lg bg-secondary p-3 text-xs">{s.analyticsUrls}</pre>
            ) : null}
            {s.notes ? <p>{s.notes}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Estimated</p>
            <p className="font-display text-2xl tabular-nums">{money(s.estimatedPayout)}</p>
            <Textarea placeholder="Reviewer notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button className="w-full" onClick={() => void act("approve")}>
              Approve
            </Button>
            <Button className="w-full" variant="outline" onClick={() => void act("needs_proof")}>
              Request proof
            </Button>
            <Button className="w-full" variant="destructive" onClick={() => void act("reject")}>
              Reject
            </Button>
            <Button className="w-full" variant="ghost" onClick={() => void act("flag")}>
              Flag
            </Button>
            {s.status === "approved" ? (
              <div className="space-y-2 border-t border-border pt-3">
                <Label>Payout reference</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
                <Button className="w-full" onClick={() => void pay()}>
                  Mark paid
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
