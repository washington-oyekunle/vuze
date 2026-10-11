import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApproveUsd1Batch, adminListPayouts, adminMarkPaid, adminPrepareUsd1Batch, adminReviewPayoutProof, getMyProfile } from "@/lib/vuze/server";
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
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [preparingBatch, setPreparingBatch] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");
  const [batchId, setBatchId] = useState<number | null>(null);
  const [approvingBatch, setApprovingBatch] = useState(false);

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

  async function reviewProof(submissionId: number, action: "accept" | "reject") {
    setReviewingId(submissionId);
    try {
      await adminReviewPayoutProof({ data: { submissionId, action } });
      toast.success(action === "accept" ? "Analytics proof authenticated" : "Analytics proof rejected");
      await queryClient.invalidateQueries({ queryKey: ["admin-payouts"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not review proof");
    } finally {
      setReviewingId(null);
    }
  }

  async function prepareBatch() {
    setPreparingBatch(true);
    try {
      const batch = await adminPrepareUsd1Batch();
      setBatchId(batch.id);
      setBatchMessage(`USD1 batch #${batch.id} ready with ${batch.itemCount} videos (${(batch.totalUnits / 10 ** batch.tokenDecimals).toFixed(2)} USD1).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare USD1 batch");
    } finally {
      setPreparingBatch(false);
    }
  }

  async function approveBatch() {
    if (!batchId) return;
    setApprovingBatch(true);
    try {
      const batch = await adminApproveUsd1Batch({ data: { batchId } });
      setBatchMessage(`USD1 batch #${batch.id} approved for transfer execution. The transfer worker or Squads treasury must now execute it.`);
      toast.success("USD1 batch approved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve batch");
    } finally {
      setApprovingBatch(false);
    }
  }

  return (
    <AppShell>
      <PageHeader title="Payouts" description="Manual USD1 payout run every Friday. Creators submit links for tracking, then upload Friday analytics proof only for videos they want paid. Authenticate the proof before preparing or paying the batch." action={<Button onClick={() => void prepareBatch()} disabled={preparingBatch}>{preparingBatch ? "Preparing…" : "Prepare USD1 batch"}</Button>} />
      {batchMessage ? <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary p-3 text-sm"><span>{batchMessage}</span>{batchId ? <Button size="sm" variant="outline" onClick={() => void approveBatch()} disabled={approvingBatch}>{approvingBatch ? "Approving…" : "Approve batch"}</Button> : null}</div> : null}
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
                  <span className="text-xs text-muted-foreground tabular-nums">{money(s.estimatedPayout)} · proof {s.payoutProofStatus}</span>
                </Link>
                <div className="flex items-center gap-2">
                  {s.payoutProofStatus === "pending" ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => void reviewProof(s.id, "reject")} disabled={reviewingId === s.id}>Reject proof</Button>
                      <Button size="sm" onClick={() => void reviewProof(s.id, "accept")} disabled={reviewingId === s.id}>Authenticate proof</Button>
                    </>
                  ) : (
                    <>
                      <Input className="h-9 w-36" aria-label={`Payment reference for ${s.creatorName}`} placeholder="Reference" value={references[s.id] ?? ""} onChange={(event) => setReferences((current) => ({ ...current, [s.id]: event.target.value }))} />
                      <Button size="sm" onClick={() => void markPaid(s.id)} disabled={payingId === s.id || s.payoutProofStatus !== "accepted"}>
                        {payingId === s.id ? "Saving…" : "Mark paid"}
                      </Button>
                    </>
                  )}
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
