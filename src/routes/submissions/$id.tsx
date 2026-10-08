import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useQuery } from "@tanstack/react-query";
import { getMySubmission, resubmitProof } from "@/lib/vuze/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmissionStatusBadge } from "@/components/status-badge";
import { compactNumber, money } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/submissions/$id")({ component: SubmissionDetail });

function SubmissionDetail() {
  const { user, isPending } = useCurrentUserState();
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["mysub", id],
    queryFn: () => getMySubmission({ data: { id: Number(id) } }),
    enabled: !!user,
  });
  const s = q.data;
  const [analyticsUrls, setAnalyticsUrls] = useState("");
  const [views, setViews] = useState("");
  const [watch, setWatch] = useState("");
  const [retention, setRetention] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [shares, setShares] = useState("");

  if (isPending) return <AppShell><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  if (!user) return <RedirectToSignIn to="/login" />;
  if (!s) return <AppShell><p className="text-sm text-muted-foreground">Not found.</p></AppShell>;

  const canUpdate = s.status === "needs_proof" || s.status === "rejected" || s.status === "under_review";

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    try {
      await resubmitProof({
        data: {
          id: s.id,
          analyticsUrls: analyticsUrls || s.analyticsUrls,
          views: Number(views || s.views),
          watchTimePct: watch ? Number(watch) : s.watchTimePct ?? undefined,
          retentionPct: retention ? Number(retention) : s.retentionPct ?? undefined,
          likes: Number(likes || s.likes),
          commentsCount: Number(comments || s.commentsCount),
          shares: Number(shares || s.shares),
        },
      });
      toast.success("Updated");
      await q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <AppShell>
      <PageHeader title={s.campaignTitle} description={s.campaignBrand} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <SubmissionStatusBadge status={s.status} />
              <a href={s.postUrl} className="text-muted-foreground underline" target="_blank" rel="noreferrer">
                Open post
              </a>
            </div>
            <p className="tabular-nums">
              {compactNumber(s.views)} views · {s.watchTimePct ?? "—"}% watch · {s.retentionPct ?? "—"}% retention
            </p>
            <p className="tabular-nums text-muted-foreground">
              {s.likes} likes · {s.commentsCount} comments · {s.shares} shares
            </p>
            {s.notes ? <p>{s.notes}</p> : null}
            {s.adminNotes ? (
              <p className="rounded-lg bg-secondary p-3 text-muted-foreground">Reviewer: {s.adminNotes}</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-muted-foreground">Estimated payout</p>
            <p className="mt-1 font-display text-2xl tabular-nums">{money(s.estimatedPayout)}</p>
          </CardContent>
        </Card>
      </div>
      {canUpdate ? (
        <Card className="mt-4">
          <CardContent>
            <form className="grid gap-3" onSubmit={onUpdate}>
              <h2 className="text-sm font-medium">Update proof</h2>
              <Textarea
                placeholder="Analytics URLs"
                value={analyticsUrls}
                onChange={(e) => setAnalyticsUrls(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <div className="space-y-1"><Label>Views</Label><Input value={views} onChange={(e) => setViews(e.target.value)} /></div>
                <div className="space-y-1"><Label>Watch %</Label><Input value={watch} onChange={(e) => setWatch(e.target.value)} /></div>
                <div className="space-y-1"><Label>Retention %</Label><Input value={retention} onChange={(e) => setRetention(e.target.value)} /></div>
                <div className="space-y-1"><Label>Likes</Label><Input value={likes} onChange={(e) => setLikes(e.target.value)} /></div>
                <div className="space-y-1"><Label>Comments</Label><Input value={comments} onChange={(e) => setComments(e.target.value)} /></div>
                <div className="space-y-1"><Label>Shares</Label><Input value={shares} onChange={(e) => setShares(e.target.value)} /></div>
              </div>
              <Button type="submit">Resubmit</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </AppShell>
  );
}
