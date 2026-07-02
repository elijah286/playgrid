-- League games: protect recorded games (and derived standings) from team deletion.
--
-- Bug (verified against prod 2026-07-01): league_games.home_team_id and
-- league_games.away_team_id were created ON DELETE CASCADE
-- (20260621210000_league_games.sql), and deleteLeagueTeamAction deleted the
-- team row with no guard. Standings are DERIVED from final games, so deleting
-- a team that had played silently deleted those games — erasing the OPPONENT's
-- results too and corrupting the league's standings with no warning.
--
-- Fix: switch both team FKs to ON DELETE RESTRICT. A team that appears in any
-- game can no longer be hard-deleted; deleteLeagueTeamAction pre-checks the
-- game count and returns a friendly "delete its games/scores first" error
-- instead of a raw FK violation.
--
-- League teardown is unaffected: league_games.league_id stays ON DELETE
-- CASCADE (a league's games die with it), and teams.league_id is ON DELETE
-- SET NULL (20260620120000_league_foundation.sql — deleting a league never
-- deletes team rows), so this RESTRICT never fires when a league is deleted.

alter table public.league_games
  drop constraint if exists league_games_home_team_id_fkey;
alter table public.league_games
  add constraint league_games_home_team_id_fkey
    foreign key (home_team_id) references public.teams(id) on delete restrict;

alter table public.league_games
  drop constraint if exists league_games_away_team_id_fkey;
alter table public.league_games
  add constraint league_games_away_team_id_fkey
    foreign key (away_team_id) references public.teams(id) on delete restrict;
