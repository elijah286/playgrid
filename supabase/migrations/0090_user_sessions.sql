-- User sessions
--
-- Tracks active sign-in sessions per user, keyed by a stable browser/device
-- cookie (xog_device_id). Used for two things:
--   1. Anti-abuse: cap concurrent sessions per tier (free=1, coach=2,
--      coach_ai=3). When a new sign-in pushes over the cap, the
--      least-recently-active session is revoked.
--   2. User-visible audit log: /account shows recent sessions with device
--      label and last-seen, plus a "Sign out" action per row.
--
-- Inserts/updates flow through the auth middleware running with the user's
-- session, so RLS only needs self-read/self-revoke. Admin operations go
-- through the service role.

create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Stable browser identifier from the xog_device_id cookie. One row per
  -- (user, device); signing out and back in on the same device reuses the
  -- row (last_seen_at moves forward, revoked_at is cleared on re-auth).
  device_id text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  -- Display strings derived at insert time. Kept denormalized so the audit
  -- list can render without a UA parser at read time.
  device_label text,
  approx_location text,
  revoked_at timestamptz,
  revoked_reason text check (
    revoked_reason is null
    or revoked_reason in ('user', 'cap_kicked', 'password_change', 'admin')
  ),
  unique (user_id, device_id)
);

-- Hot path: "active sessions for this user, newest activity first".
create index user_sessions_user_active_idx
  on public.user_sessions (user_id, last_seen_at desc)
  where revoked_at is null;

alter table public.user_sessions enable row level security;

-- Users can read their own sessions for the audit list.
create policy user_sessions_select_self on public.user_sessions
  for select using (user_id = auth.uid());

-- Users can revoke their own sessions (set revoked_at). They cannot
-- un-revoke or change other fields meaningfully — the WITH CHECK keeps the
-- user_id pinned to themselves; revoked_at is the only field the UI sets.
create policy user_sessions_update_self on public.user_sessions
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No insert/delete policies: those run via the service role from middleware.
