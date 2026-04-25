-- Google Maps API key. Used by the Team Calendar feature for location
-- autocomplete and static map previews. Stored in site_settings so admins
-- can manage it via the Integrations tab (mirrors openai/resend keys).

alter table public.site_settings
  add column if not exists google_maps_api_key text;
