-- Rating prompt tracking on profiles:
--   rating_triggers_fired  – array of milestone keys that have fired for this user
--   rating_prompt_shown_at – when we last surfaced the App Store nudge
--
-- Site setting:
--   suggest_reviews – controls who can receive the nudge
--     'only_admins' (default) – show only to site admins while we validate the flow
--     'everyone'              – show to all eligible users
--     'off'                   – never show the nudge

alter table profiles
  add column if not exists rating_triggers_fired text[] not null default '{}',
  add column if not exists rating_prompt_shown_at timestamptz;

alter table site_settings
  add column if not exists suggest_reviews text not null default 'only_admins'
  check (suggest_reviews in ('everyone', 'only_admins', 'off'));
