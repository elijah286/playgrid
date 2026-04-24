-- Owner-controlled: when true, duplicating this playbook may also copy
-- its game results (game_sessions + game_plays + game_score_events). The
-- duplicating user is still prompted to opt in; this flag only governs
-- whether the prompt appears at all. Default false so existing playbooks
-- never leak their game data without explicit owner action.

alter table public.playbooks
  add column if not exists allow_game_results_duplication boolean not null default false;
