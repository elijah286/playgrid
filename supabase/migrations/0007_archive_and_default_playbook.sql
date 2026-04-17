-- Phase 1 dashboard + lifecycle support
--
-- Adds:
--   playbooks.is_default   — the per-team "Inbox" playbook where quick-created plays land.
--                            Hidden from the Playbooks list; surfaced indirectly via the dashboard.
--   playbooks.is_archived  — soft-deletion for playbooks.
--   plays.is_archived      — soft-deletion for plays.
--
-- No RLS changes: existing playbook_id → team → org_owner chain still governs access.

alter table public.playbooks
  add column if not exists is_default boolean not null default false,
  add column if not exists is_archived boolean not null default false;

alter table public.plays
  add column if not exists is_archived boolean not null default false;

-- At most one default playbook per team
create unique index if not exists playbooks_default_per_team_idx
  on public.playbooks (team_id)
  where is_default = true;

-- Common list filters
create index if not exists playbooks_team_not_archived_idx
  on public.playbooks (team_id, is_archived);

create index if not exists plays_playbook_not_archived_idx
  on public.plays (playbook_id, is_archived);

-- Backfill: for any team that has no default playbook yet, promote the oldest playbook to default.
-- Safe to re-run; the unique index above prevents duplicates.
with eligible as (
  select distinct on (p.team_id) p.id, p.team_id
  from public.playbooks p
  where not exists (
    select 1 from public.playbooks d
    where d.team_id = p.team_id and d.is_default = true
  )
  order by p.team_id, p.created_at asc, p.id asc
)
update public.playbooks pb
set is_default = true
from eligible e
where pb.id = e.id;
