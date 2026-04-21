-- Players can have multiple positions. Add a text[] column alongside the
-- legacy single `position` string (kept for back-compat). Backfill from
-- the existing column so no data is lost.

alter table public.playbook_members
  add column if not exists positions text[] not null default '{}';

update public.playbook_members
set positions = array[position]
where position is not null and position <> '' and coalesce(array_length(positions, 1), 0) = 0;
