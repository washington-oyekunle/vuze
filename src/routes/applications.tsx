import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listMyApplications } from "@/lib/vuze/server";
import { ApplicationStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/applications")({ component: ApplicationsPage });

function ApplicationsPage() {
  const { user, isPending } = useCurrentUserState();
  const q = useQuery({ queryKey: ["my-applications"], queryFn: () => listMyApplications(), enabled: !!user });

  if (isPending) return <AppShell><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  if (!user) return <RedirectToSignIn to="/login" />;

  return (
    <AppShell>
      <PageHeader
        title="Applications"
        description="Track the campaigns you asked to work on and the desk’s decision."
        action={<Button asChild><Link to="/campaigns">Find campaigns</Link></Button>}
      />
      <div className="overflow-hidden rounded-xl border border-border">
        {(q.data ?? []).length === 0 ? (
          <div className="p-6">
            <p className="text-sm text-muted-foreground">No applications yet.</p>
            <Button asChild variant="outline" size="sm" className="mt-4"><Link to="/campaigns">Browse open campaigns</Link></Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.map((application) => (
              <li key={application.id}>
                <Link
                  to="/campaigns/$id"
                  params={{ id: String(application.campaignId) }}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-secondary/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{application.campaignTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {application.campaignBrand} · Applied {new Date(application.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <ApplicationStatusBadge status={application.status} />
                </Link>
                {application.adminNotes ? <p className="px-4 pb-4 text-xs text-muted-foreground">Desk note: {application.adminNotes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
