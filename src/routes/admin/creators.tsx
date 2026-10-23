import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useQuery } from "@tanstack/react-query";
import { adminListCreators, adminReviewPayoutWallet, adminUpdateCreator, getMyProfile } from "@/lib/vuze/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/creators")({ component: AdminCreators });

function AdminCreators() {
  const { user, isPending } = useCurrentUserState();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile(), enabled: !!user });
  const q = useQuery({
    queryKey: ["admin-creators"],
    queryFn: () => adminListCreators(),
    enabled: me.data?.role === "admin",
  });

  if (isPending) return <AppShell><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  if (!user) return <RedirectToSignIn to="/login" />;
  if (me.data && me.data.role !== "admin") return <AppShell><p>Admin only.</p></AppShell>;

  async function patch(userId: string, data: { suspended?: boolean; organicVerified?: boolean }) {
    try {
      await adminUpdateCreator({ data: { userId, ...data } });
      toast.success("Updated");
      await q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function reviewWallet(
    userId: string,
    walletAddress: string,
    action: "verify" | "reject",
  ) {
    try {
      await adminReviewPayoutWallet({ data: { userId, walletAddress, action } });
      toast.success(action === "verify" ? "Payout wallet verified" : "Payout wallet rejected");
      await q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not review wallet");
      await q.refetch();
    }
  }

  return (
    <AppShell>
      <PageHeader title="Creators" />
      <div className="overflow-hidden rounded-xl border border-border">
        <ul className="divide-y divide-border">
          {(q.data ?? []).map((c) => (
            <li key={c.userId} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">{c.displayName}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {c.submissions} posts · {money(c.earned)}
                </p>
                <div className="mt-2 flex gap-2">
                  {c.role === "admin" ? <Badge>Admin</Badge> : null}
                  {c.organicVerified ? <Badge tone="good">Organic</Badge> : null}
                  {c.suspended ? <Badge tone="bad">Suspended</Badge> : null}
                  {c.payoutWalletStatus === "verified" ? <Badge tone="good">USD1 wallet verified</Badge> : c.payoutWalletStatus !== "not_set" ? <Badge>{`Wallet ${c.payoutWalletStatus}`}</Badge> : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {c.payoutWalletAddress ? <span className="max-w-56 truncate self-center text-xs text-muted-foreground" title={c.payoutWalletAddress}>{c.payoutWalletAddress}</span> : null}
                {c.payoutWalletStatus === "pending" ? (
                  <>
                    <Button size="sm" variant="outline" disabled={!c.payoutWalletAddress} onClick={() => c.payoutWalletAddress && void reviewWallet(c.userId, c.payoutWalletAddress, "reject")}>Reject wallet</Button>
                    <Button size="sm" disabled={!c.payoutWalletAddress} onClick={() => c.payoutWalletAddress && void reviewWallet(c.userId, c.payoutWalletAddress, "verify")}>Verify wallet</Button>
                  </>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => void patch(c.userId, { organicVerified: !c.organicVerified })}>
                  Toggle verified
                </Button>
                <Button size="sm" variant="outline" onClick={() => void patch(c.userId, { suspended: !c.suspended })}>
                  {c.suspended ? "Reinstate" : "Suspend"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
