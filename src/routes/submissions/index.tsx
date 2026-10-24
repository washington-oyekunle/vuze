import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useQuery } from "@tanstack/react-query";
import { listMySubmissions } from "@/lib/vuze/server";
import { SubmissionStatusBadge } from "@/components/status-badge";
import { compactNumber, tokenAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/submissions/")({ component: SubmissionsPage });

function SubmissionsPage() {
  const { user, isPending } = useCurrentUserState();
  const q = useQuery({ queryKey: ["mysubs"], queryFn: () => listMySubmissions(), enabled: !!user });
  if (isPending) return <AppShell><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  if (!user) return <RedirectToSignIn to="/login" />;

  return (
    <AppShell>
      <PageHeader
        title="Submissions"
        description="Every clip you posted against a campaign."
        action={
          <Button asChild>
            <Link to="/submit">New submission</Link>
          </Button>
        }
      />
      <div className="overflow-hidden rounded-xl border border-border">
        {(q.data ?? []).length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No clips yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.map((s) => (
              <li key={s.id}>
                <Link
                  to="/submissions/$id"
                  params={{ id: String(s.id) }}
                  className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-secondary/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{s.campaignTitle}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {compactNumber(s.views)} views · est. {tokenAmount(s.estimatedPayout, s.payoutTokenSymbol, s.payoutTokenDecimals, s.payoutTokenMint)}
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
