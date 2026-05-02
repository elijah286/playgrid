-- Coach Cal upgrade-in-progress banner toggle. When on, entitled users see
-- a banner at the top of the chat window noting that Cal is being upgraded.
alter table public.site_settings
  add column if not exists coach_cal_upgrade_banner_enabled boolean not null default false;

-- Default to ON for the active rollout.
update public.site_settings
  set coach_cal_upgrade_banner_enabled = true
  where id = 'default';
