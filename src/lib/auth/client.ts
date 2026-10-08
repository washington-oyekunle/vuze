import { createAuthClient } from "better-auth/react";
import { AUTH_PROVIDERS } from "./providers";

export const authClient = createAuthClient();

export const authEnabled = true;
export { AUTH_PROVIDERS };

export function signIn(providerId: "google" | "twitter", opts?: { callbackURL?: string }) {
  return authClient.signIn.social({
    provider: providerId,
    callbackURL: opts?.callbackURL ?? "/dashboard",
  });
}

export async function signOut() {
  await authClient.signOut();
  window.location.href = "/";
}
