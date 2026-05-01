-- Site-admin list of emails to exclude from the Analytics dashboards
-- (Traffic + Monetization Health). Used by the owner to filter out their
-- own accounts, family accounts, and test accounts so internal activity
-- doesn't skew the numbers. Stored lowercased; matched against
-- auth.users.email at query time.

alter table public.site_settings
  add column if not exists analytics_excluded_emails text[] not null default '{}';
