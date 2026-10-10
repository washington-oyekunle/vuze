create table if not exists campaign_applications (
  id serial primary key,
  campaign_id integer not null references campaigns(id) on delete cascade,
  user_id text not null references "user"("id") on delete cascade,
  pitch text not null default '',
  status text not null default 'pending',
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  unique (campaign_id, user_id),
  check (status in ('pending', 'accepted', 'declined', 'withdrawn'))
);

create index if not exists campaign_applications_campaign_idx on campaign_applications (campaign_id, status);
create index if not exists campaign_applications_user_idx on campaign_applications (user_id, created_at desc);
