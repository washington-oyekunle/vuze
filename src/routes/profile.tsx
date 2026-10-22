import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useQuery } from "@tanstack/react-query";
import {
  getMyProfile,
  updateMyProfile,
  updatePayoutWallet,
} from "@/lib/vuze/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

function ProfilePage() {
  const { user, isPending } = useCurrentUserState();
  const q = useQuery({
    queryKey: ["me"],
    queryFn: () => getMyProfile(),
    enabled: !!user,
  });
  const p = q.data;
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [walletAddress, setWalletAddress] = useState("");

  useEffect(() => {
    if (!p) return;
    setDisplayName(p.displayName);
    setHandle(p.handle ?? "");
    setBio(p.bio);
    setTiktokUrl(p.tiktokUrl ?? "");
    setInstagramUrl(p.instagramUrl ?? "");
    setYoutubeUrl(p.youtubeUrl ?? "");
    setWalletAddress(p.payoutWalletAddress ?? "");
  }, [p]);

  if (isPending)
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  if (!user) return <RedirectToSignIn to="/login" />;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateMyProfile({
        data: { displayName, handle, bio, tiktokUrl, instagramUrl, youtubeUrl },
      });
      toast.success("Saved");
      await q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  async function onSaveWallet(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updatePayoutWallet({ data: { walletAddress } });
      toast.success("Wallet submitted for admin verification");
      await q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save wallet");
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Profile"
        description="This is what reviewers see next to your submissions."
      />
      <div className="mb-4 flex gap-2">
        {p?.organicVerified ? (
          <Badge tone="good">Verified organic</Badge>
        ) : (
          <Badge>Unverified</Badge>
        )}
        {p?.role === "admin" ? <Badge>Admin</Badge> : null}
        {p?.suspended ? <Badge tone="bad">Suspended</Badge> : null}
      </div>
      <Card>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSave}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Display name</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Handle</Label>
                <Input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Bio</Label>
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>TikTok</Label>
              <Input
                value={tiktokUrl}
                onChange={(e) => setTiktokUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Instagram</Label>
              <Input
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>YouTube</Label>
              <Input
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
              />
            </div>
            <Button type="submit">Save profile</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardContent>
          <form className="grid gap-3" onSubmit={onSaveWallet}>
            <div>
              <h2 className="text-sm font-medium">USD1 payout wallet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use a Solana mainnet wallet that can receive USD1. Wallet
                changes require admin verification before payment.
              </p>
            </div>
            <Label htmlFor="wallet">Solana wallet address</Label>
            <Input
              id="wallet"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="Your Solana public address"
              required
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge
                tone={
                  p?.payoutWalletStatus === "verified"
                    ? "good"
                    : p?.payoutWalletStatus === "rejected"
                      ? "bad"
                      : undefined
                }
              >
                {p?.payoutWalletStatus ?? "not_set"}
              </Badge>
              {p?.payoutWalletStatus === "pending"
                ? "Awaiting admin verification"
                : null}
            </div>
            <Button type="submit">Submit wallet for verification</Button>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}
