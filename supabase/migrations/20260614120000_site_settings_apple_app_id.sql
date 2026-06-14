-- App's numeric App Store Apple ID — required by Apple's SignedDataVerifier to
-- bind production IAP signatures to THIS app (App Store Connect → App
-- Information → Apple ID). Pure-Apple StoreKit needs no SDK key / webhook secret;
-- Apple signs every transaction + notification itself.
--
-- The revenuecat_* columns from the earlier approach are now unused but left in
-- place (additive only); `revenuecat_iap_enabled` is reused as the IAP kill-switch.
alter table public.site_settings
  add column if not exists apple_app_apple_id text;
