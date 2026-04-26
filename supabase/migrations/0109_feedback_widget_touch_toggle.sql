-- Separate admin toggle for showing the floating feedback pill on
-- touch devices. Defaults to false because the draggable pill is
-- awkward on phones and tablets; coaches typically want to opt in.

alter table public.site_settings
  add column if not exists feedback_widget_touch_enabled boolean not null default false;
