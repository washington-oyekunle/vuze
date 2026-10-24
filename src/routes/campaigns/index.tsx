import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { listCampaigns } from "@/lib/vuze/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CampaignStatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/campaigns/")({ component: CampaignsPage });

type CampaignTypeFilter = "all" | "ugc" | "clipping";
type CampaignStatusFilter = "all" | "live" | "closed";
type CampaignSort = "newest" | "deadline" | "payout";

function CampaignsPage() {
  const q = useQuery({ queryKey: ["campaigns"], queryFn: () => listCampaigns() });
  const [type, setType] = useState<CampaignTypeFilter>("all");
  const [status, setStatus] = useState<CampaignStatusFilter>("live");
  const [sort, setSort] = useState<CampaignSort>("newest");
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...(q.data ?? [])]
      .filter((campaign) => type === "all" || campaign.type === type)
      .filter((campaign) => status === "all" || campaign.status === status)
      .filter((campaign) => {
        if (!needle) return true;
        return [campaign.title, campaign.brand, campaign.summary, campaign.payoutLabel, campaign.payoutTokenSymbol]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => {
        if (sort === "payout") return b.payoutRate - a.payoutRate;
        if (sort === "deadline") {
          const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
          const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
          return aDeadline - bDeadline;
        }
        return b.id - a.id;
      });
  }, [q.data, query, sort, status, type]);

  const hasFilters = query.trim().length > 0 || type !== "all" || status !== "live" || sort !== "newest";

  function resetFilters() {
    setQuery("");
    setType("all");
    setStatus("live");
    setSort("newest");
  }

  return (
    <AppShell>
      <PageHeader
        title="Campaigns"
        description="Organic-only briefs. Views without retention do not count."
      />

      <section className="mb-8 space-y-4" aria-label="Campaign filters">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search campaigns"
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by brand, campaign, or payout"
            />
          </div>
          <label className="flex h-11 items-center gap-2 rounded-lg border border-border bg-secondary px-3 text-sm md:w-48">
            <SlidersHorizontal className="size-4 text-muted-foreground" />
            <span className="sr-only">Sort campaigns</span>
            <select
              aria-label="Sort campaigns"
              className="w-full bg-transparent outline-none"
              value={sort}
              onChange={(event) => setSort(event.target.value as CampaignSort)}
            >
              <option value="newest">Newest first</option>
              <option value="deadline">Deadline soonest</option>
              <option value="payout">Highest payout</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterGroup
            label="Type"
            options={["all", "ugc", "clipping"]}
            value={type}
            onChange={setType}
            format={(value) => (value === "all" ? "All types" : value === "ugc" ? "UGC" : "Clipping")}
          />
          <FilterGroup
            label="Status"
            options={["live", "closed", "all"]}
            value={status}
            onChange={setStatus}
            format={(value) => (value === "all" ? "All status" : value === "live" ? "Live" : "Closed")}
          />
          <span className="ml-auto text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? "campaign" : "campaigns"}
          </span>
          {hasFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
              Reset
            </button>
          ) : null}
        </div>
      </section>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <Search className="size-5 text-muted-foreground" />
            <h2 className="font-medium">No campaigns match those filters</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Try a broader search or switch back to live campaigns to see the current board.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-2 text-sm font-medium underline underline-offset-4 hover:no-underline"
            >
              Clear filters
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((campaign) => (
            <Link key={campaign.id} to="/campaigns/$id" params={{ id: String(campaign.id) }}>
              <Card className="h-full hover:border-ring">
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <Badge>{campaign.type === "ugc" ? "UGC" : "Clipping"}</Badge>
                    <CampaignStatusBadge status={campaign.status} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{campaign.brand}</p>
                    <h2 className="font-medium">{campaign.title}</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">{campaign.summary}</p>
                  <div className="mt-auto flex items-center justify-between gap-3 text-sm">
                    <span>{campaign.payoutLabel} · {campaign.payoutTokenSymbol}</span>
                    {campaign.organicOnly ? <Badge>Organic only</Badge> : null}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  format,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  format: (value: T) => string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="mr-1 text-xs text-muted-foreground">{label}</span>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "h-9 rounded-full px-3 text-sm transition-colors",
            value === option ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
          )}
        >
          {format(option)}
        </button>
      ))}
    </div>
  );
}
