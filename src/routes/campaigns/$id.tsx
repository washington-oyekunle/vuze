import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { applyToCampaign, getCampaign, getMyCampaignApplication } from "@/lib/vuze/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApplicationStatusBadge, CampaignStatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/campaigns/$id")({ component: CampaignDetail });

function CampaignDetail() {
  const { id } = Route.useParams();
  const { user } = useCurrentUserState();
  const queryClient = useQueryClient();
  const campaignId = Number(id);
  const q = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => getCampaign({ data: { id: campaignId } }),
  });
  const applicationQuery = useQuery({
    queryKey: ["campaign-application", campaignId],
    queryFn: () => getMyCampaignApplication({ data: { campaignId } }),
    enabled: !!user,
  });
  const [pitch, setPitch] = useState("");
  const [busy, setBusy] = useState(false);
  const c = q.data;

  if (!c) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading brief…</p>
      </AppShell>
    );
  }

  const application = applicationQuery.data;

  async function apply() {
    setBusy(true);
    try {
      await applyToCampaign({ data: { campaignId, pitch } });
      await queryClient.invalidateQueries({ queryKey: ["campaign-application", campaignId] });
      toast.success("Application sent to the VUZE review desk");
      setPitch("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title={c.title}
        description={c.brand}
        action={
          c.status === "live" ? (
            <Button asChild>
              <Link to="/submit" search={{ campaign: c.id }}>
                Submit content
              </Link>
            </Button>
          ) : (
            <Badge>Closed</Badge>
          )
        }
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge>{c.type === "ugc" ? "UGC" : "Clipping"}</Badge>
        <CampaignStatusBadge status={c.status} />
        {c.organicOnly ? <Badge tone="good">Organic only</Badge> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardContent className="space-y-4">
            <section>
              <h2 className="text-sm font-medium text-muted-foreground">Brief</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.brief}</p>
            </section>
            <section>
              <h2 className="text-sm font-medium text-muted-foreground">Requirements</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.requirements}</p>
            </section>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Payout</p>
              <p className="mt-1 font-medium">{c.payoutLabel} · {c.payoutTokenSymbol}</p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                Solana mint {c.payoutTokenMint.slice(0, 5)}…{c.payoutTokenMint.slice(-5)} · {c.payoutTokenDecimals} decimals
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Deadline</p>
              <p className="mt-1">{c.deadline ? format(new Date(c.deadline), "MMM d, yyyy") : "Open"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Submissions in</p>
              <p className="mt-1 tabular-nums">{c.submissionCount}</p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              View bots, pods, and purchased traffic void payout and remove you from the roster.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">Work with this campaign</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                VUZE reviews applications on behalf of the brand. You can apply first or submit a published post directly.
              </p>
            </div>
            {application ? <ApplicationStatusBadge status={application.status} /> : null}
          </div>

          {!user ? (
            <Button asChild variant="outline">
              <Link to="/login">Sign in to apply</Link>
            </Button>
          ) : application?.status === "accepted" ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">You are approved for this campaign.</p>
              {c.status === "live" ? (
                <Button asChild>
                  <Link to="/submit" search={{ campaign: c.id }}>Submit content</Link>
                </Button>
              ) : null}
            </div>
          ) : application?.status === "pending" ? (
            <p className="text-sm text-muted-foreground">Your application is with the VUZE review desk. You can still submit content directly while the campaign is open.</p>
          ) : application?.status === "declined" ? (
            <p className="text-sm text-muted-foreground">This application was declined by the VUZE review desk. You may submit a new application if the campaign reopens applications.</p>
          ) : c.status === "live" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pitch">Why are you a fit? <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea
                  id="pitch"
                  value={pitch}
                  onChange={(event) => setPitch(event.target.value)}
                  placeholder="Share your angle, audience, or relevant experience."
                  maxLength={800}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={() => void apply()} disabled={busy}>
                  {busy ? "Sending…" : "Apply to campaign"}
                </Button>
                <Button asChild variant="outline">
                  <Link to="/submit" search={{ campaign: c.id }}>Submit content directly</Link>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This campaign is closed to new applications and submissions.</p>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
