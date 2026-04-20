-- Staff (coach) metadata on playbook_members.
-- The role enum (owner|editor|viewer) determines access; coaches are
-- modelled as role=editor (or owner). The UI splits roster into
-- "Players" (viewer) and "Staff" (owner|editor). Within Staff, one
-- member may be flagged as head coach and each has a free-form title
-- (e.g. "Offensive Coordinator", "Defensive Backs Coach").

alter table public.playbook_members
  add column if not exists is_head_coach boolean not null default false,
  add column if not exists coach_title text;

-- At most one head coach per playbook.
create unique index if not exists playbook_members_one_head_coach
  on public.playbook_members (playbook_id)
  where is_head_coach;
