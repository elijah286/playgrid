-- Custom opponents: a play can hold a "custom" opposing play that lives as a
-- hidden row in the same playbook, linked via vs_play_id. The hidden row is
-- never listed in playbook UIs / RAG / pickers — it's only reachable through
-- its parent. Hiding the overlay (Clear) flips opponent_hidden without
-- deleting the link, so the custom positions persist across toggles.

alter table public.plays
  add column if not exists attached_to_play_id uuid
    references public.plays(id) on delete cascade;

alter table public.plays
  add column if not exists opponent_hidden boolean not null default false;

-- Hidden plays are only ever fetched via their parent, but we still index the
-- FK for cascade lookups and for filtering them out of listings.
create index if not exists plays_attached_to_play_id_idx
  on public.plays (attached_to_play_id)
  where attached_to_play_id is not null;

comment on column public.plays.attached_to_play_id is
  'When non-null, this play is a hidden custom opponent owned by another play. Excluded from all listings, search, RAG, and pickers. Cascade-deleted when the parent is hard-deleted.';

comment on column public.plays.opponent_hidden is
  'When true, the linked vs_play_id overlay is hidden in the editor. Custom data stays intact — toggling Clear off re-shows it.';
