# Vuze Turnkey payout signer

This standalone Node service implements the HTTPS signer contract consumed by Vuze. It uses Turnkey's server API key to sign one SPL `TransferChecked` instruction for an allowlisted token and treasury. It never holds a wallet private key, creates a recipient token account, pays account rent, or accepts a transaction to broadcast from the caller. It broadcasts only the exact signed bytes it has persisted.

## Safety model

Each request is authenticated with the same long random bearer token configured in Vuze. The signer rejects non-mainnet RPCs, unknown mints or treasuries, decimals that do not match the on-chain mint, unsupported Token-2022 extensions, missing or mismatched source and destination token accounts, insufficient treasury balance, amounts above the per-transfer cap, and daily totals above the configured cap. A PostgreSQL advisory lock reserves each idempotency key and daily budget. The original request, unsigned transaction, signed transaction, and signature are durable; retries rebroadcast only the same signed transaction bytes. A different payload for an existing key is rejected.

Configure Turnkey policies for the treasury account before enabling payouts. Scope the policy to the intended Solana mainnet network, token mint, treasury source account, recipient token-account behavior, and per-transfer amount, and deny other transaction types. The service constructs a single checked transfer and rejects Token-2022 mints with extensions until explicitly supported. The policy should be at least as restrictive as the service's asset allowlist and caps.

## Required environment

Set these variables only in the signer host's secret manager, not in the repository:

| Variable | Purpose |
|---|---|
| `SOLANA_PAYOUTS_ENABLED=true` | Fail-closed activation switch. |
| `DATABASE_URL` | PostgreSQL connection string shared with Vuze; run the repository migration `migrations/0014_turnkey_signer_requests.sql` first. |
| `SOLANA_SIGNER_TOKEN` | Random bearer token, at least 32 bytes; the exact same value belongs in Vuze's `SOLANA_SIGNER_TOKEN`. |
| `SOLANA_RPC_URL` | HTTPS RPC endpoint that resolves to Solana mainnet. |
| `SOLANA_PAYOUT_ASSETS` | JSON array containing `symbol`, `mint`, `decimals`, `treasuryWallet`, `maxPayoutUnits`, and `maxDailyPayoutUnits` for each allowed asset. Unit limits are positive integer strings in the token's smallest units. Vuze and this service must use the same list. |
| `TURNKEY_ORGANIZATION_ID` | Turnkey organization authorized to sign the treasury account. |
| `TURNKEY_API_PUBLIC_KEY` | Server-side Turnkey API key public key. |
| `TURNKEY_API_PRIVATE_KEY` | Server-side Turnkey API key private key; store only as a deployment secret. |
| `TURNKEY_API_BASE_URL` | Optional; defaults to `https://api.turnkey.com`. |
| `PORT` / `HOST` | Optional bind settings; default `8787` / `0.0.0.0`. |

An example asset entry (replace all values deliberately) is:

```json
[
  {
    "symbol": "USD1",
    "mint": "<verified-mainnet-mint>",
    "decimals": 6,
    "treasuryWallet": "<Turnkey-controlled-treasury-public-key>",
    "maxPayoutUnits": "1000000000",
    "maxDailyPayoutUnits": "10000000000"
  }
]
```

Do not use the example limits without choosing and reviewing business-appropriate values. `maxPayoutUnits` is one transfer's ceiling; `maxDailyPayoutUnits` is the aggregate reservation ceiling for that treasury and mint in a UTC day.

## Run and deploy

From this directory, run `pnpm install`, `pnpm build`, then `pnpm start`. Expose only the service's HTTPS endpoint through a trusted TLS proxy; configure Vuze's `SOLANA_SIGNER_URL` to that URL and use a unique `SOLANA_PAYOUT_NAMESPACE` for the Vuze deployment. Apply both Vuze migrations before enabling the approval-to-payout path. The `/healthz` endpoint is intentionally unauthenticated and returns only `{ "ok": true }`; payout routes require bearer authentication.

Do not enable `SOLANA_PAYOUTS_ENABLED` until the Turnkey treasury, mainnet mint and treasury token account, recipient token-account policy, RPC, migration, caps, and Vuze signer URL/token have been reviewed. Running this code or its tests does not configure Turnkey, fund a wallet, deploy the service, or send a payout.

## Official references

See [Turnkey integration references](./REFERENCES.md) for the official Sign Transaction API, Solana transaction, network, and policy documentation used to implement this service.
