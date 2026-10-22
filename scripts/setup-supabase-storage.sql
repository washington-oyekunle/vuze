-- Run once in the chosen Supabase project's SQL editor, after app migrations.
-- This script is deliberately not a generic app migration: storage.buckets does
-- not exist in local PGLite or ordinary Postgres. The server uses the service-role
-- key; browser uploads use short-lived, exact-path signed upload URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('analytics-proof', 'analytics-proof', false, 26214400,
  array['image/png','image/jpeg','image/webp','video/mp4','video/webm'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Do not add anon/authenticated storage policies for this bucket. Signed URL
-- upload grants are issued only after Better Auth owner checks in the app.
