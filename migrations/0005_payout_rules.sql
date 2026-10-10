alter table submissions add column if not exists payout_proof_url text not null default '';

create unique index if not exists payouts_submission_unique_idx
  on payouts (submission_id)
  where submission_id is not null;
