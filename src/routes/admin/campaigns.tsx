import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useQuery } from "@tanstack/react-query";
import { adminSaveCampaign, getMyProfile, listCampaigns } from "@/lib/vuze/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampaignStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/campaigns")({ component: AdminCampaigns });

function AdminCampaigns() {
  const { user, isPending } = useCurrentUserState();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile(), enabled: !!user });
  const q = useQuery({ queryKey: ["campaigns"], queryFn: () => listCampaigns(), enabled: me.data?.role === "admin" });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [type, setType] = useState<"ugc" | "clipping">("clipping");
  const [status, setStatus] = useState<"draft" | "live" | "closed">("live");
  const [summary, setSummary] = useState("");
  const [brief, setBrief] = useState("");
  const [requirements, setRequirements] = useState("");
  const [payoutLabel, setPayoutLabel] = useState("");
  const [payoutKind, setPayoutKind] = useState<"per_1k" | "flat">("per_1k");
  const [payoutRate, setPayoutRate] = useState("4");

  if (isPending) return <AppShell><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  if (!user) return <RedirectToSignIn to="/login" />;
  if (me.data && me.data.role !== "admin") return <AppShell><p>Admin only.</p></AppShell>;

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await adminSaveCampaign({
        data: {
          title,
          brand,
          type,
          status,
          summary,
          brief,
          requirements,
          payoutLabel,
          payoutKind,
          payoutRate: Number(payoutRate),
          organicOnly: true,
        },
      });
      toast.success("Campaign saved");
      setOpen(false);
      await q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Campaigns"
        action={
          <Button type="button" onClick={() => setOpen(!open)}>
            {open ? "Close" : "New campaign"}
          </Button>
        }
      />
      {open ? (
        <Card className="mb-6">
          <CardContent>
            <form className="grid gap-3" onSubmit={onCreate}>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
                <div className="space-y-1.5"><Label>Brand</Label><Input value={brand} onChange={(e) => setBrand(e.target.value)} required /></div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <select className="h-11 rounded-lg border border-border bg-secondary px-3 text-sm" value={type} onChange={(e) => setType(e.target.value as "ugc" | "clipping")}>
                  <option value="clipping">Clipping</option>
                  <option value="ugc">UGC</option>
                </select>
                <select className="h-11 rounded-lg border border-border bg-secondary px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value as "draft" | "live" | "closed")}>
                  <option value="live">Live</option>
                  <option value="draft">Draft</option>
                  <option value="closed">Closed</option>
                </select>
                <select className="h-11 rounded-lg border border-border bg-secondary px-3 text-sm" value={payoutKind} onChange={(e) => setPayoutKind(e.target.value as "per_1k" | "flat")}>
                  <option value="per_1k">Per 1k views</option>
                  <option value="flat">Flat</option>
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><Label>Payout label</Label><Input value={payoutLabel} onChange={(e) => setPayoutLabel(e.target.value)} required /></div>
                <div className="space-y-1.5"><Label>Rate</Label><Input value={payoutRate} onChange={(e) => setPayoutRate(e.target.value)} /></div>
              </div>
              <Textarea placeholder="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
              <Textarea placeholder="Brief" value={brief} onChange={(e) => setBrief(e.target.value)} />
              <Textarea placeholder="Requirements" value={requirements} onChange={(e) => setRequirements(e.target.value)} />
              <Button type="submit">Publish</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-3">
        {(q.data ?? []).map((c) => (
          <Card key={c.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{c.brand}</p>
                <p className="font-medium">{c.title}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{c.type}</Badge>
                <CampaignStatusBadge status={c.status} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
