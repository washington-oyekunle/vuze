# VUZE — Creator Platform

A responsive creator campaign marketplace and trust-first workflow prototype.

## Included screens

- Public landing page with VUZE product positioning and launch-safe opportunity states
- Campaign marketplace and detail routes that remain empty until real campaign terms are published
- Creator workspace with empty states for campaigns, submissions, leaderboard, earnings, and social-account linking
- Trust-review console that shows no cases until moderation records are connected
- Creator resource library that remains empty until approved guidance is published

## Data and integration status

No campaign, creator, clip, leaderboard, moderation, earnings, or resource seed records are included. The app clears the legacy `vuze-demo-submissions` and `vuze-demo-socials` browser storage keys on startup and does not recreate them. Other browser storage is left untouched.

This is a front-end prototype, not a production view-tracking, moderation, or payment system. Social-account ownership checks, automated view tracking, reviewer actions, payout processing, and connected campaign records are not configured. Do not treat the absence of displayed records as an account balance or campaign offer.

The scaffold includes managed authentication and database infrastructure, but the current creator views are not yet connected to live product records. Production launch requires an authorized identity and social-platform integration, a documented data-retention/review policy, a payout provider, and operational secrets.

## Development

This project uses the Manus WebDev scaffold (React, TypeScript, Tailwind CSS, Express/tRPC, Drizzle/MySQL, and managed OAuth). Run:

```bash
pnpm dev
pnpm check
pnpm build
pnpm test
```

Never commit `.env` files, secrets, user tokens, or real campaign/payment data. The supplied VUZE logo is loaded from managed asset storage in the hosted preview.
