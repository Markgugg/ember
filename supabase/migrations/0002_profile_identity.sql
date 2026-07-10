-- v2 redesign: identity fields for the post preview + onboarding
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists headline text;
