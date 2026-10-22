-- Better Auth + TanStack server functions own authorization in this application.
-- Supabase anon/authenticated browser roles must not bypass those checks through
-- the automatically exposed public-schema Data API. No browser policies are
-- intentionally created. Use a privileged server-only Postgres connection.
alter table "user" enable row level security;
alter table "session" enable row level security;
alter table "account" enable row level security;
alter table "verification" enable row level security;
alter table profiles enable row level security;
alter table campaigns enable row level security;
alter table submissions enable row level security;
alter table payouts enable row level security;
alter table guides enable row level security;
alter table assets enable row level security;
alter table campaign_applications enable row level security;
alter table submission_reviews enable row level security;
alter table payout_batches enable row level security;
alter table payout_items enable row level security;
alter table analytics_proof_uploads enable row level security;
alter table direct_payout_requests enable row level security;
