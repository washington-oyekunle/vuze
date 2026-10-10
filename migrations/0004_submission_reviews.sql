create table if not exists submission_reviews (
  id serial primary key,
  submission_id integer not null references submissions(id) on delete cascade,
  reviewer_id text not null,
  action text not null,
  reason text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (action in ('approve', 'reject', 'needs_proof', 'flag'))
);

create index if not exists submission_reviews_submission_idx on submission_reviews (submission_id, created_at desc);
