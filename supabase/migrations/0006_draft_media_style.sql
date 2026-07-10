-- How the source article rides on the published post:
--   'card'  — ARTICLE share (image + headline + link in one compact card)
--   'photo' — IMAGE share (full-width picture, link in the body text)
-- Per draft, so a scheduled post honours the choice when it fires.
alter table drafts
  add column if not exists media_style text not null default 'card'
  check (media_style in ('card', 'photo'));
