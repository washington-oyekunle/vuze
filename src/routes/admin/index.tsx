import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useQuery } from "@tanstack/react-query";
import { getAdminOverview, getMyProfile } from "@/lib/vuze/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { tokenTotalsLabel } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({ component: AdminHome });

function AdminHome() {
  const { user, isPending } = useCurrentUserState();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile(), enabled: !!user });
  const q = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => getAdminOverview(),
    enabled: me.data?.role === "admin",
  });

  if (isPending) return <AppShell><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  if (!user) return <RedirectToSignIn to="/login" />;
  if (me.data && me.data.role !== "admin") {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Admin only.</p>
      </AppShell>
    );
  }

  const o = q.data;
  return (
    <AppShell>
      <PageHeader title="Admin" description="Review queue, campaigns, creators, payouts." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Pending review", value: o ? String(o.pendingReview) : "—" },
          { label: "Live campaigns", value: o ? String(o.liveCampaigns) : "—" },
          { label: "Paid this month", value: o ? tokenTotalsLabel(o.paidThisMonthByAsset) : "—" },
          { label: "Flagged", value: o ? String(o.flagged) : "—" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-2 font-display text-2xl tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/admin/submissions">Review queue</Link>
        </Button>
        <Button asChild>
          <Link to="/admin/applications">Applications</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/admin/campaigns">Campaigns</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/admin/creators">Creators</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/admin/payouts">Payouts</Link>
        </Button>
      </div>
    </AppShell>
  );
}
