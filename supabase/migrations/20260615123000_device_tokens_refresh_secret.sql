-- Device-secret auth for dormant token refresh.
--
-- A logged-in user who installs the app, then rarely/never reopens it, must
-- keep receiving coach notifications. The OS delivers to a backgrounded/killed
-- app fine — the one failure mode is the push token ROTATING (FCM especially)
-- without the app reopening to re-register it.
--
-- The native layer (Android FirebaseMessagingService.onNewToken, iOS
-- silent-push handler) can detect a rotated token even when the app is killed,
-- but it has no access to the WebView's Supabase session, so it can't call the
-- authenticated /api/push/register. This per-row secret is the device's
-- bearer credential for the unauthenticated /api/push/refresh: the WebView
-- receives it at register time and hands it to native storage; native presents
-- it to swap in the new token without a session.
--
-- High-entropy, transmitted over HTTPS only, stored in app-private native
-- storage. Worst case if leaked: an attacker could repoint that one row's token
-- (steal one user's notifications) — low blast radius. Additive + nullable;
-- existing rows get a secret lazily on their next register.
alter table public.device_tokens
  add column if not exists refresh_secret text;

create unique index if not exists device_tokens_refresh_secret_idx
  on public.device_tokens (refresh_secret)
  where refresh_secret is not null;
