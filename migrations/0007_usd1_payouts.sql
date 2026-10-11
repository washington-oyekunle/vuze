alter table profiles add column if not exists payout_wallet_address text;
alter table profiles add column if not exists payout_wallet_status text not null default 'not_set';
alter table profiles add column if not exists payout_wallet_verified_at timestamptz;

alter table profiles drop constraint if exists profiles_payout_wallet_status_check;
alter table profiles add constraint profiles_payout_wallet_status_check
  check (payout_wallet_status in ('not_set', 'pending', 'verified', 'rejected'));

create table if not exists payout_batches (
  id serial primary key,
  batch_date date not null,
  asset text not null default 'USD1',
  network text not null default 'solana-mainnet',
  token_mint text not null default 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',
  token_decimals integer not null default 6,
  status text not null default 'draft',
  total_units numeric not null default 0,
  item_count integer not null default 0,
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  check (status in ('draft', 'approved', 'processing', 'paid', 'failed'))
);

create unique index if not exists payout_batches_date_idx on payout_batches (batch_date);

create table if not exists payout_items (
  id serial primary key,
  batch_id integer not null references payout_batches(id) on delete cascade,
  submission_id integer not null references submissions(id),
  user_id text not null,
  wallet_address text not null,
  amount_units numeric not null,
  token_mint text not null,
  status text not null default 'ready',
  idempotency_key text not null,
  transaction_signature text,
  failure_reason text not null default '',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check (status in ('ready', 'processing', 'confirmed', 'failed'))
);

create unique index if not exists payout_items_submission_idx on payout_items (submission_id);
create unique index if not exists payout_items_idempotency_idx on payout_items (idempotency_key);
create unique index if not exists payout_items_signature_idx on payout_items (transaction_signature) where transaction_signature is not null;
create index if not exists payout_items_batch_idx on payout_items (batch_id);
