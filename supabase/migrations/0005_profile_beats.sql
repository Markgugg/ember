-- Onboarding scan: the topics ("beats") a member posts about, shown as
-- chips on the News page and used to frame drafting.
alter table public.profiles add column if not exists beats jsonb not null default '[]';
