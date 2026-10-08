import { createFileRoute, Link } from "@tanstack/react-router";
import { AUTH_PROVIDERS, signIn, authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const res = await authClient.signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
        });
        if (res.error) throw new Error(res.error.message);
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message);
      }
      window.location.href = "/dashboard";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <Link to="/" className="font-display text-lg font-semibold">
            VUZE
          </Link>
          <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Organic creators only. Fake traffic gets you removed.
          </p>
        </div>
        <div className="space-y-2">
          {AUTH_PROVIDERS.map((p) => (
            <Button
              key={p.providerId}
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => signIn(p.providerId, { callbackURL: "/dashboard" })}
            >
              Continue with {p.label}
            </Button>
          ))}
        </div>
        <div className="relative text-center text-xs text-muted-foreground">
          <span className="bg-background px-2">or email</span>
          <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-border" />
        </div>
        <form className="space-y-3" onSubmit={onEmail}>
          {mode === "up" ? (
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button className="w-full" type="submit" disabled={busy}>
            {mode === "up" ? "Create account" : "Sign in"}
          </Button>
        </form>
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setMode(mode === "up" ? "in" : "up")}
        >
          {mode === "up" ? "Have an account? Sign in" : "New here? Create an account"}
        </button>
      </div>
    </main>
  );
}
