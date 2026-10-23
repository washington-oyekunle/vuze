create table payout_wallet_reviews (
  id bigserial primary key,
  user_id text not null,
  reviewer_id text not null,
  wallet_address text not null,
  action text not null check (action in ('verify', 'reject')),
  created_at timestamptz not null default now()
);

create index payout_wallet_reviews_user_created_idx
  on payout_wallet_reviews (user_id, created_at desc);

-- All wallet mutations and audit writes are performed by authenticated server code.
-- Browser-facing database roles must not access the review log directly.
alter table payout_wallet_reviews enable row level security;
