-- Defensive plays can be "installed against" a specific offensive play.
-- vs_play_id is the source offense; vs_play_snapshot is a frozen copy of
-- its players/routes at install time so later edits to the offense don't
-- silently change the matchup. A "Re-sync" action rewrites the snapshot.

alter table public.plays
  add column if not exists vs_play_id uuid
    references public.plays(id) on delete set null;

alter table public.plays
  add column if not exists vs_play_snapshot jsonb;

create index if not exists plays_vs_play_id_idx on public.plays (vs_play_id);
