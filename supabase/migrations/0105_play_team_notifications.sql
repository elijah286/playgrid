-- Coach-initiated team notifications for plays.
--
-- A coach hits "Notify team about updates" on a play; one row lands here
-- with an optional comment and a snapshot of the play's current_version_id
-- at send time. Used by:
--   1. The home Activity feed (every team member sees recent broadcasts).
--   2. The daily digest (skip plays already explicitly broadcast since the
--      last digest cut, so the same change isn't surfaced twice).

create table public.play_team_notifications (
  id uuid primary key default gen_random_uuid(),
  play_id uuid not null references public.plays(id) on delete cascade,
  play_version_id uuid references public.play_versions(id) on delete set null,
  sent_by uuid not null,
  sent_at timestamptz not null default now(),
  comment text check (
    comment is null or length(btrim(comment)) between 1 and 2000
  )
);

create index ptn_play_idx
  on public.play_team_notifications (play_id, sent_at desc);

alter table public.play_team_notifications enable row level security;

-- Read: any active member of the playbook the play belongs to.
create policy ptn_select on public.play_team_notifications
  for select using (
    exists (
      select 1 from public.plays p
      where p.id = play_id and public.can_view_playbook(p.playbook_id)
    )
  );

-- Insert: only editors/owners of the playbook, writing rows attributed to
-- themselves.
create policy ptn_insert on public.play_team_notifications
  for insert with check (
    sent_by = auth.uid()
    and exists (
      select 1 from public.plays p
      where p.id = play_id and public.can_edit_playbook(p.playbook_id)
    )
  );
