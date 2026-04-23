-- Admin-configurable free-tier play cap per playbook. Default 16 — matches
-- what we advertise on /pricing and /faq so the one number drives runtime
-- enforcement, upgrade notices, and marketing copy.

alter table public.site_settings
  add column if not exists free_max_plays_per_playbook integer not null default 16
    check (free_max_plays_per_playbook between 1 and 1000);
