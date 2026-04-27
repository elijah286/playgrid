-- Enable Coach Cal (coach_ai) for all entitled users globally.
-- This sets coach_ai scope to "all" in the site_settings beta_features JSON.
-- Existing keys are preserved; only coach_ai is updated.
UPDATE public.site_settings
SET beta_features = jsonb_set(
  COALESCE(beta_features, '{}'::jsonb),
  '{coach_ai}',
  '"all"'
)
WHERE id = 'default';

-- If no row exists yet, insert one with the flag set.
INSERT INTO public.site_settings (id, beta_features)
SELECT 'default', '{"coach_ai": "all"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.site_settings WHERE id = 'default');
