-- Team Calendar
--
-- Per-playbook events (practice / game / scrimmage) with RSVPs, coach-defined
-- reminders, change-tracking notifications for badges, and signed-token ICS
-- feeds.
--
-- Permission model:
--   coaches  = can_edit_playbook  → CRUD events, schedule reminders, rotate ICS token
--   players  = can_view_playbook  → read events, RSVP for themselves
-- Recurring events are stored as a single row with an iCal RRULE; per-instance
-- overrides ride on event_rsvps via occurrence_date and (later) on event rows
-- with recurrence_parent_id when an instance is materially edited.

create type public.playbook_event_type as enum ('practice', 'game', 'scrimmage');
create type public.playbook_event_home_away as enum ('home', 'away', 'neutral');
create type public.playbook_rsvp_status as enum ('yes', 'no', 'maybe');

-- ─── Events ───────────────────────────────────────────────────────────────
create table public.playbook_events (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  type public.playbook_event_type not null,
  title text not null,
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 1 and 24 * 60),
  arrive_minutes_before integer not null default 0 check (arrive_minutes_before >= 0),
  -- IANA tz name selected by the coach when creating; everyone sees this tz.
  timezone text not null default 'America/New_York',
  location_name text,
  location_address text,
  location_lat double precision,
  location_lng double precision,
  notes text,
  -- Game-specific (null for practice).
  opponent text,
  home_away public.playbook_event_home_away,
  score_us integer,
  score_them integer,
  -- Recurrence: iCal RRULE (e.g. "FREQ=WEEKLY;BYDAY=TU;UNTIL=20260601T000000Z").
  -- recurrence_parent_id is set when an instance is detached/overridden.
  -- recurrence_exdate is a list of UTC timestamps to skip in the parent series.
  recurrence_rule text,
  recurrence_parent_id uuid references public.playbook_events (id) on delete cascade,
  recurrence_exdate timestamptz[] not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index playbook_events_playbook_starts_idx
  on public.playbook_events (playbook_id, starts_at)
  where deleted_at is null;
create index playbook_events_recurrence_parent_idx
  on public.playbook_events (recurrence_parent_id)
  where recurrence_parent_id is not null;

create or replace function public.touch_playbook_events_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger playbook_events_touch_updated_at
  before update on public.playbook_events
  for each row execute function public.touch_playbook_events_updated_at();

alter table public.playbook_events enable row level security;

create policy playbook_events_select on public.playbook_events
  for select using (public.can_view_playbook(playbook_id));

create policy playbook_events_insert on public.playbook_events
  for insert with check (public.can_edit_playbook(playbook_id));

create policy playbook_events_update on public.playbook_events
  for update using (public.can_edit_playbook(playbook_id))
  with check (public.can_edit_playbook(playbook_id));

create policy playbook_events_delete on public.playbook_events
  for delete using (public.can_edit_playbook(playbook_id));

-- ─── RSVPs ────────────────────────────────────────────────────────────────
-- occurrence_date lets a recurring series have one RSVP per instance.
-- For non-recurring events, occurrence_date == date(starts_at) at the event tz.
create table public.playbook_event_rsvps (
  event_id uuid not null references public.playbook_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  occurrence_date date not null,
  status public.playbook_rsvp_status not null,
  note text,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id, occurrence_date)
);

create index playbook_event_rsvps_user_idx
  on public.playbook_event_rsvps (user_id);

create or replace function public.touch_playbook_event_rsvps_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger playbook_event_rsvps_touch_updated_at
  before update on public.playbook_event_rsvps
  for each row execute function public.touch_playbook_event_rsvps_updated_at();

alter table public.playbook_event_rsvps enable row level security;

-- Anyone who can see the playbook sees all RSVPs (visibility is a feature).
create policy playbook_event_rsvps_select on public.playbook_event_rsvps
  for select using (
    exists (
      select 1 from public.playbook_events e
      where e.id = event_id and public.can_view_playbook(e.playbook_id)
    )
  );

-- Users can only write their own RSVP, and only on events they can see.
create policy playbook_event_rsvps_upsert on public.playbook_event_rsvps
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.playbook_events e
      where e.id = event_id and public.can_view_playbook(e.playbook_id)
    )
  );

create policy playbook_event_rsvps_update on public.playbook_event_rsvps
  for update using (
    user_id = auth.uid()
    and exists (
      select 1 from public.playbook_events e
      where e.id = event_id and public.can_view_playbook(e.playbook_id)
    )
  )
  with check (user_id = auth.uid());

create policy playbook_event_rsvps_delete on public.playbook_event_rsvps
  for delete using (user_id = auth.uid());

-- ─── Reminders ────────────────────────────────────────────────────────────
-- Coach-scheduled or auto-generated email reminders. The Supabase edge
-- function "calendar-reminders" picks up rows where send_at <= now() and
-- sent_at is null, sends via Resend, then marks sent.
create type public.playbook_reminder_kind as enum ('manual', 'event_created', 'event_edited', 'event_cancelled');

create table public.playbook_event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.playbook_events (id) on delete cascade,
  occurrence_date date,
  send_at timestamptz not null,
  kind public.playbook_reminder_kind not null default 'manual',
  sent_at timestamptz,
  error text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index playbook_event_reminders_due_idx
  on public.playbook_event_reminders (send_at)
  where sent_at is null;

alter table public.playbook_event_reminders enable row level security;

create policy playbook_event_reminders_select on public.playbook_event_reminders
  for select using (
    exists (
      select 1 from public.playbook_events e
      where e.id = event_id and public.can_view_playbook(e.playbook_id)
    )
  );

create policy playbook_event_reminders_write on public.playbook_event_reminders
  for all using (
    exists (
      select 1 from public.playbook_events e
      where e.id = event_id and public.can_edit_playbook(e.playbook_id)
    )
  )
  with check (
    exists (
      select 1 from public.playbook_events e
      where e.id = event_id and public.can_edit_playbook(e.playbook_id)
    )
  );

-- ─── Notifications (for in-app badge) ─────────────────────────────────────
-- One row per (event change × recipient). The badge counts unseen rows for
-- a user; opening the calendar tab marks them seen.
create type public.playbook_event_notification_kind as enum (
  'created', 'edited', 'cancelled', 'reminder'
);

create table public.playbook_event_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.playbook_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.playbook_event_notification_kind not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create index playbook_event_notifications_user_unseen_idx
  on public.playbook_event_notifications (user_id)
  where seen_at is null;

alter table public.playbook_event_notifications enable row level security;

-- A user only ever reads / clears their own.
create policy playbook_event_notifications_select on public.playbook_event_notifications
  for select using (user_id = auth.uid());

create policy playbook_event_notifications_update on public.playbook_event_notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Inserts come from server actions running with service role; no insert policy
-- for end users.

-- ─── Calendar feed tokens ─────────────────────────────────────────────────
-- One active token per playbook; coaches can rotate by inserting a new row
-- and revoking the old. Public ICS feed validates the active token.
create table public.playbook_calendar_tokens (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  token text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index playbook_calendar_tokens_active_idx
  on public.playbook_calendar_tokens (playbook_id)
  where revoked_at is null;

alter table public.playbook_calendar_tokens enable row level security;

-- Visible to anyone who can view the playbook (so members can copy the URL).
create policy playbook_calendar_tokens_select on public.playbook_calendar_tokens
  for select using (public.can_view_playbook(playbook_id));

create policy playbook_calendar_tokens_write on public.playbook_calendar_tokens
  for all using (public.can_edit_playbook(playbook_id))
  with check (public.can_edit_playbook(playbook_id));
