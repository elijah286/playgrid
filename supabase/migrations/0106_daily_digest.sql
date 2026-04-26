-- Daily digest preferences + idempotent send-tracking.
--
-- For each (user, playbook) we keep one preferences row controlling whether
-- to email a roll-up of the prior day's activity (member joins, coach play
-- broadcasts, new plays). Default: opted-in at 08:00 in the user's timezone.
-- Zero-activity days are skipped at send time, so no row needed for "off
-- today" — only opt-out + when to send when there *is* activity.
--
-- digest_sends serves two purposes:
--   1) Idempotency: UNIQUE(user_id, playbook_id, send_date) so duplicate cron
--      ticks within the same local day can't double-send.
--   2) Activity window: each send records the latest activity timestamp it
--      covered, so the next send picks up exactly where it left off (no gaps,
--      no overlap) regardless of when in the day it actually fires.

create table public.digest_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  opted_out boolean not null default false,
  send_hour_local smallint not null default 8 check (send_hour_local between 0 and 23),
  timezone text not null default 'America/Los_Angeles',
  updated_at timestamptz not null default now(),
  primary key (user_id, playbook_id)
);

alter table public.digest_preferences enable row level security;

-- Members read/manage only their own preferences row, scoped to playbooks
-- they currently belong to.
create policy "digest_prefs_self_select"
  on public.digest_preferences for select
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.playbook_members m
      where m.playbook_id = digest_preferences.playbook_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

create policy "digest_prefs_self_upsert"
  on public.digest_preferences for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.playbook_members m
      where m.playbook_id = digest_preferences.playbook_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

create policy "digest_prefs_self_update"
  on public.digest_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "digest_prefs_self_delete"
  on public.digest_preferences for delete
  using (user_id = auth.uid());

create table public.digest_sends (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  send_date date not null,
  sent_at timestamptz not null default now(),
  -- High-water mark: latest occurredAt this digest covered. Next digest
  -- starts strictly after this so cumulative diffs don't double-count.
  covered_through timestamptz not null,
  joins_count integer not null default 0,
  play_updates_count integer not null default 0,
  unique (user_id, playbook_id, send_date)
);

create index digest_sends_lookup_idx
  on public.digest_sends (user_id, playbook_id, sent_at desc);

alter table public.digest_sends enable row level security;

-- Members read their own send log (so the UI can show "last digest:
-- yesterday at 8am"). All writes go through the service-role cron.
create policy "digest_sends_self_select"
  on public.digest_sends for select
  using (user_id = auth.uid());
