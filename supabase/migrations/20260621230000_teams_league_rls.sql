-- League-scoped RLS on public.teams (additive — does NOT touch coach teams).
--
-- Problem: the base `teams_all` policy (0001_init.sql) governs ALL access to
-- public.teams via `is_org_owner(org_id)`. League teams are created with the
-- *creating* admin's org_id (src/app/actions/league-teams.ts), so a co-admin
-- (role league_admin) who does NOT own that org cannot read or write those
-- teams. Every league surface reads teams under the user session (anon key +
-- cookie, NOT service role) — listLeagueTeamsAction, getGamesBoardAction,
-- createGameAction, rostering, standings — so they silently return empty / fail
-- for a non-org-owner league_admin. It fails closed (no data leak) and is latent
-- only because today's single operator owns the org; it breaks the moment a
-- second league_admin is provisioned.
--
-- Fix: ADDITIVE permissive policies (Postgres OR-combines permissive policies)
-- keyed on league membership, mirroring the league_divisions convention
-- (member read / admin write). Both are guarded on `league_id is not null`, so
-- they NEVER apply to coach teams (league_id IS NULL) — coach-team visibility
-- stays governed solely by `teams_all` and is provably unchanged.
--
-- The existing `teams_all` policy is intentionally left in place: it still
-- governs coach (non-league) teams, and still lets a league_admin manage teams
-- in their own org. These policies extend, never replace, that behavior.

-- League members (operator, league_admin, coach, parent, player, volunteer) can
-- READ teams belonging to leagues they're a member of, regardless of org owner.
create policy teams_league_member_read on public.teams
  for select using (
    league_id is not null and public.is_league_member(league_id)
  );

-- League admins (operator, league_admin) can MANAGE (insert/update/delete, and
-- read) teams belonging to leagues they administer, regardless of org owner.
create policy teams_league_admin_write on public.teams
  for all using (
    league_id is not null and public.is_league_admin(league_id)
  )
  with check (
    league_id is not null and public.is_league_admin(league_id)
  );
