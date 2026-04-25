-- Recurring-event reminders
--
-- The original design materialized one playbook_event_reminders row per
-- (event, fire-time) at create. That only works for the first occurrence of
-- a recurring series, so weekly/biweekly events stopped sending after week 1.
--
-- Switch to: store offsets on the event row, expand the recurrence at run time,
-- and dedup with a fires table keyed by (event, occurrence_date, offset).

alter table public.playbook_events
  add column reminder_offsets_minutes integer[] not null default '{}';

create table public.playbook_event_reminder_fires (
  event_id uuid not null references public.playbook_events (id) on delete cascade,
  occurrence_date date not null,
  offset_minutes integer not null,
  sent_at timestamptz not null default now(),
  primary key (event_id, occurrence_date, offset_minutes)
);

alter table public.playbook_event_reminder_fires enable row level security;

-- Visible to anyone who can see the event.
create policy playbook_event_reminder_fires_select on public.playbook_event_reminder_fires
  for select using (
    exists (
      select 1 from public.playbook_events e
      where e.id = event_id and public.can_view_playbook(e.playbook_id)
    )
  );

-- Writes are server-side only (service role); no end-user insert/update policy.
