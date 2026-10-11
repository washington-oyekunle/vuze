# VUZE

Creator desk for organic UGC and clipping campaigns.

No view bots. Submissions need a public post link plus retention or watch time. Payouts only move after review.

## What it does

- Campaign board (UGC and clipping, organic only)
- Clip submission with analytics proof
- Creator dashboard, earnings, profile
- Guides and asset library
- Admin review queue, creator tools, payouts

The first account on a fresh database is admin.

## Stack

TanStack Start, React, Postgres.

## Scripts

```
npm install
npm run dev
npm run build
```

Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BLOB_READ_WRITE_TOKEN` before deploy. `BLOB_READ_WRITE_TOKEN` is required for approved creators to upload analytics screen recordings for payout. Google and X sign-in need `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TWITTER_CLIENT_ID`, and `TWITTER_CLIENT_SECRET`.

## USD1 payouts

VUZE payout batches are configured for USD1 on Solana mainnet. The application uses the official USD1 Solana mint `USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB` with 6 decimals. Creators register a Solana wallet, an admin verifies it, and Friday batches include only approved submissions with authenticated analytics proof and verified wallets.

The current batch workflow prepares and approves an auditable USD1 payout batch. It does not hold or embed a treasury private key and does not broadcast token transfers from the web app. Connect the approved batch to Squads Protocol or another secure signer/treasury worker before enabling live USD1 transfers.
