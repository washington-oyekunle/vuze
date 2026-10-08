import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { Pool } from "pg";
import { env } from "@/lib/env.server";
import { getPglite } from "@/lib/db";
import { pgliteDialect } from "./pglite-dialect";

const databaseUrl = env("DATABASE_URL");

const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

const googleId = env("GOOGLE_CLIENT_ID");
const googleSecret = env("GOOGLE_CLIENT_SECRET");
const twitterId = env("TWITTER_CLIENT_ID");
const twitterSecret = env("TWITTER_CLIENT_SECRET");

export const auth = betterAuth({
  baseURL: env("BETTER_AUTH_URL"),
  secret: env("BETTER_AUTH_SECRET") ?? "dev-only-change-me",
  database,
  emailAndPassword: { enabled: true },
  socialProviders: {
    ...(googleId && googleSecret
      ? { google: { clientId: googleId, clientSecret: googleSecret } }
      : {}),
    ...(twitterId && twitterSecret
      ? { twitter: { clientId: twitterId, clientSecret: twitterSecret } }
      : {}),
  },
  plugins: [tanstackStartCookies()],
});
