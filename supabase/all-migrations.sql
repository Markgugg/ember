-- Current: all migrations in order, safe to paste once into the Supabase SQL editor.
-- Generated from migrations/0001..0007. Idempotent where the originals are.

-- ══ migrations/0001_init.sql ══
-- ember — initial schema
-- Requires: pgvector
create extension if not exists vector;

-- ── profiles ────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  audience text,
  linkedin_url text,
  voice_samples jsonb not null default '[]',
  onboarded_at timestamptz
);

-- ── transcripts ─────────────────────────────────────────────────────
create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('voice', 'paste', 'upload')),
  raw_text text not null,
  word_count int not null,
  created_at timestamptz not null default now()
);

-- ── insights ────────────────────────────────────────────────────────
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transcript_id uuid not null references public.transcripts (id) on delete cascade,
  text text not null,
  quote text not null,
  type text not null check (type in ('opinion', 'story', 'lesson')),
  authority real not null check (authority between 0 and 1),
  charge real not null check (charge between 0 and 1),
  recurrence int not null default 1,
  status text not null default 'vaulted' check (status in ('vaulted', 'drafted', 'posted')),
  embedding vector(1536) not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index insights_user_status_idx on public.insights (user_id, status);
create index insights_embedding_idx on public.insights
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ── discourse_items (read-all, written by cron) ─────────────────────
create table public.discourse_items (
  id uuid primary key default gen_random_uuid(),
  snapshot_at timestamptz not null,
  title text not null,
  summary text not null,
  stance_a text,
  stance_b text,
  velocity real not null default 0,
  sources jsonb not null default '[]',
  embedding vector(1536) not null
);
create index discourse_snapshot_idx on public.discourse_items (snapshot_at desc);
create index discourse_embedding_idx on public.discourse_items
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ── briefs ──────────────────────────────────────────────────────────
create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  insight_id uuid references public.insights (id) on delete set null,
  discourse_item_id uuid references public.discourse_items (id) on delete set null,
  intersection_score real,
  intersection_rationale text,
  recommendation text,
  refusal jsonb,
  origin text not null check (origin in ('session', 'prerun', 'library')),
  status text not null default 'suggested'
    check (status in ('suggested', 'consumed', 'dismissed', 'refused')),
  created_at timestamptz not null default now()
);
create index briefs_user_idx on public.briefs (user_id, status, origin);

-- ── drafts ──────────────────────────────────────────────────────────
create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs (id) on delete cascade,
  angle text not null check (angle in
    ('story', 'contrarian', 'framework', 'prediction', 'lesson', 'commentary')),
  rationale text not null,
  body text not null,
  is_primary boolean not null default false,
  status text not null default 'suggested'
    check (status in ('suggested', 'edited', 'copied', 'posted')),
  edit_diff jsonb,
  created_at timestamptz not null default now()
);
create index drafts_brief_idx on public.drafts (brief_id);

-- ── prerun_suppressions ─────────────────────────────────────────────
create table public.prerun_suppressions (
  user_id uuid not null references auth.users (id) on delete cascade,
  insight_id uuid not null references public.insights (id) on delete cascade,
  discourse_item_id uuid not null references public.discourse_items (id) on delete cascade,
  primary key (user_id, insight_id, discourse_item_id)
);

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.transcripts enable row level security;
alter table public.insights enable row level security;
alter table public.briefs enable row level security;
alter table public.drafts enable row level security;
alter table public.prerun_suppressions enable row level security;
alter table public.discourse_items enable row level security;

create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own transcripts" on public.transcripts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own insights" on public.insights
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own briefs" on public.briefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own drafts" on public.drafts
  for all using (
    exists (select 1 from public.briefs b where b.id = brief_id and b.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.briefs b where b.id = brief_id and b.user_id = auth.uid())
  );
create policy "own suppressions" on public.prerun_suppressions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- discourse is shared, read-only for users; cron writes via service role (bypasses RLS)
create policy "discourse readable" on public.discourse_items
  for select using (true);

-- ── similarity RPCs (server-side prefilter) ─────────────────────────
create or replace function public.match_insights(
  p_user_id uuid,
  p_embedding vector(1536),
  p_threshold float,
  p_limit int default 5
) returns table (id uuid, similarity float)
language sql stable as $$
  select i.id, 1 - (i.embedding <=> p_embedding) as similarity
  from public.insights i
  where i.user_id = p_user_id
    and 1 - (i.embedding <=> p_embedding) >= p_threshold
  order by i.embedding <=> p_embedding
  limit p_limit;
$$;

create or replace function public.match_discourse(
  p_snapshot_at timestamptz,
  p_embedding vector(1536),
  p_threshold float,
  p_limit int default 8
) returns table (id uuid, similarity float)
language sql stable as $$
  select d.id, 1 - (d.embedding <=> p_embedding) as similarity
  from public.discourse_items d
  where d.snapshot_at = p_snapshot_at
    and 1 - (d.embedding <=> p_embedding) >= p_threshold
  order by d.embedding <=> p_embedding
  limit p_limit;
$$;

-- ══ migrations/0002_profile_identity.sql ══
-- v2 redesign: identity fields for the post preview + onboarding
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists headline text;

-- ══ migrations/0003_draft_planning.sql ══
-- Queue: a planned slot for a draft. Reminder only — Current never auto-posts.
alter table public.drafts add column if not exists planned_for timestamptz;
create index if not exists drafts_planned_idx on public.drafts (planned_for);

-- ══ migrations/0004_linkedin_publishing.sql ══
-- LinkedIn publishing via the official "Share on LinkedIn" API (w_member_social).
-- Tokens are member OAuth tokens (~60 day expiry); the app posts only when the
-- user explicitly posts or schedules.
alter table public.profiles add column if not exists linkedin_urn text;
alter table public.profiles add column if not exists linkedin_access_token text;
alter table public.profiles add column if not exists linkedin_token_expires_at timestamptz;

-- ══ migrations/0005_profile_beats.sql ══
-- Onboarding scan: the topics ("beats") a member posts about, shown as
-- chips on the News page and used to frame drafting.
alter table public.profiles add column if not exists beats jsonb not null default '[]';

-- ══ migrations/0006_draft_media_style.sql ══
-- How the source article rides on the published post:
--   'card'  — ARTICLE share (image + headline + link in one compact card)
--   'photo' — IMAGE share (full-width picture, link in the body text)
-- Per draft, so a scheduled post honours the choice when it fires.
alter table drafts
  add column if not exists media_style text not null default 'card'
  check (media_style in ('card', 'photo'));

-- ══ migrations/0007_draft_linkedin_post_id.sql ══
-- The URN LinkedIn returns at publish. It's the only durable link between a
-- draft row and the real post, so the dashboard can point at the live thing
-- instead of inventing engagement numbers it has no permission to read.
alter table drafts
  add column if not exists linkedin_post_id text;


-- == migrations/0008_anon_identity.sql ==
-- The anonymous identity is a first-class user. There is no Supabase Auth
-- sign-up anywhere in the product: every visitor is identified by the
-- `ember_anon` cookie, a UUID that never exists in auth.users. The foreign keys
-- above would therefore reject every insert, while reads returned zero rows
-- without error -- so the app looked alive but silently refused to save.
--
-- Ownership is unchanged: ids are still uuid, and every query in server code is
-- explicitly scoped by user_id. RLS stays on, so the browser's anon key -- which
-- never queries Postgres directly -- is still denied by default.
alter table public.profiles
  drop constraint if exists profiles_id_fkey;
alter table public.transcripts
  drop constraint if exists transcripts_user_id_fkey;
alter table public.insights
  drop constraint if exists insights_user_id_fkey;
alter table public.briefs
  drop constraint if exists briefs_user_id_fkey;
alter table public.prerun_suppressions
  drop constraint if exists prerun_suppressions_user_id_fkey;
