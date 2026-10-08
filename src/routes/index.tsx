import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listCampaigns } from "@/lib/vuze/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CampaignStatusBadge } from "@/components/status-badge";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { ShieldCheck, Clapperboard, Wallet, Ban } from "lucide-react";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: () => listCampaigns() });
  const live = (campaigns.data ?? []).filter((c) => c.status === "live").slice(0, 3);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <span className="font-display text-xl font-semibold">VUZE</span>
        <div className="flex items-center gap-3">
          <Link to="/guides" className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">
            Guides
          </Link>
          <SignedOut>
            <Button asChild size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
          </SignedOut>
          <SignedIn>
            <Button asChild size="sm">
              <Link to="/dashboard">Open desk</Link>
            </Button>
          </SignedIn>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 md:pt-20">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Organic UGC and clipping
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
          Campaigns for creators who refuse fake numbers.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
          Submit clips. We track retention, comments, and audience mix — not a view count you bought.
          Payouts follow approved organic work.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/login">Create an account</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/campaigns">View campaigns</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 md:grid-cols-4">
        {[
          { icon: Ban, title: "No view bots", body: "Inflated traffic voids the payout and the seat." },
          { icon: Clapperboard, title: "Tracked submissions", body: "Every post has a status, notes, and a paper trail." },
          { icon: ShieldCheck, title: "Proof required", body: "Retention and watch time, not a views screenshot." },
          { icon: Wallet, title: "Clear payouts", body: "Approved work moves to a queue you can actually see." },
        ].map((item) => (
          <Card key={item.title}>
            <CardContent className="flex flex-col gap-3">
              <item.icon className="size-5 text-muted-foreground" />
              <h2 className="font-medium">{item.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-display text-2xl font-semibold">Open campaigns</h2>
          <Link to="/campaigns" className="text-sm text-muted-foreground hover:text-foreground">
            All campaigns
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {live.map((c) => (
            <Link key={c.id} to="/campaigns/$id" params={{ id: String(c.id) }}>
              <Card className="h-full transition-colors hover:border-ring">
                <CardContent className="flex h-full flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <Badge>{c.type === "ugc" ? "UGC" : "Clipping"}</Badge>
                    <CampaignStatusBadge status={c.status} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{c.brand}</p>
                    <h3 className="mt-1 font-medium">{c.title}</h3>
                  </div>
                  <p className="line-clamp-3 text-sm text-muted-foreground">{c.summary}</p>
                  <p className="mt-auto text-sm">{c.payoutLabel}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
