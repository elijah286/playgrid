-- Head coach contact for league teams (Track B — coach assignment, pilot scope).
--
-- Additive + coach-safe: two nullable columns on teams. The coach product selects
-- specific columns (never *), so it never sees these; only the league surface
-- reads/writes them. Formal coach app-account linking comes later — for now an
-- operator records who coaches each team so the "teams need a coach" gap works.

alter table public.teams add column if not exists head_coach_name  text;
alter table public.teams add column if not exists head_coach_email text;
