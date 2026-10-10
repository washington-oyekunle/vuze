import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useQuery } from "@tanstack/react-query";
import { adminListPayouts, getMyProfile } from "@/lib/vuze/server";
import { money } from "@/lib/utils";
import { format } from "date-fns";

export const Route = createFileRoute("/admin/payouts")({ component: AdminPayouts });

function AdminPayouts() {
  const { user, isPending } = useCurrentUserState();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile(), enabled: !!user });
  const q = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: () => adminListPayouts(),
    enabled: me.data?.role === "admin",
  });

  if (isPending) return <AppShell><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  if (!user) return <RedirectToSignIn to="/login" />;
  if (me.data && me.data.role !== "admin") return <AppShell><p>Admin only.</p></AppShell>;

  return (
    <AppShell>
      <PageHeader title="Payouts" description="Payouts run every Friday. Only approved videos with analytics screen-recording proof appear in this queue, and each video can be paid once." />
      <h2 className="mb-2 text-sm text-muted-foreground">Approved, unpaid</h2>
      <div className="mb-8 overflow-hidden rounded-xl border border-border">
        {(q.data?.pending ?? []).length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Nothing waiting.</p>
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.pending.map((s) => (
              <li key={s.id}>
                <Link
                  to="/admin/submissions/$id"
                  params={{ id: String(s.id) }}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-secondary/50"
                >
                  <span>
                    {s.creatorName} · {s.campaignTitle}
                  </span>
                  <span className="tabular-nums">{money(s.estimatedPayout)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <h2 className="mb-2 text-sm text-muted-foreground">History</h2>
      <div className="overflow-hidden rounded-xl border border-border">
        {(q.data?.history ?? []).length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No payouts recorded.</p>
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.history.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p>
                    {p.creatorName} · {p.campaignTitle}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(p.paidAt), "MMM d, yyyy")} {p.reference}
                  </p>
                </div>
                <span className="tabular-nums">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
