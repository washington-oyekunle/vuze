import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  adminGetPayoutReadiness,
  adminListPayouts,
  adminPaySubmission,
  getMyProfile,
} from "@/lib/vuze/server";
import { tokenAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/admin/payouts")({
  component: AdminPayouts,
});
function AdminPayouts() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => getMyProfile(),
    enabled: !!user,
  });
  const q = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: () => adminListPayouts(),
    enabled: me.data?.role === "admin",
    refetchInterval: 5000,
  });
  const readiness = useQuery({
    queryKey: ["payout-readiness"],
    queryFn: () => adminGetPayoutReadiness(),
    enabled: me.data?.role === "admin",
  });
  const qc = useQueryClient();
  const [busy, setBusy] = useState<number | null>(null);
  if (isPending)
    return (
      <AppShell>
        <p>Loading…</p>
      </AppShell>
    );
  if (!user) return <RedirectToSignIn to="/login" />;
  if (me.data && me.data.role !== "admin")
    return (
      <AppShell>
        <p>Admin only.</p>
      </AppShell>
    );
  async function pay(id: number) {
    setBusy(id);
    try {
      const result = await adminPaySubmission({ data: { submissionId: id } });
      toast.success(
        result.message ||
          (result.status === "paid" ? "Paid" : "Payment processing"),
      );
      await qc.invalidateQueries({ queryKey: ["admin-payouts"] });
      if (result.status === "processing") {
        void navigate({
          to: "/admin/submissions/$id",
          params: { id: String(id) },
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(null);
    }
  }
  const pending = q.data?.pending ?? [];
  return (
    <AppShell>
      <PageHeader
        title="Payouts"
        description="Pay approved submissions individually. Payment retries safely resume processing."
      />
      <div className="mb-4 rounded-lg bg-secondary p-3 text-sm">
        {readiness.data?.enabled
          ? "Payments are enabled."
          : readiness.data?.reason || "Checking payment readiness…"}
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        {pending.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            No approved submissions waiting for payment.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <Link
                  to="/admin/submissions/$id"
                  params={{ id: String(s.id) }}
                  className="min-w-0 hover:underline"
                >
                  <span className="block truncate">
                    {s.creatorName} · {s.campaignTitle}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {tokenAmount(s.estimatedPayout, s.payoutTokenSymbol, s.payoutTokenDecimals, s.payoutTokenMint)} · {s.status}
                  </span>
                </Link>
                <Button
                  size="sm"
                  disabled={!readiness.data?.enabled || busy === s.id}
                  onClick={() => void pay(s.id)}
                >
                  {busy === s.id
                    ? "Processing…"
                    : s.status === "payment_processing"
                      ? "Check payment"
                      : `Pay ${s.payoutTokenSymbol}`}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <h2 className="mb-2 mt-8 text-sm text-muted-foreground">
        Payment history
      </h2>
      <div className="overflow-hidden rounded-xl border border-border">
        {(q.data?.history ?? []).length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            No payments recorded.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.history.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span>
                  {p.creatorName} · {p.campaignTitle}
                </span>
                <span className="tabular-nums">{tokenAmount(p.amount, p.tokenSymbol, p.tokenDecimals ?? 9, p.tokenMint)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
