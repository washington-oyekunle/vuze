create table if not exists turnkey_payout_signer_requests (
  idempotency_key text primary key,
  destination_wallet text not null,
  treasury_wallet text not null,
  token_mint text not null,
  amount_units numeric not null,
  token_decimals integer not null,
  network text not null,
  unsigned_transaction text,
  signed_transaction text,
  transaction_signature text unique,
  last_valid_block_height bigint,
  status text not null default 'accepted',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_broadcast_at timestamptz,
  last_error_code text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_units > 0),
  check (mod(amount_units, 1) = 0),
  check (token_decimals between 0 and 18),
  check (network = 'solana-mainnet'),
  check (status in ('accepted', 'prepared', 'signed', 'included', 'expired', 'blocked'))
);

create index if not exists turnkey_payout_signer_pending_idx
  on turnkey_payout_signer_requests(status, next_attempt_at, created_at)
  where status in ('accepted', 'prepared', 'signed');

alter table direct_payout_requests
  add column if not exists failure_reason text not null default '';

alter table turnkey_payout_signer_requests enable row level security;
