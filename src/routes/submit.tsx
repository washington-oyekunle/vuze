import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listCampaigns, submitClip } from "@/lib/vuze/server";
import {
  AnalyticsProofUpload,
  type AnalyticsProof,
} from "@/components/analytics-proof-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { z } from "zod";
const searchSchema = z.object({ campaign: z.number().optional() });
export const Route = createFileRoute("/submit")({
  validateSearch: (s) =>
    searchSchema.parse({
      campaign: s.campaign ? Number(s.campaign) : undefined,
    }),
  component: SubmitPage,
});
function SubmitPage() {
  const { user, isPending } = useCurrentUserState();
  const { campaign } = Route.useSearch();
  const nav = useNavigate();
  const camps = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => listCampaigns(),
  });
  const live = (camps.data ?? []).filter((c) => c.status === "live");
  const [campaignId, setCampaignId] = useState(campaign ?? 0);
  const [postUrl, setPostUrl] = useState("");
  const [payoutWalletAddress, setPayoutWalletAddress] = useState("");
  const [platform, setPlatform] = useState<"tiktok" | "instagram" | "youtube">(
    "tiktok",
  );
  const [notes, setNotes] = useState("");
  const [proof, setProof] = useState<AnalyticsProof | null>(null);
  const [busy, setBusy] = useState(false);
  if (isPending)
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  if (!user) return <RedirectToSignIn to="/login" />;
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = campaignId || live[0]?.id;
    if (!id) return toast.error("Pick a campaign");
    if (!proof) return toast.error("Upload analytics proof before submitting");
    setBusy(true);
    try {
      const res = await submitClip({
        data: {
          campaignId: id,
          postUrl,
          platform,
          payoutWalletAddress,
          notes: notes || undefined,
          proofUploadId: proof.id,
        },
      });
      if (res.verificationStatus === "unavailable")
        toast.error("View verification is unavailable. Your entry is saved; retry from its detail page.");
      else if (
        res.status === "rejected" &&
        res.verificationStatus === "verified" &&
        res.views < res.minViews
      )
        toast.error(res.verificationReason || "Minimum threshold not reached yet.");
      else if (res.status === "under_review")
        toast.success("Views verified. Your entry is in the admin review queue.");
      else if (["approved", "payment_processing", "paid"].includes(res.status))
        toast("This video is already submitted. Opening its existing record.");
      else if (res.status === "rejected")
        toast.error("This video has already been reviewed and rejected.");
      else toast("Submission saved. Check the entry details for its current status.");
      void nav({ to: "/submissions/$id", params: { id: String(res.id) } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell>
      <PageHeader
        title="Submit a clip"
        description="Paste your video URL and upload analytics proof together. We check views before admin review."
      />
      <Card>
        <CardContent>
          <form className="grid gap-5" onSubmit={onSubmit}>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Campaign
              </p>
              <select
                className="h-11 w-full rounded-lg border border-border bg-secondary px-3 text-sm"
                value={campaignId || live[0]?.id || ""}
                onChange={(e) => setCampaignId(Number(e.target.value))}
              >
                {live.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.brand} — {c.title} · {c.payoutTokenSymbol}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Public post
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="url">Post URL</Label>
                  <Input
                    id="url"
                    required
                    type="url"
                    value={postUrl}
                    onChange={(e) => setPostUrl(e.target.value)}
                    placeholder="https://"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="platform">Platform</Label>
                  <select
                    id="platform"
                    className="h-11 w-full rounded-lg border border-border bg-secondary px-3 text-sm"
                    value={platform}
                    onChange={(e) =>
                      setPlatform(
                        e.target.value as "tiktok" | "instagram" | "youtube",
                      )
                    }
                  >
                    <option value="tiktok">TikTok</option>
                    <option value="instagram">Instagram Reels</option>
                    <option value="youtube">YouTube Shorts</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payout-wallet">Solana wallet for this video</Label>
              <Input
                id="payout-wallet"
                required
                minLength={32}
                maxLength={44}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                pattern="[1-9A-HJ-NP-Za-km-z]{32,44}"
                value={payoutWalletAddress}
                onChange={(e) => setPayoutWalletAddress(e.target.value.trim())}
                placeholder="Paste a Solana wallet address"
              />
              <p className="text-xs text-muted-foreground">
                This address is saved with this video. You can use a different
                wallet for another video; it cannot be changed after submission.
              </p>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Notes <span className="normal-case">(optional)</span>
              </p>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the reviewer should know?"
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Analytics proof{" "}
                <span className="normal-case text-destructive">(required)</span>
              </p>
              <p className="mb-3 text-sm text-muted-foreground">
                Upload the analytics screenshot or recording now. Verification
                uses server-side views only; no manual metrics are needed.
              </p>
              <AnalyticsProofUpload
                value={proof}
                onChange={setProof}
                disabled={busy}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Submitting certifies this traffic is organic. Botting is a
              permanent campaign ban.
            </p>
            <Button type="submit" disabled={busy || !proof}>
              {busy ? "Submitting…" : "Submit for verification"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}
