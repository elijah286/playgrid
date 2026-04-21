-- Owners can disable duplication for shared members. Default true keeps
-- existing behavior (any member may copy the playbook into their own
-- workspace) until an owner opts out.

alter table public.playbooks
  add column if not exists allow_duplication boolean not null default true;
