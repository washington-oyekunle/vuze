import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminListPayouts, adminMarkPaid, getMyProfile } from "@/lib/vuze/server";
import { money } from "@/lib/utils";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/payouts")({ component: AdminPayouts });

function AdminPayouts() {
  const { user, isPending } = useCurrentUserState();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile(), enabled: !!user });
  const q = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: () => adminListPayouts(),
    enabled: me.data?.role === "admin",
  });
  const queryClient = useQueryClient();
  const [references, setReferences] = useState<Record<number, string>>({});
  const [payingId, setPayingId] = useState<number | null>(null);

  if (isPending) return <AppShell><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  if (!user) return <RedirectToSignIn to="/login" />;
  if (me.data && me.data.role !== "admin") return <AppShell><p>Admin only.</p></AppShell>;

  async function markPaid(submissionId: number) {
    setPayingId(submissionId);
    try {
      await adminMarkPaid({ data: { submissionId, reference: references[submissionId] ?? "" } });
      toast.success("Video marked paid");
      await queryClient.invalidateQueries({ queryKey: ["admin-payouts"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark video paid");
    } finally {
      setPayingId(null);
    }
  }

  return (
    <AppShell>
      <PageHeader title="Payouts" description="Manual admin payout run every Friday. VUZE never sends money automatically. Only approved videos with analytics screen-recording proof appear here, and each video can be paid once." />
      <h2 className="mb-2 text-sm text-muted-foreground">Approved, unpaid</h2>
      <div className="mb-8 overflow-hidden rounded-xl border border-border">
        {(q.data?.pending ?? []).length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Nothing waiting.</p>
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.pending.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <Link
                  to="/admin/submissions/$id"
                  params={{ id: String(s.id) }}
                  className="min-w-0 hover:underline"
                >
                  <span className="block truncate">{s.creatorName} · {s.campaignTitle}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{money(s.estimatedPayout)} · proof uploaded</span>
                </Link>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-9 w-36"
                    aria-label={`Payment reference for ${s.creatorName}`}
                    placeholder="Reference"
                    value={references[s.id] ?? ""}
                    onChange={(event) => setReferences((current) => ({ ...current, [s.id]: event.target.value }))}
                  />
                  <Button size="sm" onClick={() => void markPaid(s.id)} disabled={payingId === s.id}>
                    {payingId === s.id ? "Saving…" : "Mark paid"}
                  </Button>
                </div>
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
