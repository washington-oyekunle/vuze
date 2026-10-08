import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useQuery } from "@tanstack/react-query";
import { adminListSubmissions, getMyProfile } from "@/lib/vuze/server";
import { SubmissionStatusBadge } from "@/components/status-badge";
import { compactNumber } from "@/lib/utils";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/submissions")({ component: AdminSubs });

function AdminSubs() {
  const { user, isPending } = useCurrentUserState();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile(), enabled: !!user });
  const [status, setStatus] = useState<string | undefined>("under_review");
  const q = useQuery({
    queryKey: ["admin-subs", status],
    queryFn: () => adminListSubmissions({ data: { status } }),
    enabled: me.data?.role === "admin",
  });

  if (isPending) return <AppShell><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  if (!user) return <RedirectToSignIn to="/login" />;
  if (me.data && me.data.role !== "admin") return <AppShell><p className="text-sm">Admin only.</p></AppShell>;

  const filters = [
    { id: "under_review", label: "Review" },
    { id: "needs_proof", label: "Proof" },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" },
    { id: undefined, label: "All" },
  ];

  return (
    <AppShell>
      <PageHeader title="Review queue" description="Approve organic work. Reject stairs-shaped traffic." />
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={String(f.id)}
            type="button"
            onClick={() => setStatus(f.id)}
            className={cn(
              "h-11 rounded-full px-4 text-sm",
              status === f.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        {(q.data ?? []).length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Queue is empty.</p>
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.map((s) => (
              <li key={s.id}>
                <Link
                  to="/admin/submissions/$id"
                  params={{ id: String(s.id) }}
                  className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-secondary/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {s.creatorName} · {s.campaignTitle}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {compactNumber(s.views)} views · {s.retentionPct ?? "—"}% ret
                      {s.flagged ? " · flagged" : ""}
                    </p>
                  </div>
                  <SubmissionStatusBadge status={s.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
