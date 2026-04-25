-- Admin-controlled toggle that hides personally-identifying owner info on
-- the About page (name, photo montage, hometown). Lets the site be operated
-- by someone other than the original creator without leaking that history.

alter table public.site_settings
  add column if not exists hide_owner_info_about boolean not null default false;
