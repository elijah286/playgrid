-- iOS Client ID for native Google sign-in on iOS. Unlike Android (which
-- only needs the Web client ID), iOS requires its own iOS-type OAuth
-- client, bound to the app's bundle ID. The iOS Google SDK initializes
-- with this as its `clientID`, while the existing google_oauth_web_client_id
-- rides along as the server client (iOSServerClientId) so the minted ID
-- token's audience is one Supabase already trusts.
--
-- Stored in site_settings (vs. an env var) to match google_oauth_web_client_id
-- and stay editable from Site Admin. NOTE: the reversed form of this value is
-- ALSO baked into the iOS Info.plist URL scheme at build time, so rotating it
-- requires a new native build — editing it here alone is not sufficient.
--
-- Public value (Client IDs are not secrets — only Client Secrets are),
-- so plain text + RLS-readable by anon is fine.

alter table public.site_settings
  add column if not exists google_oauth_ios_client_id text;
