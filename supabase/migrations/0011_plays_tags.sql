-- Plays: multi-valued tags for user-defined grouping (pass / run / reverse / etc.)

alter table public.plays
  add column tags text[] not null default '{}';

create index plays_tags_gin_idx on public.plays using gin (tags);

-- Backfill from the legacy single-value `tag` column when present.
update public.plays
set tags = array[tag]
where tag is not null and tag <> '' and (tags is null or cardinality(tags) = 0);

comment on column public.plays.tags is
  'User-defined tags for grouping plays within a playbook (e.g. pass, run, screen). Authoritative denormalised copy of PlayDocument.metadata.tags.';
