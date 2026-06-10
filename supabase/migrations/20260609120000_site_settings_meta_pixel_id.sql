-- Meta (Facebook) Ads pixel ID.
--
-- Mirrors the existing reddit_pixel_id column: a single nullable text id on the
-- one-row public.site_settings, set by the site admin in Site Admin →
-- Integrations (no deploy needed to rotate). The MetaPixel server component
-- reads it on every render to load fbevents.js, fire PageView, and fire
-- CompleteRegistration after a fresh signup. Null = pixel disabled (component
-- renders nothing). Additive + nullable, so this is a no-op on existing rows.

alter table public.site_settings
  add column if not exists meta_pixel_id text;
