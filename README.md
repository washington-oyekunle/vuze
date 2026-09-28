# VUZE — Creator Platform

A responsive product prototype for a creator campaign marketplace and trust-first UGC workflow.

## Included screens

- Public landing page with campaign previews, product positioning, and creator education links
- Searchable/filterable campaign marketplace and individual brief pages
- Creator workspace with overview, illustrative earnings, clip history, browser-only demo submissions, and a profile verification preview
- Trust review console with anomaly examples, reviewer controls, and creator-facing reason/appeal principles
- Searchable learning hub with short article previews

## Prototype status

This repository is a **front-end product prototype**, not a production payment or view-tracking system. The campaign, creator, analytics, and moderation records are sample data. New clip submissions and social connection toggles are stored only in the current browser's local storage. No social platform APIs, account-ownership checks, automated view tracking, reviewer notifications, payout processor, wallet signing, or real funds are connected. Do not use the preview data as campaign terms or payment commitments.

The scaffold includes managed authentication/database infrastructure, but the present UI uses a demo workspace and does not yet wire that infrastructure to Discord OAuth or live product records. Production launch requires selecting and configuring the authorized identity provider, social platform access, data-retention and review policy, payout provider, and operational secrets.

## Development

This project uses the Manus WebDev scaffold (React, TypeScript, Tailwind CSS, Express/tRPC, Drizzle/MySQL, and managed OAuth). Start the development server and run checks with:

```bash
pnpm dev
pnpm check
pnpm build
pnpm test
```

Never commit `.env` files, secrets, user tokens, or real campaign/payment data. The supplied VUZE logo is loaded from managed asset storage in the hosted preview.
