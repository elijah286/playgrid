-- Practice Plans and Game Mode are no longer beta features. Drop their
-- scope keys from site_settings.beta_features, delete any per-email
-- allowlist rows, and shrink the allowlist constraint to no longer
-- accept those values. Code paths that previously gated on these flags
-- now treat the features as universally available to entitled users.

update public.site_settings
set beta_features = (beta_features - 'practice_plans' - 'game_mode')
where id = 'default';

delete from public.beta_feature_allowlist
where feature in ('practice_plans', 'game_mode');

alter table public.beta_feature_allowlist
  drop constraint valid_feature;

alter table public.beta_feature_allowlist
  add constraint valid_feature check (feature in (
    'coach_ai', 'game_results', 'marketing_content',
    'team_calendar', 'play_comments', 'version_history'
  ));
