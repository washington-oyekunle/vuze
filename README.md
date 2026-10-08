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

Set `DATABASE_URL` and `BETTER_AUTH_SECRET` before deploy. Google and X sign-in need `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TWITTER_CLIENT_ID`, and `TWITTER_CLIENT_SECRET`.
