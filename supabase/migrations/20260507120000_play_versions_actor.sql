-- play_versions.actor — distinguishes user-driven edits from AI-driven (Coach Cal) edits.
--
-- Used by recordPlayVersion to coalesce successive user autosaves within a
-- short window into a single history row, while keeping every AI write as
-- its own distinct row (so "Cal made this change" stays clearly attributed).

alter table public.play_versions
  add column if not exists actor text not null default 'user';

alter table public.play_versions
  drop constraint if exists play_versions_actor_check;
alter table public.play_versions
  add constraint play_versions_actor_check
  check (actor in ('user', 'ai'));

comment on column public.play_versions.actor is
  'Who authored this revision: user (manual edit) or ai (Coach Cal). User-by-user edits within a short window coalesce into one row; ai edits never coalesce.';
