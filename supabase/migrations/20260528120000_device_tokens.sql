-- Native push: device token registry.
--
-- NOTE: this table was first created directly against the remote DB during an
-- earlier exploration and never captured as a migration. This file is the
-- authoritative, idempotent definition — it is a no-op on the production DB
-- (objects already exist) but reproduces the exact schema on fresh
-- environments (local dev, future projects). The committed schema is the
-- source of truth from here on.
--
-- Each native (Capacitor) install registers an FCM registration token after
-- the user grants notification permission. We fan out push to every active
-- token a recipient has registered. Tokens rotate and devices uninstall, so:
--   * UNIQUE (user_id, token) — re-registration upserts last_seen_at; the same
--     physical device re-logged-in as a different coach gets its own row.
--   * the send path soft-disables a row (disabled_at + disabled_reason) when
--     FCM returns UNREGISTERED/NOT_FOUND, rather than deleting — keeps an audit
--     trail and lets the partial unique/filtered indexes stay small.
--
-- Registration writes go through POST /api/push/register (validates the
-- caller's session, upserts with the service-role client). Self-access RLS
-- policies exist for a future client-direct path but the only table-level
-- grants are to service_role, so the API route is the active path today.

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  token text not null,
  app_id text,
  app_version text,
  device_label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_reason text,
  unique (user_id, token)
);

create index if not exists device_tokens_user_id_idx
  on public.device_tokens (user_id);

create index if not exists device_tokens_user_active_idx
  on public.device_tokens (user_id, platform) where disabled_at is null;

create index if not exists device_tokens_token_idx
  on public.device_tokens (token) where disabled_at is null;

alter table public.device_tokens enable row level security;

grant select, insert, update, delete on public.device_tokens to service_role;

-- Self-access policies (gate a future client-direct path; inert until a
-- matching grant to `authenticated` is added).
drop policy if exists device_tokens_select_self on public.device_tokens;
create policy device_tokens_select_self on public.device_tokens
  for select using (user_id = auth.uid());

drop policy if exists device_tokens_insert_self on public.device_tokens;
create policy device_tokens_insert_self on public.device_tokens
  for insert with check (user_id = auth.uid());

drop policy if exists device_tokens_update_self on public.device_tokens;
create policy device_tokens_update_self on public.device_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists device_tokens_delete_self on public.device_tokens;
create policy device_tokens_delete_self on public.device_tokens
  for delete using (user_id = auth.uid());

-- Per-category push opt-out. Mirrors public.email_opt_outs so a coach can mute
-- push without losing email, and vice versa. Categories are namespaced strings
-- aligned with the trigger sites: 'calendar' (practice/game reminders + event
-- changes) and 'team' (play broadcasts / team messages).
create table if not exists public.push_opt_outs (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  opted_out_at timestamptz not null default now(),
  source text,
  primary key (user_id, category)
);

create index if not exists push_opt_outs_category_idx
  on public.push_opt_outs (category);

alter table public.push_opt_outs enable row level security;
revoke all on public.push_opt_outs from public, authenticated, anon;
grant select, insert, update, delete on public.push_opt_outs to service_role;
