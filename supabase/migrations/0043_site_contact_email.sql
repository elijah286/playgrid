-- Destination address for the public contact/feedback form. Admin-editable
-- via site_settings so we don't have to redeploy to change who gets
-- notified. Falls back to CONTACT_TO_EMAIL env var if NULL.

alter table public.site_settings
  add column if not exists contact_to_email text;
