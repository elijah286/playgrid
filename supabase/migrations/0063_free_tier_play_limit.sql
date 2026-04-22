-- Admin-controlled cap on how many plays a Free-tier owner can have inside a
-- single playbook. Previously a hard-coded constant (12); exposing it here
-- lets the site admin tune the free tier from the Site settings tab without
-- a deploy. New installs get the current product default of 15.

alter table public.site_settings
  add column if not exists free_max_plays_per_playbook integer not null default 15;

alter table public.site_settings
  add constraint site_settings_free_max_plays_positive
  check (free_max_plays_per_playbook > 0);
