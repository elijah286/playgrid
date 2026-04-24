-- Admin-controlled beta feature scopes. Each beta feature has a scope:
--   "off"  → unavailable to everyone
--   "me"   → available to site admins only
--   "all"  → available to everyone otherwise entitled (e.g. coaches)
-- Stored as a single jsonb so adding/removing flags doesn't require a schema change.

alter table public.site_settings
  add column if not exists beta_features jsonb not null default '{
    "coach_ai": "off",
    "game_mode": "off"
  }'::jsonb;
