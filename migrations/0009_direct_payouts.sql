create table if not exists direct_payout_requests (
  id bigserial primary key,
  submission_id integer not null references submissions(id),
  idempotency_key text not null,
  creator_wallet text not null,
  amount_units numeric not null,
  token_mint text not null,
  network text not null,
  treasury_wallet text not null default '',
  transaction_signature text,
  requesting_admin text not null,
  status text not null default 'processing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check (status in ('processing', 'confirmed', 'blocked')),
  check (amount_units > 0),
  check (mod(amount_units, 1) = 0),
  unique (submission_id),
  unique (idempotency_key),
  unique (transaction_signature)
);

alter table direct_payout_requests add column if not exists treasury_wallet text not null default '';

create index if not exists direct_payout_requests_status_idx
  on direct_payout_requests(status, updated_at desc);
create index if not exists direct_payout_requests_admin_idx
  on direct_payout_requests(requesting_admin, created_at desc);
