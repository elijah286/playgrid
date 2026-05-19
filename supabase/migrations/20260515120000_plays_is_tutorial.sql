-- plays.is_tutorial — marks plays created by the in-app Play Authoring tour.
--
-- Tutorial plays are disposable scratch space:
--   • createPlayAction bypasses `assertNotLocked` and `assertPlayCap` for
--     them so coaches on downgraded plans (or at the per-playbook play
--     cap) can still take the tour.
--   • They're excluded from `computeDowngradeLocks` cap calculations so
--     creating one doesn't push a real play into the locked state.
--   • They're hidden from `listPlaysAction` so they don't clutter the
--     playbook detail view alongside real plays.
--
-- Pattern mirrors `attached_to_play_id` (custom-opponent overlays) — a
-- play that exists in the DB but is filtered out of normal coach-facing
-- surfaces.

alter table public.plays
  add column if not exists is_tutorial boolean not null default false;

create index if not exists plays_is_tutorial_idx
  on public.plays (playbook_id)
  where is_tutorial = true;

comment on column public.plays.is_tutorial is
  'When true, this play was created by the in-app tutorial. It is exempt from per-playbook play caps and downgrade locks, and is hidden from the main play list. See createPlayAction + computeDowngradeLocks.';
