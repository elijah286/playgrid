-- Allow the new-UX preview ("new_shell") + the other current beta features to
-- be used in the per-email allowlist. The valid_feature CHECK had gone stale:
-- it only permitted an older subset, so inserting an allowlist row for
-- new_shell (or team_messaging / football_library / offline_auto_cache /
-- coach_ai_image_upload) was rejected. Widen it to the full current key set.
--
-- Data note: the new_shell scope (site_settings.beta_features) and the actual
-- allowlist rows are environment config, set via Site Admin / directly — not in
-- this migration.

alter table public.beta_feature_allowlist
  drop constraint valid_feature;

alter table public.beta_feature_allowlist
  add constraint valid_feature check (feature in (
    'coach_ai', 'game_results', 'marketing_content', 'team_calendar',
    'play_comments', 'version_history', 'team_messaging',
    'coach_ai_image_upload', 'football_library', 'offline_auto_cache',
    'new_shell'
  ));
