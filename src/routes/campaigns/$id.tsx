import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { getCampaign } from "@/lib/vuze/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CampaignStatusBadge } from "@/components/status-badge";
import { format } from "date-fns";

export const Route = createFileRoute("/campaigns/$id")({ component: CampaignDetail });

function CampaignDetail() {
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => getCampaign({ data: { id: Number(id) } }),
  });
  const c = q.data;
  if (!c) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading brief…</p>
      </AppShell>
    );
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
                Submit clip
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
              <p className="mt-1 font-medium">{c.payoutLabel}</p>
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
    </AppShell>
  );
}
