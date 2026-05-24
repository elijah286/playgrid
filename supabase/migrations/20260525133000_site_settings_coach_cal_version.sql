-- Coach Cal version toggle. Site-wide flag that selects between Cal v1
-- (pre-Phase-2 behavior: no provenance gate, no rescue, no server-side
-- label aliasing) and Cal v2 (full Phase 2 stack). The site admin can
-- flip this from /admin/site-settings if v2 misbehaves in production.
--
-- Default is 'v2' (the new stack). Existing rows are migrated to 'v2'
-- so the toggle defaults ON for everyone.
alter table public.site_settings
  add column if not exists coach_cal_version text not null default 'v2'
    check (coach_cal_version in ('v1', 'v2'));

update public.site_settings
  set coach_cal_version = 'v2'
  where id = 'default' and coach_cal_version is null;
