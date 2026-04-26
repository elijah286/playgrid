-- Admin-configurable Team Coach play cap per playbook. Default 200.
-- Free tier uses free_max_plays_per_playbook (0069). Coach AI is uncapped.

alter table public.site_settings
  add column if not exists coach_max_plays_per_playbook integer not null default 200
    check (coach_max_plays_per_playbook between 1 and 100000);
