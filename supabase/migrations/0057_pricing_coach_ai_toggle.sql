-- Admin-controlled toggle for showing the Coach AI tier on /pricing.
-- Default false so the tier is hidden until an admin turns it on.

alter table public.site_settings
  add column if not exists coach_ai_tier_enabled boolean not null default false;
