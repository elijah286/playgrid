-- RevenueCat config for the Apple IAP path, stored alongside the Stripe keys
-- in the single site_settings row (mirrors the Stripe key columns).
--   revenuecat_ios_sdk_key  — PUBLIC SDK key, safe to expose to the native app
--   revenuecat_webhook_secret — shared secret RevenueCat sends as the
--                               Authorization header on webhook POSTs (server only)
alter table public.site_settings
  add column if not exists revenuecat_ios_sdk_key text,
  add column if not exists revenuecat_webhook_secret text,
  -- Master kill-switch for the iOS purchase UI. Stays false until the App Store
  -- Connect products + RevenueCat dashboard are live; flip true to turn IAP on
  -- (no deploy needed). The native UI also requires revenuecat_ios_sdk_key set.
  add column if not exists revenuecat_iap_enabled boolean not null default false;
