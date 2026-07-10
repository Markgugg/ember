-- LinkedIn publishing via the official "Share on LinkedIn" API (w_member_social).
-- Tokens are member OAuth tokens (~60 day expiry); the app posts only when the
-- user explicitly posts or schedules.
alter table public.profiles add column if not exists linkedin_urn text;
alter table public.profiles add column if not exists linkedin_access_token text;
alter table public.profiles add column if not exists linkedin_token_expires_at timestamptz;
