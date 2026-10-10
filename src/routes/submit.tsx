import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useQuery } from "@tanstack/react-query";
import { listCampaigns, submitClip } from "@/lib/vuze/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const searchSchema = z.object({
  campaign: z.number().optional(),
});

export const Route = createFileRoute("/submit")({
  validateSearch: (s) => searchSchema.parse({ campaign: s.campaign ? Number(s.campaign) : undefined }),
  component: SubmitPage,
});

function SubmitPage() {
  const { user, isPending } = useCurrentUserState();
  const { campaign } = Route.useSearch();
  const nav = useNavigate();
  const camps = useQuery({ queryKey: ["campaigns"], queryFn: () => listCampaigns() });
  const live = (camps.data ?? []).filter((c) => c.status === "live");

  const [campaignId, setCampaignId] = useState<number>(campaign ?? 0);
  const [postUrl, setPostUrl] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [notes, setNotes] = useState("");
  const [analyticsUrls, setAnalyticsUrls] = useState("");
  const [views, setViews] = useState("0");
  const [watch, setWatch] = useState("");
  const [retention, setRetention] = useState("");
  const [likes, setLikes] = useState("0");
  const [comments, setComments] = useState("0");
  const [shares, setShares] = useState("0");
  const [busy, setBusy] = useState(false);

  if (isPending) return <AppShell><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  if (!user) return <RedirectToSignIn to="/login" />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = campaignId || live[0]?.id;
    if (!id) {
      toast.error("Pick a campaign");
      return;
    }
    setBusy(true);
    try {
      const res = await submitClip({
        data: {
          campaignId: id,
          postUrl,
          platform,
          notes,
          analyticsUrls,
          views: Number(views) || 0,
          watchTimePct: watch ? Number(watch) : undefined,
          retentionPct: retention ? Number(retention) : undefined,
          likes: Number(likes) || 0,
          commentsCount: Number(comments) || 0,
          shares: Number(shares) || 0,
        },
      });
      toast.success("Submitted for review");
      void nav({ to: "/submissions/$id", params: { id: String(res.id) } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Submit a clip"
        description="Submit the public post link and analytics details. VUZE does not require the video file."
      />
      <Card>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="campaign">Campaign</Label>
              <select
                id="campaign"
                className="h-11 w-full rounded-lg border border-border bg-secondary px-3 text-sm"
                value={campaignId || live[0]?.id || ""}
                onChange={(e) => setCampaignId(Number(e.target.value))}
              >
                {live.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.brand} — {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="url">Post URL</Label>
                <Input id="url" required type="url" value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="https://" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="platform">Platform</Label>
                <select
                  id="platform"
                  className="h-11 w-full rounded-lg border border-border bg-secondary px-3 text-sm"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                >
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram Reels</option>
                  <option value="youtube">YouTube Shorts</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proof">Public analytics links</Label>
              <Textarea
                id="proof"
                value={analyticsUrls}
                onChange={(e) => setAnalyticsUrls(e.target.value)}
                placeholder="One URL per line. Retention graph required. Upload proof is only needed after approval for payout."
              />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Field label="Views" value={views} onChange={setViews} />
              <Field label="Watch time %" value={watch} onChange={setWatch} />
              <Field label="Retention %" value={retention} onChange={setRetention} />
              <Field label="Likes" value={likes} onChange={setLikes} />
              <Field label="Comments" value={comments} onChange={setComments} />
              <Field label="Shares" value={shares} onChange={setShares} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Submitting certifies this traffic is organic. Botting is a permanent campaign ban.
            </p>
            <Button type="submit" disabled={busy}>
              Submit for review
            </Button>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
