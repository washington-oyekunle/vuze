import { Link, useRouterState } from "@tanstack/react-router";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUser, useCurrentUserState } from "@/lib/auth/use-current-user";
import { useQuery } from "@tanstack/react-query";
import { bootstrapMe, getMyProfile } from "@/lib/vuze/server";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import {
  LayoutDashboard,
  Megaphone,
  Clapperboard,
  ClipboardList,
  Wallet,
  BookOpen,
  FolderOpen,
  UserRound,
} from "lucide-react";

const creatorNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/applications", label: "Applications", icon: ClipboardList },
  { to: "/submissions", label: "Submissions", icon: Clapperboard },
  { to: "/earnings", label: "Earnings", icon: Wallet },
  { to: "/guides", label: "Guides", icon: BookOpen },
  { to: "/assets", label: "Assets", icon: FolderOpen },
  { to: "/profile", label: "Profile", icon: UserRound },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const current = useCurrentUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!current) return;
    void bootstrapMe({ data: { displayName: current.displayName ?? current.primaryEmail ?? "Creator" } });
  }, [current?.id]);

  const profileQuery = useQuery({
    queryKey: ["me", current?.id],
    queryFn: () => getMyProfile(),
    enabled: !!current,
  });
  const isAdmin = profileQuery.data?.role === "admin";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="font-display text-lg font-semibold tracking-tight">
            VUZE
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {creatorNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
                  pathname.startsWith(item.to) && "bg-secondary text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
            {isAdmin ? (
              <Link
                to="/admin"
                className={cn(
                  "rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
                  pathname.startsWith("/admin") && "bg-secondary text-foreground",
                )}
              >
                Admin
              </Link>
            ) : null}
          </nav>
          <div className="flex items-center gap-2">
            {isPending ? (
              <div className="size-8 animate-pulse rounded-full bg-secondary" />
            ) : (
              <>
                <SignedOut>
                  <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
                    Sign in
                  </Link>
                </SignedOut>
                <SignedIn>
                  <UserButton />
                </SignedIn>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 pb-24 md:pb-8">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 md:hidden">
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {creatorNav.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md text-[10px]",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

