-- The URN LinkedIn returns at publish. It's the only durable link between a
-- draft row and the real post, so the dashboard can point at the live thing
-- instead of inventing engagement numbers it has no permission to read.
alter table drafts
  add column if not exists linkedin_post_id text;
