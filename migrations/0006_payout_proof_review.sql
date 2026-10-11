alter table submissions add column if not exists payout_proof_status text not null default 'none';
alter table submissions add column if not exists payout_proof_reviewed_at timestamptz;
alter table submissions add column if not exists payout_proof_admin_notes text not null default '';

update submissions
set payout_proof_status = 'pending'
where payout_proof_url <> '' and payout_proof_status = 'none';

alter table submissions drop constraint if exists submissions_payout_proof_status_check;
alter table submissions add constraint submissions_payout_proof_status_check
  check (payout_proof_status in ('none', 'pending', 'accepted', 'rejected'));
