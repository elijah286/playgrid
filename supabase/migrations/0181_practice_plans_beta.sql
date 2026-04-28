-- Practice Plans: beta flag + allowlist enum extension.
-- Scope = "me" so only site admins (profiles.role='admin') see the feature
-- until UX is validated.

-- Extend the allowlist feature enum to include practice_plans.
alter table public.beta_feature_allowlist
  drop constraint valid_feature;

alter table public.beta_feature_allowlist
  add constraint valid_feature check (feature in (
    'coach_ai', 'game_mode', 'game_results', 'marketing_content',
    'team_calendar', 'play_comments', 'version_history', 'practice_plans'
  ));

-- Set default scope to "me" (admins only) in site_settings.
update public.site_settings
set beta_features = jsonb_set(
  coalesce(beta_features, '{}'::jsonb),
  '{practice_plans}',
  '"me"'
)
where id = 'default';

insert into public.site_settings (id, beta_features)
select 'default', '{"practice_plans": "me"}'::jsonb
where not exists (select 1 from public.site_settings where id = 'default');
