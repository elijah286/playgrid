-- Native app install + open tracking.
--
-- An "install" can't be observed directly from the web (it happens in the
-- store), so the signal we can own is the FIRST launch of the installed app.
-- The app is a Capacitor WebView pointing at prod, so the web layer detects the
-- native platform and records open/first-open here via recordAppOpenAction
-- (service-role write, same pattern as ui_events) — no native rebuild needed.
--
-- One row per install. `install_id` is a UUID minted on first launch and kept
-- in the WebView's localStorage (stable across launches; regenerated only if
-- the user clears app data, which correctly reads as a fresh install).
--   * first_opened_at  == the install moment (our "downloads/installs" count).
--   * last_opened_at    tracks recency / active installs.
--   * user_id           attached once the install authenticates, and NEVER
--                       cleared back to null on a later anonymous open.
--   * install_referrer  web→install attribution (Play Install Referrer API),
--                       captured once; populated in Phase 2.
-- Reads are admin-only; writes go through the service-role client.

create table if not exists public.app_installs (
  install_id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  platform text not null check (platform in ('ios', 'android')),
  app_version text,
  install_referrer text,
  first_opened_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_installs_user_id_idx
  on public.app_installs (user_id);

create index if not exists app_installs_platform_idx
  on public.app_installs (platform);

create index if not exists app_installs_first_opened_idx
  on public.app_installs (first_opened_at);

alter table public.app_installs enable row level security;

revoke all on public.app_installs from public, authenticated, anon;
grant select, insert, update, delete on public.app_installs to service_role;
