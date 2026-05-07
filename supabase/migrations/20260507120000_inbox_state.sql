-- Per-user state overlay for the home Inbox.
--
-- Most "inbox alerts" the UI shows are *derived* — they come from existing
-- rows in playbook_members, roster_claims, playbook_events, etc. They are
-- not rows in an inbox table. To support email-style archive + delete on
-- those derived alerts (without mutating the underlying source data), we
-- store a per-user (alert_kind, source_id) overlay here.
--
-- Default state for any alert is "active": no row in this table. Taking
-- an archive or delete action upserts a row with the matching status.
-- The list query LEFT JOINs this table and filters by view:
--   active   = source produces alert AND no row OR status is null
--   archived = source produces alert AND status = 'archived'
--   all      = source produces alert AND status != 'deleted'
--   deleted  = hidden from all views
--
-- source_id format depends on alert_kind. Composite keys are stringified
-- with ':' or '|' so the row identifies the alert exactly:
--   membership / coach_upgrade : '<playbook_id>:<user_id>'
--   roster_claim              : '<claim_id>'
--   rsvp_pending              : '<event_id>|<occurrence_date>'
--   admin_notice              : '<notice_id>'
--   mention / share / system_alert : implementation-defined when wired
--
-- "Resolving" an alert via its native flow (RSVP'd, membership approved,
-- claim approved) makes the source stop producing the alert — the
-- inbox_state row, if any, becomes harmless and is left in place.

create table if not exists public.inbox_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  alert_kind text not null check (alert_kind in (
    'membership',
    'coach_upgrade',
    'roster_claim',
    'rsvp_pending',
    'system_alert',
    'mention',
    'share',
    'admin_notice'
  )),
  source_id text not null,
  status text not null default 'archived' check (status in ('archived', 'deleted')),
  updated_at timestamptz not null default now(),
  primary key (user_id, alert_kind, source_id)
);

create index if not exists inbox_state_user_status_idx
  on public.inbox_state (user_id, status);

alter table public.inbox_state enable row level security;

-- Users only see and mutate their own overlay rows.
drop policy if exists inbox_state_select on public.inbox_state;
create policy inbox_state_select on public.inbox_state
  for select using (auth.uid() = user_id);

drop policy if exists inbox_state_insert on public.inbox_state;
create policy inbox_state_insert on public.inbox_state
  for insert with check (auth.uid() = user_id);

drop policy if exists inbox_state_update on public.inbox_state;
create policy inbox_state_update on public.inbox_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists inbox_state_delete on public.inbox_state;
create policy inbox_state_delete on public.inbox_state
  for delete using (auth.uid() = user_id);
