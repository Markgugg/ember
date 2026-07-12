-- Current — the anonymous identity is a first-class user.
--
-- There is no Supabase Auth sign-up anywhere in the product: every visitor is
-- identified by the `ember_anon` cookie, a UUID that never exists in
-- auth.users. The original foreign keys therefore rejected every insert, while
-- reads returned zero rows without error — so the app looked alive but silently
-- refused to save anything (onboarding bounced back to /welcome, and a verified
-- LinkedIn connection vanished on the redirect home).
--
-- Ownership is unchanged: ids are still uuid, and every query in server code is
-- explicitly scoped by user_id. RLS stays on, so the browser's anon key — which
-- never queries Postgres directly — is still denied by default.

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
