-- Store Stripe configuration in site_settings so the site admin can manage
-- it from the UI instead of shipping via server env. Price IDs + keys all
-- live in one row. Secret/webhook values are only ever read server-side via
-- service role; never exposed to browsers.

alter table public.site_settings
  add column if not exists stripe_secret_key text,
  add column if not exists stripe_publishable_key text,
  add column if not exists stripe_webhook_secret text,
  add column if not exists stripe_price_coach_month text,
  add column if not exists stripe_price_coach_year text,
  add column if not exists stripe_price_coach_ai_month text,
  add column if not exists stripe_price_coach_ai_year text;
