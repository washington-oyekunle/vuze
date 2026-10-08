create table if not exists profiles (
  user_id text primary key,
  display_name text not null default '',
  handle text,
  bio text not null default '',
  tiktok_url text,
  instagram_url text,
  youtube_url text,
  role text not null default 'creator',
  organic_verified boolean not null default false,
  suspended boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  id serial primary key,
  title text not null,
  brand text not null,
  type text not null,
  status text not null default 'live',
  summary text not null,
  brief text not null,
  requirements text not null,
  payout_label text not null,
  payout_kind text not null,
  payout_rate numeric not null default 0,
  deadline timestamptz,
  organic_only boolean not null default true,
  max_submissions integer,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists submissions (
  id serial primary key,
  campaign_id integer not null references campaigns(id) on delete cascade,
  user_id text not null,
  post_url text not null,
  platform text not null default 'tiktok',
  notes text not null default '',
  analytics_urls text not null default '',
  views integer not null default 0,
  watch_time_pct numeric,
  retention_pct numeric,
  likes integer not null default 0,
  comments_count integer not null default 0,
  shares integer not null default 0,
  status text not null default 'under_review',
  estimated_payout numeric not null default 0,
  admin_notes text not null default '',
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  paid_at timestamptz
);

create index if not exists submissions_user_id_idx on submissions (user_id);
create index if not exists submissions_campaign_id_idx on submissions (campaign_id);
create index if not exists submissions_status_idx on submissions (status);

create table if not exists payouts (
  id serial primary key,
  user_id text not null,
  submission_id integer references submissions(id),
  amount numeric not null,
  reference text not null default '',
  paid_at timestamptz not null default now()
);

create index if not exists payouts_user_id_idx on payouts (user_id);

create table if not exists guides (
  slug text primary key,
  category text not null,
  title text not null,
  summary text not null,
  body text not null,
  sort_order integer not null default 0
);

create table if not exists assets (
  id serial primary key,
  title text not null,
  kind text not null,
  description text not null,
  content text not null,
  created_at timestamptz not null default now()
);

insert into campaigns (title, brand, type, status, summary, brief, requirements, payout_label, payout_kind, payout_rate, deadline, organic_only)
values
(
  'APEX launch week clips',
  'APEX',
  'clipping',
  'live',
  'Short-form clips from the APEX founder AMA and livestream. Organic reach only.',
  E'Clip the strongest 12–25s moments from the APEX AMA and weekly livestream.\nLead with a spoken hook in the first 1.5 seconds.\nEnd card: ticker + chart screenshot for no more than 2 seconds.\nDo not add fake view counts, engagement pods, or purchased traffic.',
  E'Public post on TikTok, Reels, or Shorts\nUS-leaning audience preferred\nRetention screenshot required at review\nNo recycled clips from other campaigns\nView botting is an instant ban from all campaigns',
  '$4.00 / 1k organic views',
  'per_1k',
  4.00,
  now() + interval '21 days',
  true
),
(
  'NOVA product UGC',
  'NOVA',
  'ugc',
  'live',
  'Talking-head UGC for the NOVA mobile product. Face-to-camera, natural lighting.',
  E'Film a 20–35s talking-head piece as a real user.\nHook: a specific pain, not a generic “this app is crazy.”\nShow the product UI for at least 6 seconds.\nCaption must include one clear CTA. No paid-ad disclaimers stuffed as the hook.',
  E'Original footage only\nEnglish, US-audience targeting\nSubmit post link + analytics screenshots\nWatch time and retention required — views alone will be rejected\nNo artificial inflation',
  '$150 flat per approved post',
  'flat',
  150.00,
  now() + interval '14 days',
  true
),
(
  'ORBIT memecoin organic clips',
  'ORBIT',
  'clipping',
  'live',
  'High-retention clips that introduce ORBIT without sounding like a shill thread.',
  E'Use the provided B-roll pack. Pair with native sounds, not the same trending audio on every post.\nExplain one concrete mechanic (supply, utility, or community action) — not “100x.”\nCoin mention after the hook, never as the first line.',
  E'Organic distribution only\nAnalytics must include retention graph\nMax 3 submissions per creator\nDuplicate links across campaigns will be rejected',
  '$5.50 / 1k organic views',
  'per_1k',
  5.50,
  now() + interval '30 days',
  true
),
(
  'VELA closed beta UGC',
  'VELA',
  'ugc',
  'closed',
  'Closed. Kept here so you can see how completed campaigns look in the board.',
  E'This campaign is closed. New submissions are not accepted.',
  E'n/a',
  '$120 flat (closed)',
  'flat',
  120.00,
  now() - interval '5 days',
  true
);

insert into guides (slug, category, title, summary, body, sort_order) values
('us-audience', 'UGC MM', 'US audience targeting', 'How we expect US-leaning distribution without paid tricks.', E'VUZE campaigns are scored on organic US-leaning delivery, not raw worldwide views.\n\nSet language to English. Do not farm views from regions that never convert for the brand.\n\nWarm the account with native US comments, stitches, and replies for at least a week before a paid campaign post.\n\nWhen you submit, include audience country mix if the analytics panel shows it. A 90% non-US dump with huge view counts is a rejection, not a flex.', 1),
('sounds', 'UGC MM', 'Sounds that hold', 'Native audio choices that do not trip spam filters.', E'Use original voiceover first. If you use a platform sound, pick one already performing on similar accounts — not the #1 trending track that every bot farm is stacking.\n\nAvoid the same sound on every campaign post. Rotation looks human. Repetition looks automated.\n\nKeep voice loud and uncompressed. Ads that whisper then explode with a meme sound get marked low quality.', 2),
('viral-frameworks', 'UGC MM', 'Viral frameworks', 'Structures we actually pay against.', E'Framework A — Interruption: open on the consequence, not the product.\nFramework B — Proof: show the screen, then narrate what changed.\nFramework C — Pattern break: start as a normal story, cut to the mechanic at 3s.\n\nNone of these need fake urgency, fake live viewers, or engagement bait in all caps.\n\nIf the hook cannot survive without a purchased view spike, it is not a VUZE hook.', 3),
('warm-accs', 'UGC MM', 'Warm accounts', 'How to warm an account so campaign posts do not die in 200 views.', E'Post 8–12 native pieces before the campaign clip. Same niche, same language, same posting window.\n\nReply to comments for real. Follow a small set of adjacent creators and leave specific comments — not “fire.”\n\nDo not buy followers, do not use follow/unfollow scripts, do not run view bots to “prime” the account. We can see the shape of the graph.\n\nA warm account has uneven, human traffic. A botted account has stairs.', 4),
('captions-and-hooks', 'TOS MM', 'Captions and hooks', 'On-screen text and spoken first lines.', E'First line is spoken, not just captioned. Platforms now downrank text-only opens.\n\nKeep captions under two short sentences. Put the keyword after a human phrase.\n\nDo not lead with a ticker. Do not lead with “wait for the end.”\n\nHooks we accept: a specific number, a specific mistake, a specific clip from the source stream.', 5),
('coin-integration', 'TOS MM', 'Coin integration', 'How to mention a token without turning the clip into a shill.', E'Mention the project after the viewer already has a reason to care.\n\nShow a real screen (site, product, chart) for a beat, then return to face or footage.\n\nNever promise returns. Never fake a call overlay. Never paste a contract address as the entire caption.\n\nIf the brief asks for a ticker on screen, keep it under two seconds at the end.', 6),
('posting-schedule', 'TOS MM', 'Posting schedule', 'Windows that match US audience campaigns.', E'For US-audience campaigns, first post between 10:00–13:00 or 18:00–21:00 Eastern.\n\nDo not dump five campaign posts in an hour. Space them. Human accounts do not spray.\n\nIf a post is dead at 90 minutes with no comments, do not “boost” it. Submit the next original instead.', 7),
('analytics', 'TOS MM', 'Analytics we actually read', 'Views are not the score.', E'Submit: views, average watch time or % watched, retention graph, likes, comments, shares.\n\nWe reject submissions that only show a views screenshot.\n\nRed flags: perfect round view counts, zero comments on 50k views, identical watch time across posts, traffic that arrived in a 4-minute cliff.\n\nIf we ask for more proof, you have 48 hours.', 8),
('warm-up', 'TOS MM', 'Warm-up sequence', 'Seven-day sequence before a campaign drop.', E'Day 1–2: native niche posts, no project mention.\nDay 3–4: reply-heavy day, stitch or duet a related creator.\nDay 5: a framework test post (not the campaign).\nDay 6: rest or a light native post.\nDay 7: campaign post.\n\nSkip the sequence and the campaign post usually under-delivers. That is on the account, not the brief.', 9),
('audience-types', 'TOS MM', 'Audience types', 'Who the clip is actually for.', E'Pick one: traders who already watch streams, product users discovering a tool, or general short-form scrollers.\n\nDo not mix all three in one 15s clip. The hook names the person.\n\nUS-audience campaigns want English slang that a 18–34 viewer uses, not telegram-call language.', 10),
('sounds-and-music', 'TOS MM', 'Sounds and music', 'Bed music vs voice.', E'Voice first, bed music under -18dB relative to speech.\n\nCopyright-risky tracks get muted and kill the submission. Use in-app sounds or original audio.\n\nDo not auto-generate a voiceover that cannot answer a comment in the same tone.', 11),
('content-rules', 'Assets', 'Content rules', 'The floor. Break it and you are out of campaigns.', E'Organic only. No view bots, no follower farms, no purchased comments, no engagement pods.\n\nNo stolen footage unless the campaign brief supplies it.\n\nNo misleading profit claims.\n\nNo impersonating the brand.\n\nPayouts are for approved organic performance. Inflated metrics void the payout and the account.', 12);

insert into assets (title, kind, description, content) values
('Spoken hook bank', 'scripts', 'Openers you can adapt. Do not copy-paste all of them onto one account.', E'I lost the last hour of the stream and this was the only part that mattered.\nNobody is talking about the part where they explained the actual mechanic.\nThis is the clip they will pretend they posted first.\nStop scrolling if you have ever entered a call late.'),
('APEX B-roll notes', 'examples', 'What good APEX clips looked like last cycle.', E'Winning posts opened on the founder interrupting himself, not on a logo.\nCaptions were one sentence. Comment section was real questions, not “Let’s go.”\nRetention held past 40% at the 50% mark.\nAnything with a rocket overlay died.'),
('On-screen text styles', 'assets', 'Safe text treatments that do not look like a bot template.', E'One line, lower third, high contrast, never full-screen paragraphs.\nNo stock “subscribe for more” end cards on campaign posts.\nNo fake subscriber counts in the corner.'),
('Rejection glossary', 'assets', 'Why submissions come back.', E'“Views only” — missing retention.\n“Inorganic shape” — traffic cliff or round numbers with no comments.\n“Wrong audience” — language or country mix off brief.\n“Duplicate” — same URL already in the campaign.\n“Shill-first” — ticker before the hook.');
