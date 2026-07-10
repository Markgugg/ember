-- Queue: a planned slot for a draft. Reminder only — Current never auto-posts.
alter table public.drafts add column if not exists planned_for timestamptz;
create index if not exists drafts_planned_idx on public.drafts (planned_for);
