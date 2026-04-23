-- Admin-controlled toggle for mobile play editing. When off, the mobile
-- "Edit play" button is hidden and the formation picker is read-only on
-- mobile, so viewers can't start a broken editing flow on small screens.

alter table public.site_settings
  add column if not exists mobile_editing_enabled boolean not null default false;
