import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useQuery } from "@tanstack/react-query";
import { getDashboard } from "@/lib/vuze/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmissionStatusBadge } from "@/components/status-badge";
import { compactNumber, money } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({ component: DashboardPage });

function DashboardPage() {
  const { user, isPending } = useCurrentUserState();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard(), enabled: !!user });

  if (isPending) {
    return (
      <AppShell>
        <Skeleton className="h-10 w-48" />
      </AppShell>
    );
  }
  if (!user) return <RedirectToSignIn to="/login" />;

  const stats = q.data?.stats;

  return (
    <AppShell>
      <PageHeader
        title="Desk"
        description="Live campaigns, submissions in review, and what you are owed."
        action={
          <Button asChild>
            <Link to="/campaigns">Submit a clip</Link>
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Open campaigns", value: stats ? String(stats.activeCampaigns) : "—" },
          { label: "In review", value: stats ? String(stats.pending) : "—" },
          { label: "Approved posts", value: stats ? String(stats.approved) : "—" },
          { label: "Paid out", value: stats ? money(stats.earned) : "—" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-10 text-sm font-medium text-muted-foreground">Open campaigns</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {(q.data?.live ?? []).map((c) => (
          <Card key={c.id}>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Badge>{c.type === "ugc" ? "UGC" : "Clipping"}</Badge>
                {c.organicOnly ? <Badge>Organic only</Badge> : null}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{c.brand}</p>
                <h3 className="font-medium">{c.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{c.payoutLabel}</p>
              <Button asChild variant="outline" size="sm">
                <Link to="/campaigns/$id" params={{ id: String(c.id) }}>
                  Open brief
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-10 text-sm font-medium text-muted-foreground">Recent submissions</h2>
      <div className="overflow-hidden rounded-xl border border-border">
        {(q.data?.recent ?? []).length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Nothing submitted yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.recent.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{s.campaignTitle}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{compactNumber(s.views)} views</p>
                </div>
                <SubmissionStatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
