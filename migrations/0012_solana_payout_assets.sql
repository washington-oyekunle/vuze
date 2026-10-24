-- Campaign rates are denominated in an explicitly selected Solana token.
-- Existing campaigns retain their historical USD1 denomination.
alter table campaigns add column if not exists payout_token_symbol text not null default 'USD1';
alter table campaigns add column if not exists payout_token_mint text not null default 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB';
alter table campaigns add column if not exists payout_token_decimals integer not null default 6;
alter table campaigns add column if not exists payout_network text not null default 'solana-mainnet';

alter table campaigns drop constraint if exists campaigns_payout_token_decimals_check;
alter table campaigns add constraint campaigns_payout_token_decimals_check
  check (payout_token_decimals between 0 and 18);
alter table campaigns drop constraint if exists campaigns_payout_network_check;
alter table campaigns add constraint campaigns_payout_network_check
  check (payout_network = 'solana-mainnet');

-- A request snapshots the asset identity as well as the recipient, amount and treasury.
alter table direct_payout_requests add column if not exists token_symbol text not null default 'USD1';
alter table direct_payout_requests add column if not exists token_decimals integer not null default 6;
alter table direct_payout_requests drop constraint if exists direct_payout_requests_token_decimals_check;
alter table direct_payout_requests add constraint direct_payout_requests_token_decimals_check
  check (token_decimals between 0 and 18);

-- Older manually recorded payouts may not have a provable asset. Keep them visible
-- as UNKNOWN; only requests with a durable direct-payout snapshot are attributed.
alter table payouts add column if not exists token_symbol text not null default 'UNKNOWN';
alter table payouts add column if not exists token_mint text;
alter table payouts add column if not exists token_decimals integer;
alter table payouts add column if not exists network text;
update payouts p
set token_symbol = d.token_symbol,
    token_mint = d.token_mint,
    token_decimals = d.token_decimals,
    network = d.network
from direct_payout_requests d
where d.submission_id = p.submission_id;
alter table payouts drop constraint if exists payouts_token_decimals_check;
alter table payouts add constraint payouts_token_decimals_check
  check (token_decimals is null or token_decimals between 0 and 18);
