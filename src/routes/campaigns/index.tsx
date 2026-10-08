import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { listCampaigns } from "@/lib/vuze/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CampaignStatusBadge } from "@/components/status-badge";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/campaigns/")({ component: CampaignsPage });

function CampaignsPage() {
  const q = useQuery({ queryKey: ["campaigns"], queryFn: () => listCampaigns() });
  const [type, setType] = useState<"all" | "ugc" | "clipping">("all");
  const items = (q.data ?? []).filter((c) => (type === "all" ? true : c.type === type));

  return (
    <AppShell>
      <PageHeader
        title="Campaigns"
        description="Organic-only briefs. Views without retention do not count."
      />
      <div className="mb-6 flex gap-2">
        {(["all", "ugc", "clipping"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              "h-11 rounded-full px-4 text-sm",
              type === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
            )}
          >
            {t === "all" ? "All" : t === "ugc" ? "UGC" : "Clipping"}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((c) => (
          <Link key={c.id} to="/campaigns/$id" params={{ id: String(c.id) }}>
            <Card className="h-full hover:border-ring">
              <CardContent className="flex h-full flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Badge>{c.type === "ugc" ? "UGC" : "Clipping"}</Badge>
                  <CampaignStatusBadge status={c.status} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{c.brand}</p>
                  <h2 className="font-medium">{c.title}</h2>
                </div>
                <p className="text-sm text-muted-foreground">{c.summary}</p>
                <div className="mt-auto flex items-center justify-between text-sm">
                  <span>{c.payoutLabel}</span>
                  {c.organicOnly ? <Badge>Organic only</Badge> : null}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
