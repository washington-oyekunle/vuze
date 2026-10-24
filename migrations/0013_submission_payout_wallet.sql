-- Every new video submission supplies its own payout destination. Existing
-- history is retained without copying a profile-level wallet into the row.
alter table submissions
  add column if not exists payout_wallet_address text;

create or replace function require_submission_payout_wallet()
returns trigger
language plpgsql
as $$
begin
  if new.payout_wallet_address is null or trim(new.payout_wallet_address) = '' then
    raise exception 'a payout wallet is required for every new submission';
  end if;
  return new;
end;
$$;

drop trigger if exists submissions_require_payout_wallet on submissions;
create trigger submissions_require_payout_wallet
before insert on submissions
for each row execute function require_submission_payout_wallet();

create or replace function prevent_submission_payout_wallet_change()
returns trigger
language plpgsql
as $$
begin
  if new.payout_wallet_address is distinct from old.payout_wallet_address then
    raise exception 'payout wallet is immutable for a submission';
  end if;
  return new;
end;
$$;

drop trigger if exists submissions_payout_wallet_immutable on submissions;
create trigger submissions_payout_wallet_immutable
before update of payout_wallet_address on submissions
for each row execute function prevent_submission_payout_wallet_change();

create index if not exists submissions_payout_wallet_idx
  on submissions(payout_wallet_address);
