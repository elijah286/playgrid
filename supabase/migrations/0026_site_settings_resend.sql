-- Add Resend (contact form email) configuration to site_settings.
-- Continues to be accessed only via service role — RLS already enforced in 0005.

alter table public.site_settings
  add column if not exists resend_api_key text,
  add column if not exists resend_from_email text;
