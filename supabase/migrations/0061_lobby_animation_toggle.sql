-- Admin-controlled kill switch for the animated "Preview" playbook tiles on
-- the lobby. When true, the Preview/Simple toggle is hidden and the lobby
-- renders only the simple card view.

alter table public.site_settings
  add column if not exists hide_lobby_playbook_animation boolean not null default false;
