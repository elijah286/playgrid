-- Game-type metadata on playbooks, used to scope rule retrieval for Coach AI
-- and to drive future game-type-aware validation.
--
-- These supplement the existing `sport_variant` column (which mixes player
-- count + format) with three orthogonal dimensions:
--   * game_level       — youth / middle_school / high_school / adult / mixed
--   * sanctioning_body — nfl_flag / pop_warner / ayf / nfhs / pylon / ot7 / etc.
--   * age_division     — free-form: '8u', '10u', 'varsity', 'jv', '6th_grade'
--
-- All nullable: backfilled by Coach AI clarifying questions or by the coach
-- in playbook settings. Filtering RAG retrieval composes these with
-- sport_variant.

alter table public.playbooks
  add column if not exists game_level       text,
  add column if not exists sanctioning_body text,
  add column if not exists age_division     text;

comment on column public.playbooks.game_level is
  'Coarse level of play: youth | middle_school | high_school | adult | mixed. Nullable.';
comment on column public.playbooks.sanctioning_body is
  'Governing body whose rulebook applies (nfl_flag, pop_warner, ayf, nfhs, pylon, ot7, ...). Nullable.';
comment on column public.playbooks.age_division is
  'Free-form age/division label (8u, 10u, varsity, jv, 6th_grade). Nullable.';
