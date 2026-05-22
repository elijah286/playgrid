-- Reddit Ads conversion pixel ID. Set via the Site admin → Integrations
-- tab so we don't redeploy to rotate it. Read by src/components/RedditPixel.tsx
-- at request time (cached in-memory for 60s).
alter table public.site_settings
  add column if not exists reddit_pixel_id text;
