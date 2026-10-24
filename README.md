# VUZE

Vuze is a creator desk for organic UGC and clipping campaigns, built with TanStack Start, React, and Postgres. The production workflow targets Supabase Postgres plus private Supabase Storage. Existing Better Auth sign-in remains in place; this is not a Supabase Auth migration.

## Creator review and payout flow

1. A creator submits a public video URL, an analytics screenshot or recording, and the Solana wallet to use for **that video**. PNG, JPEG, WebP, MP4, and WebM proof files are supported, up to 25 MiB. Proof goes directly into private Storage; the app server never receives a large multipart body.
2. Vuze retrieves the video's view count from an independent provider. At or above the campaign minimum (default 1,000), the entry enters admin review; below the minimum, it stays out of review and can be checked again on the same entry after views grow. Missing permissions, unavailable metrics, timeouts, and exhausted API quotas create a recoverable verification hold, not a zero-view rejection.
3. The admin reviews the video, uploaded analytics proof, verified count, eligibility, and the address saved on the submission. Approving the video automatically initiates its configured token payout; no second payout click is needed when the signer is ready. The address is immutable for that entry, and a creator may use a different wallet on another video.
4. The isolated Turnkey signer accepts only allowlisted, capped Solana SPL `TransferChecked` transfers. Vuze records payment only after it verifies a finalized Solana mainnet transaction against the saved request. A video identity can be submitted once across campaigns and creators, and each submission can have only one direct payout request, preventing a second payout for the same post.

The signer does not create recipient token accounts or pay account rent. The creator's wallet therefore needs an associated token account for the selected asset before approval, otherwise the signer safely blocks the transfer. Existing payout batches and history remain for audit; old batch reservations are not silently converted to direct payments.

## Local development and checks

Use Node.js 24 or newer:

```sh
npm ci
npm test
npm run typecheck
npm run dev
```

`npm run build` compiles the app and runs database migrations if `DATABASE_URL` is configured; it is a database-changing operation on a configured environment. For compilation alone, use `npx vite build`. Without `DATABASE_URL`, the local PGLite database is in-memory and resets when the process restarts. It is a development preview only; live payouts refuse to run there.

The isolated signer package is in [`services/turnkey-signer`](services/turnkey-signer/README.md). Its local tests use fakes and do not call Turnkey or Solana RPC.

## Supabase setup

1. Set the server-only Postgres connection string as `DATABASE_URL`. For serverless hosting, use Supabase's transaction pooler. Never expose this URL in browser code.
2. Set `SUPABASE_URL` and the server-only `SUPABASE_SERVICE_ROLE_KEY` for private proof storage. Browser uploads receive an exact-path signed upload URL, never the service key.
3. Run app migrations in order with `npm run db:migrate`, and run [`scripts/setup-supabase-storage.sql`](scripts/setup-supabase-storage.sql) in the project's SQL editor. It creates the private `analytics-proof` bucket, a 25 MiB limit, and allowed MIME types.
4. Set `BETTER_AUTH_URL`, a strong `BETTER_AUTH_SECRET`, and any OAuth variables used for sign-in.

Migration `0010` enables row-level security without browser policies on app and Better Auth tables. Direct Supabase browser queries are intentionally denied. Proof reads require the creator's session or an admin session; do not add broad anon/authenticated policies. On a fresh database, public signups are not automatically admins. Configure `ADMIN_USER_IDS` before the first profiles are created, or promote the intended existing profile using a privileged SQL session.

Migrations `0013` and `0014` add immutable per-submission wallet addresses and server-only Turnkey request records. Every new submission requires a valid Solana public key; the database rejects new rows without a wallet and blocks edits to the wallet after creation. Existing historical rows are retained without copying a profile wallet and cannot be approved for payout unless they have a valid destination.

## View verification

For YouTube, set `YOUTUBE_DATA_API_KEY`; the server calls the official `videos.list` statistics endpoint for the exact video ID. Full TikTok `/@creator/video/…` links and Instagram Reel links are accepted, but independent metrics for those services require creator-authorized account access. To support TikTok or Instagram, operate a trusted OAuth-backed analytics adapter and set `ANALYTICS_VERIFIER_URL` (HTTPS) and `ANALYTICS_VERIFIER_TOKEN`. The adapter must return independently fetched, fresh counts bound to the exact submitted identity; it must never echo creator-entered metrics.

Views do not establish ownership, audience quality, or organic traffic. Admins still review the actual video and the creator-provided analytics proof. The review queue refreshes every five seconds using polling, not WebSocket/Realtime.

## Solana payout setup

Campaigns select from an explicit server-side allowlist of Solana SPL or extension-free Token-2022 mints. Rates are denominated in the configured token; Vuze does not convert tokens to USD. Verify every mint, decimal count, treasury, and campaign rate. Native SOL is not supported. A campaign's token cannot be changed after submissions exist.

Payouts remain disabled until the Vuze app and the separate signer are both configured. The app requires `SOLANA_PAYOUTS_ENABLED=true`, a durable `DATABASE_URL`, an HTTPS `SOLANA_SIGNER_URL`, a bearer `SOLANA_SIGNER_TOKEN`, a unique `SOLANA_PAYOUT_NAMESPACE`, an HTTPS mainnet `SOLANA_RPC_URL`, and `SOLANA_PAYOUT_ASSETS`. The signer uses the same database, token, RPC URL, and asset list, plus Turnkey API credentials. See the [Turnkey signer deployment guide](services/turnkey-signer/README.md) for the environment variable list and run instructions.

Each `SOLANA_PAYOUT_ASSETS` JSON entry must have `symbol`, `mint`, `decimals`, `treasuryWallet`, `maxPayoutUnits`, and `maxDailyPayoutUnits`. Limits are positive integer strings in the token's smallest units; do not copy sample limits without choosing and reviewing appropriate amounts. The daily cap is reserved per treasury and mint by UTC day. The allowlist is capped at 50 unique mints. The signer checks the mainnet network, mint, decimals, treasury token account, destination token account, and balance before signing; Vuze independently validates the finalized transaction before recording payment.

The signer requires a Turnkey policy scoped to the intended treasury and token transfer. It builds one checked transfer, verifies Turnkey signed the exact original message, stores signed bytes before broadcasting, and only retries that same signature. Requests with changed payloads, unsupported Token-2022 extensions, missing token accounts, invalid configurations, or exceeded caps are rejected. Vuze validates the finalized transaction, treasury signature and source, recipient ownership, mint, and exact token-unit deltas before recording payment.

A payout with an uncertain outcome stays `payment_processing`. Admin and creator detail views automatically reconcile an existing request, retrying only its immutable payload under the same idempotency key if the signer has no record; this cannot create a second transfer, even if new payouts are later disabled. A blocked signer request requires review; never delete or recreate a request with a new key, because this could bypass duplicate-payment protection. There is no live signer credential, deployment, treasury funding, or live payout in this repository change. Enabling automatic payouts is a separate operational step after review of Turnkey policies, deployment secrets, treasury funding, recipient token-account readiness, and caps.

## Rollout

Back up production and rehearse all migrations on Supabase staging. Migration `0008` moves legacy unpaid submissions onto a verification hold because their old view counts were self-reported; prior proof, review history, amounts, and payout history remain for audit. Creators must reverify before returning to review. Reserved batch items continue to block direct payment until an operator deliberately reconciles them.

Validate real private uploads, provider credentials, creator/admin separation, per-video wallet immutability, signer idempotency, cap enforcement, and reconciliation in staging before enabling production payments. A successful build and unit tests are not evidence that a live Supabase project or mainnet transfer is connected.
