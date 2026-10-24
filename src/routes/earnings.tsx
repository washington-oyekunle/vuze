import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useQuery } from "@tanstack/react-query";
import { getEarnings } from "@/lib/vuze/server";
import { Card, CardContent } from "@/components/ui/card";
import { tokenAmount, tokenTotalsLabel } from "@/lib/utils";
import { format } from "date-fns";

export const Route = createFileRoute("/earnings")({ component: EarningsPage });

function EarningsPage() {
  const { user, isPending } = useCurrentUserState();
  const q = useQuery({ queryKey: ["earnings"], queryFn: () => getEarnings(), enabled: !!user });
  if (isPending) return <AppShell><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  if (!user) return <RedirectToSignIn to="/login" />;

  return (
    <AppShell>
      <PageHeader title="Earnings" description="Approved work waiting on payout, and what has already landed." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent>
            <p className="text-xs text-muted-foreground">Pending payout</p>
            <p className="mt-2 font-display text-2xl tabular-nums">{tokenTotalsLabel(q.data?.pendingByAsset ?? [])}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="mt-2 font-display text-2xl tabular-nums">{tokenTotalsLabel(q.data?.paidByAsset ?? [])}</p>
          </CardContent>
        </Card>
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        {(q.data?.payouts ?? []).length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No payouts yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p>{p.campaignTitle ?? "Payout"}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(p.paidAt), "MMM d, yyyy")} {p.reference ? `· ${p.reference}` : ""}
                  </p>
                </div>
                <span className="tabular-nums">{tokenAmount(p.amount, p.tokenSymbol, p.tokenDecimals ?? 9, p.tokenMint)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
