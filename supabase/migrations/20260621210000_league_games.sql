-- League games + standings (Track B — season operations).
--
-- Additive + gated. Structured intra-league games between two of the operator's
-- teams, with scores. Standings are DERIVED from final games (not stored), so
-- there is no standings table to keep in sync.

create type public.league_game_status as enum ('scheduled', 'final', 'canceled');

create table public.league_games (
  id           uuid        primary key default gen_random_uuid(),
  league_id    uuid        not null references public.leagues(id) on delete cascade,
  division_id  uuid        references public.league_divisions(id) on delete set null,
  home_team_id uuid        not null references public.teams(id) on delete cascade,
  away_team_id uuid        not null references public.teams(id) on delete cascade,
  starts_at    timestamptz,
  location     text,
  home_score   integer,
  away_score   integer,
  status       public.league_game_status not null default 'scheduled',
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint league_games_distinct_teams check (home_team_id <> away_team_id),
  constraint league_games_scores_nonneg check (
    (home_score is null or home_score >= 0) and (away_score is null or away_score >= 0)
  )
);

create index league_games_league_idx on public.league_games (league_id, starts_at);
create index league_games_division_idx on public.league_games (division_id);

drop trigger if exists league_games_set_updated_at on public.league_games;
create trigger league_games_set_updated_at
  before update on public.league_games
  for each row execute function public.set_updated_at();

alter table public.league_games enable row level security;

create policy league_games_select_member on public.league_games
  for select using (public.is_league_member(league_id) or public.is_site_admin());

create policy league_games_write_admin on public.league_games
  for all using (public.is_league_admin(league_id) or public.is_site_admin())
  with check (public.is_league_admin(league_id) or public.is_site_admin());
