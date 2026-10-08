import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { listAssets } from "@/lib/vuze/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/assets")({ component: AssetsPage });

function AssetsPage() {
  const q = useQuery({ queryKey: ["assets"], queryFn: () => listAssets() });
  return (
    <AppShell>
      <PageHeader title="Assets" description="Scripts, examples, and rules. Use them. Do not spray the same line on every account." />
      <div className="grid gap-4">
        {(q.data ?? []).map((a) => (
          <Card key={a.id}>
            <CardContent>
              <Badge>{a.kind}</Badge>
              <h2 className="mt-3 font-medium">{a.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
              <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-secondary p-4 text-sm leading-relaxed">
                {a.content}
              </pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
