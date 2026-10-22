# VUZE

A creator desk for organic UGC and clipping campaigns, built with TanStack Start, React, and Postgres. The new workflow targets **Supabase Postgres + private Supabase Storage**. Existing Better Auth sign-in remains in place; this is not a Supabase Auth migration.

## The four-step flow

1. **Creator:** submit a public video URL and an analytics screenshot or recording together. PNG, JPEG, WebP, MP4, and WebM are supported, up to 25 MiB. Files upload directly into private Storage; the web server never receives a large multipart body.
2. **Automatic verification:** the server retrieves the view count. At or above the campaign minimum (default 1,000), the entry enters review; below the minimum, it is automatically rejected. Missing permission, unavailable metrics, timeouts, and exhausted API quotas produce a recoverable verification hold, **not a zero-view rejection**.
3. **Admin console:** the queue refreshes every five seconds. Admins visually review the uploaded proof and approve or decline with an audited reason. This is polling, not a WebSocket/Realtime subscription. View counts do not establish ownership, audience quality, or organic traffic; proof review still matters.
4. **Pay:** an admin requests one USD1 payment through a separately operated secure signer. A durable request snapshots the recipient and amount. Repeated clicks reconcile that request; ambiguous requests never create a new transfer. The entry closes only after the server verifies a finalized Solana mainnet transaction against the snapshot.

The Friday-only second proof upload, new Friday batches, and manual “mark paid” write paths are retired. Existing batch tables and history remain for audit.

## Local development and checks

Use Node.js 24 or newer (the tests use native TypeScript support):

```sh
npm ci
npm test
npm run typecheck
npm run dev
```

`npm run build` compiles the app and runs database migrations if `DATABASE_URL` is configured. **Build is therefore a database-changing operation on a configured environment.** For compilation alone, use `npx vite build`. No external APIs, storage, or payments are simulated as successful in the app when their credentials are absent.

Without `DATABASE_URL`, the local PGLite database is in-memory and resets when the process restarts. It is a development preview only; live payouts refuse to run against it.

## Configure Supabase

1. Choose a Supabase project. Put its server-side Postgres connection string in `DATABASE_URL`. For serverless hosting, use the Supabase transaction pooler connection string; this app uses parameterized, unnamed queries and connection-scoped transactions. Never expose this URL in browser code.
2. Set `SUPABASE_URL` and the **server-only** `SUPABASE_SERVICE_ROLE_KEY`. These are used only by the proof storage server module. Browser uploads receive an exact-path signed upload URL, never the key.
3. Run the app migrations in order: `npm run db:migrate`.
4. In that project's SQL editor, run [`scripts/setup-supabase-storage.sql`](scripts/setup-supabase-storage.sql). It creates the private `analytics-proof` bucket, a 25 MiB limit, and allowed MIME types. If you use another bucket name, adjust both that script and `SUPABASE_ANALYTICS_BUCKET`.
5. Set `BETTER_AUTH_URL` and a strong `BETTER_AUTH_SECRET`. Set Google/X OAuth variables if using those sign-in providers.

Migration `0010` enables row-level security without browser policies on all app and Better Auth tables. Authorization goes through the existing authenticated server functions using a privileged, server-only Postgres connection. Direct Supabase browser queries are intentionally denied. Proof reads require the creator's session or an admin session. **Do not add broad anon/authenticated table or storage policies.** Supabase Auth/JWT-based browser access would require a separate authorization redesign.

On a fresh deployed database, the first public signup is **not** automatically admin. Configure `ADMIN_USER_IDS` before those users first create their profiles, or explicitly promote the intended existing profile through a privileged SQL session. Existing admin profiles are retained. The first local in-memory demo user can still be admin; live payments are disabled there.

## Connect view verification

For YouTube, set `YOUTUBE_DATA_API_KEY`. The server uses the official `videos.list` statistics endpoint for the exact video ID. Full TikTok `/@creator/video/…` links and Instagram Reel links are accepted; shortened TikTok redirects must be expanded by the creator.

TikTok metrics require the creator's authorized account access; Instagram insights require authorized professional-account access. Neither arbitrary public links nor Supabase alone provide these permissions. To support those platforms, implement and operate a trusted analytics adapter with the necessary OAuth connections, then set `ANALYTICS_VERIFIER_URL` (HTTPS) and `ANALYTICS_VERIFIER_TOKEN`. No such external adapter or social-account connection UI is deployed by this change.

The app sends:

```json
{ "platform": "instagram", "videoId": "ReelCode", "postUrl": "https://www.instagram.com/reel/ReelCode/" }
```

The adapter must return an independently fetched count bound to that exact identity:

```json
{ "platform": "instagram", "videoId": "ReelCode", "views": 1200, "source": "instagram-graph-api", "observedAt": "<current ISO-8601 timestamp>" }
```

Evidence older than five minutes, missing counts, mismatched IDs, malformed counts, and provider failures are held for retry. Never implement this adapter by echoing creator-entered metrics. Provider quota and permissions must be monitored in the service that owns the adapter.

## Connect USD1 safely

The configured asset is USD1 on Solana mainnet, mint `USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB`, with six decimals. Verify your treasury's asset and permissions before enabling payments. No treasury private key belongs in this app or in browser code.

Payments stay disabled until all of these are configured:

- `USD1_PAYOUTS_ENABLED=true`
- A durable `DATABASE_URL`
- `USD1_SIGNER_URL` (HTTPS), `USD1_SIGNER_TOKEN`, and `USD1_PAYOUT_NAMESPACE` (a stable, unique deployment name so staging and production cannot reuse payout keys)
- `SOLANA_RPC_URL` (HTTPS, mainnet)
- `USD1_TREASURY_WALLET` (treasury public key)

The separately operated signer must expose:

- `POST {USD1_SIGNER_URL}/payouts/{idempotencyKey}` with `{idempotencyKey,destination,mint,amountUnits,network}`. Persist the key and immutable payload **before** broadcasting. A key can never authorize a second transfer or a changed payload.
- `GET {USD1_SIGNER_URL}/payouts/{idempotencyKey}` to reconcile that same request.
- Return `{ "signature": "<Solana transaction signature>" }` once the transaction exists. Pending/not-found responses must not cause another broadcast. Bearer authentication is required.

The application verifies finalized mainnet transaction success, treasury signature and source, recipient ownership, mint, and exact token-unit deltas before recording payment. Creator wallets must be admin-verified, the account must not be suspended, and submissions must be API-verified, unflagged, and approved. Payment history records the chain signature.

A persisted request with an uncertain outcome stays `payment_processing`. The open admin detail screen automatically reconciles existing requests every ten seconds without initiating another transfer; the payout list opens that detail screen after a pending payment. If the screen is closed, the request remains durable and reconciliation resumes on the next visit. Always-on reconciliation needs a separately deployed application worker; this change does not provision one. Admins can also use **Check payment**, or reconcile with the signer operator. Do not delete/recreate payout requests to “retry”; that could bypass duplicate-payment protection. This change defines the signer integration contract; it does not deploy or fund a treasury signer or demonstrate a live transfer.

## Roll out carefully

Back up production and rehearse migrations on a Supabase staging project first. Migration `0008` places existing unpaid review/approved submissions on a verification hold because their old counts were self-reported. Their previous amounts, proof links, review history, and payout history are retained. Creators upload upfront proof and reverify before re-entering review. Old batch reservations are preserved and block direct payment until an operator deliberately reconciles them; they are not silently converted or deleted.

Migrations are additive and ordered, but the new review rules intentionally change eligibility. Validate real private uploads, provider credentials, creator/admin access separation, and signer reconciliation in staging before enabling production payments. Unit/database tests and a successful build are not evidence that a live Supabase project or mainnet transfer has been connected.
