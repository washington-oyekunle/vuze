import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { getGuide } from "@/lib/vuze/server";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/guides/$slug")({ component: GuidePage });

function GuidePage() {
  const { slug } = Route.useParams();
  const q = useQuery({
    queryKey: ["guide", slug],
    queryFn: () => getGuide({ data: { slug } }),
  });
  const g = q.data;
  return (
    <AppShell>
      <Link to="/guides" className="text-sm text-muted-foreground hover:text-foreground">
        All guides
      </Link>
      {g ? (
        <article className="mt-4 max-w-2xl">
          <Badge>{g.category}</Badge>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">{g.title}</h1>
          <p className="mt-2 text-muted-foreground">{g.summary}</p>
          <div className="mt-8 space-y-4 text-sm leading-relaxed whitespace-pre-line">{g.body}</div>
        </article>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      )}
    </AppShell>
  );
}
