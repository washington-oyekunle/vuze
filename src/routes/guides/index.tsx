import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { listGuides } from "@/lib/vuze/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/guides/")({ component: GuidesPage });

function GuidesPage() {
  const q = useQuery({ queryKey: ["guides"], queryFn: () => listGuides() });
  return (
    <AppShell>
      <PageHeader title="Guides" description="Sustainable growth. Nothing here is a shortcut around the algorithm." />
      <div className="grid gap-3 md:grid-cols-2">
        {(q.data ?? []).map((g) => (
          <Link key={g.slug} to="/guides/$slug" params={{ slug: g.slug }}>
            <Card className="h-full hover:border-ring">
              <CardContent>
                <Badge>{g.category}</Badge>
                <h2 className="mt-3 font-medium">{g.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{g.summary}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
