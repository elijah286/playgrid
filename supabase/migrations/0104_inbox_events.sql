-- Inbox audit log.
--
-- Records the resolution of every owner-actionable alert (membership join
-- requests, coach-upgrade requests, roster claims). Used to drive the
-- "Resolved" history view on the home Inbox tab.
--
-- We snapshot subject_display_name + kind-specific detail at write time so
-- history rows survive subsequent profile edits, claim deletes, or member
-- removals (denyMemberAction hard-deletes the playbook_members row).

create table public.inbox_events (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  kind text not null check (kind in ('membership','coach_upgrade','roster_claim')),
  action text not null check (action in ('approved','rejected')),
  subject_user_id uuid,
  subject_display_name text,
  detail jsonb not null default '{}'::jsonb,
  resolved_by uuid not null,
  resolved_at timestamptz not null default now()
);

create index inbox_events_playbook_idx
  on public.inbox_events (playbook_id, resolved_at desc);

alter table public.inbox_events enable row level security;

-- Read: any active owner of the playbook.
create policy inbox_events_select on public.inbox_events
  for select using (
    exists (
      select 1 from public.playbook_members m
      where m.playbook_id = inbox_events.playbook_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
        and m.status = 'active'
    )
  );

-- Insert: only the acting owner can write their own resolution row.
create policy inbox_events_insert on public.inbox_events
  for insert with check (
    resolved_by = auth.uid()
    and exists (
      select 1 from public.playbook_members m
      where m.playbook_id = inbox_events.playbook_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
        and m.status = 'active'
    )
  );
