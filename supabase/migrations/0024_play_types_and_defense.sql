-- Add play_type / formation kind / defensive player count
-- Supports Offensive, Defensive, and Special Teams plays.

alter table public.plays
  add column if not exists play_type text not null default 'offense'
    check (play_type in ('offense', 'defense', 'special_teams'));

-- Optional special-teams unit discriminator (e.g. 'punt', 'kickoff').
alter table public.plays
  add column if not exists special_teams_unit text;

-- Optional link to an opponent formation to overlay (gray) when viewing the play.
alter table public.plays
  add column if not exists opponent_formation_id uuid
    references public.formations(id) on delete set null;

create index if not exists plays_play_type_idx on public.plays (playbook_id, play_type);

-- Formations are scoped to a side of the ball.
alter table public.formations
  add column if not exists kind text not null default 'offense'
    check (kind in ('offense', 'defense', 'special_teams'));

create index if not exists formations_kind_idx on public.formations (kind);

-- For "other" sport variant, allow coaches to pick a defensive player count.
alter table public.playbooks
  add column if not exists custom_defense_count smallint
    check (custom_defense_count is null or (custom_defense_count >= 4 and custom_defense_count <= 11));
