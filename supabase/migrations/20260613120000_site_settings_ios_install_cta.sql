-- Admin-controlled CTA that nudges iOS Safari / mobile-web visitors to install
-- the native app from the App Store — the iOS analog of the always-on Android
-- Play Store banner (see AppInstallBanner.tsx).
--
-- Default OFF on purpose: it must stay dark until the app is actually live in
-- the App Store. The Site Admin flips `ios_install_cta_enabled` on only after
-- confirming the listing is public.
--
-- `ios_app_store_id` holds the numeric App Store (Apple) ID used to build the
-- apps.apple.com link, e.g. "6471234567". The banner stays hidden until BOTH
-- the toggle is on AND an ID is set, so flipping the toggle without an ID can
-- never render a broken store link.
--
-- Both columns are additive and inert (no reads change behavior until the
-- toggle is flipped), so this is safe to apply ahead of the code deploy.

alter table public.site_settings
  add column if not exists ios_install_cta_enabled boolean not null default false;

alter table public.site_settings
  add column if not exists ios_app_store_id text;
