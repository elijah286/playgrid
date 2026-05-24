-- Web Client ID for native Google sign-in on Android/iOS. The native
-- flow uses the system Google SDK to mint an ID token, which Supabase
-- then verifies via signInWithIdToken — the client ID needs to be
-- known at runtime so the SDK can request the right token. Storing it
-- in site_settings (vs. an env var) keeps it editable from the Site
-- Admin UI without redeploying, matching the existing pattern for
-- google_signin_enabled / apple_signin_enabled.
--
-- Public value (Client IDs are not secrets — only Client Secrets are),
-- so plain text + RLS-readable by anon is fine.

alter table public.site_settings
  add column if not exists google_oauth_web_client_id text;
