import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { adminListApplications, adminReviewApplication, getMyProfile } from "@/lib/vuze/server";
import { ApplicationStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ApplicationStatus } from "@/lib/vuze/types";

export const Route = createFileRoute("/admin/applications")({ component: AdminApplications });

type Filter = ApplicationStatus | undefined;

function AdminApplications() {
  const { user, isPending } = useCurrentUserState();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile(), enabled: !!user });
  const [status, setStatus] = useState<Filter>("pending");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-applications", status],
    queryFn: () => adminListApplications({ data: { status } }),
    enabled: me.data?.role === "admin",
  });

  if (isPending) return <AppShell><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  if (!user) return <RedirectToSignIn to="/login" />;
  if (me.data && me.data.role !== "admin") return <AppShell><p className="text-sm">Admin only.</p></AppShell>;

  const filters: { id: Filter; label: string }[] = [
    { id: "pending", label: "Needs review" },
    { id: "accepted", label: "Accepted" },
    { id: "declined", label: "Declined" },
    { id: undefined, label: "All" },
  ];

  async function review(id: number, action: "accept" | "decline") {
    setBusyId(id);
    try {
      await adminReviewApplication({ data: { id, action, notes: notes[id] } });
      await queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      toast.success(action === "accept" ? "Creator accepted" : "Application declined");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update application");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Applications"
        description="The VUZE desk represents the brand. Review creator fit before they start work."
        action={<Button asChild variant="outline"><Link to="/admin">Admin home</Link></Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={String(filter.id)}
            type="button"
            onClick={() => setStatus(filter.id)}
            className={cn(
              "h-11 rounded-full px-4 text-sm",
              status === filter.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        {(q.data ?? []).length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No applications in this view.</p>
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.map((application) => (
              <li key={application.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{application.creatorName} · {application.campaignTitle}</p>
                    <p className="text-xs text-muted-foreground">{application.campaignBrand} · {new Date(application.createdAt).toLocaleDateString()}</p>
                  </div>
                  <ApplicationStatusBadge status={application.status} />
                </div>
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {application.pitch || "No pitch included. Review the creator profile before deciding."}
                </p>
                {application.adminNotes ? <p className="text-xs text-muted-foreground">Desk note: {application.adminNotes}</p> : null}
                {application.status === "pending" ? (
                  <div className="space-y-2">
                    <Textarea
                      aria-label={`Review note for ${application.creatorName}`}
                      value={notes[application.id] ?? ""}
                      onChange={(event) => setNotes((current) => ({ ...current, [application.id]: event.target.value }))}
                      placeholder="Optional note for the creator"
                      className="min-h-20"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void review(application.id, "accept")} disabled={busyId === application.id}>
                        Accept creator
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void review(application.id, "decline")} disabled={busyId === application.id}>
                        Decline
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
