-- Admin-controlled kill switch for the floating "Send feedback" pill.
-- Default true so the widget shows until an admin turns it off.

alter table public.site_settings
  add column if not exists feedback_widget_enabled boolean not null default true;
