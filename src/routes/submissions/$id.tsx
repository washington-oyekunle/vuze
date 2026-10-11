import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useQuery } from "@tanstack/react-query";
import { getMySubmission, getSubmissionReviews, resubmitProof, submitPayoutProof } from "@/lib/vuze/server";
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
  const reviews = useQuery({
    queryKey: ["my-sub-reviews", id],
    queryFn: () => getSubmissionReviews({ data: { id: Number(id) } }),
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
  const [payoutProofFile, setPayoutProofFile] = useState<File | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);

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

  async function onPayoutProof(e: React.FormEvent) {
    e.preventDefault();
    if (!s || !payoutProofFile) return;
    setUploadingProof(true);
    try {
      const form = new FormData();
      form.set("file", payoutProofFile);
      const upload = await fetch("/api/uploads/analytics", { method: "POST", body: form });
      const result = (await upload.json()) as { url?: string; error?: string };
      if (!upload.ok || !result.url) throw new Error(result.error || "Upload failed");
      await submitPayoutProof({ data: { id: s.id, payoutProofUrl: result.url } });
      toast.success("Payout proof submitted for Friday's payout run");
      setPayoutProofFile(null);
      await q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit payout proof");
    } finally {
      setUploadingProof(false);
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
                <h2 className="text-sm font-medium">Address review feedback</h2>
                <p className="text-sm text-muted-foreground">Update the proof requested by the VUZE desk, then resubmit for another review.</p>
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
              <Button type="submit">Resubmit for review</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
      {s.status === "approved" ? (
        <Card className="mt-4">
          <CardContent>
            <form className="grid gap-3" onSubmit={onPayoutProof}>
              <div>
                <h2 className="text-sm font-medium">Request payout</h2>
                <p className="mt-1 text-sm text-muted-foreground">Submit a screen recording on Friday only for this tracked video if you want it paid. MP4, WebM, or MOV up to 100 MB. An admin authenticates the proof before manual payment.</p>
              </div>
              {s.payoutProofStatus === "pending" ? (
                <p className="text-sm text-muted-foreground">Analytics proof submitted. Waiting for the admin to authenticate it.</p>
              ) : s.payoutProofStatus === "accepted" ? (
                <p className="text-sm text-muted-foreground">Analytics proof authenticated. Your video is ready for the Friday manual payout run.</p>
              ) : s.payoutProofStatus === "rejected" ? (
                <>
                  <p className="text-sm text-destructive">The admin could not authenticate this recording{s.payoutProofAdminNotes ? `: ${s.payoutProofAdminNotes}` : "."} Upload a new recording on the next Friday payout window.</p>
                  <Label htmlFor="payout-proof">New analytics screen recording</Label>
                  <Input id="payout-proof" type="file" required accept="video/mp4,video/webm,video/quicktime" onChange={(e) => setPayoutProofFile(e.target.files?.[0] ?? null)} />
                  {payoutProofFile ? <p className="text-xs text-muted-foreground">Selected: {payoutProofFile.name}</p> : null}
                  <Button type="submit" disabled={uploadingProof}>{uploadingProof ? "Uploading…" : "Submit new Friday proof"}</Button>
                </>
              ) : (
                <>
                  <Label htmlFor="payout-proof">Analytics screen recording</Label>
                  <Input id="payout-proof" type="file" required accept="video/mp4,video/webm,video/quicktime" onChange={(e) => setPayoutProofFile(e.target.files?.[0] ?? null)} />
                  {payoutProofFile ? <p className="text-xs text-muted-foreground">Selected: {payoutProofFile.name}</p> : null}
                  <Button type="submit" disabled={uploadingProof}>{uploadingProof ? "Uploading…" : "Submit for Friday payout"}</Button>
                </>
              )}
            </form>
          </CardContent>
        </Card>
      ) : null}
      <Card className="mt-4">
        <CardContent className="space-y-3">
          <h2 className="text-sm font-medium">Review history</h2>
          {(reviews.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Your submission has not been reviewed yet.</p>
          ) : (
            <ul className="space-y-3">
              {reviews.data!.map((review) => (
                <li key={review.id} className="border-l-2 border-border pl-3 text-sm">
                  <p className="font-medium">{review.action === "needs_proof" ? "Revision requested" : review.action.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">{review.reason || "No reason provided"} · {new Date(review.createdAt).toLocaleString()}</p>
                  {review.notes ? <p className="mt-1 text-muted-foreground">{review.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
