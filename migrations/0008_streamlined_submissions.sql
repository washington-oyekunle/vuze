-- The new flow never treats legacy self-reported metrics as API-verified.
alter table campaigns add column min_views integer not null default 1000 check (min_views >= 1000);
alter table submissions add column video_id text;
alter table submissions add column min_views integer not null default 1000 check (min_views >= 1000);
alter table submissions add column verification_status text not null default 'pending'
  check (verification_status in ('pending', 'verified', 'unavailable'));
alter table submissions add column verification_reason text not null default '';
alter table submissions add column verification_source text not null default '';
alter table submissions add column verification_started_at timestamptz;
alter table submissions add column verification_attempt_id text;
alter table submissions add column verified_at timestamptz;
alter table submissions add column analytics_proof_url text not null default '';
alter table submissions add column analytics_proof_type text not null default '';
alter table submissions alter column views type bigint;

create table analytics_proof_uploads (
  id text primary key,
  user_id text not null,
  pathname text not null unique,
  blob_url text not null default '',
  content_type text not null default '',
  size_bytes bigint not null default 0,
  status text not null default 'pending' check (status in ('pending', 'ready', 'claimed')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index analytics_proof_uploads_owner_idx on analytics_proof_uploads(user_id, created_at);
alter table submissions add column proof_upload_id text references analytics_proof_uploads(id);
create unique index submissions_proof_upload_idx on submissions(proof_upload_id) where proof_upload_id is not null;
-- Canonical IDs make tracking params, short links and repeated requests the same entry.
-- Historic rows have null IDs, so existing data is retained without destructive deduplication.
create unique index submissions_video_identity_idx on submissions(platform, video_id) where video_id is not null;
create index submissions_verification_queue_idx on submissions(status, created_at);

update submissions set status = 'verification_failed', verification_status = 'unavailable',
  verification_reason = 'Legacy submission: upload analytics proof and run API verification before review or payment.'
where status in ('under_review', 'needs_proof', 'approved');

-- Existing batches, amounts, reviews, paid entries and payout records are retained
-- unchanged for audit. Reserved batch items require deliberate reconciliation.
