-- Re-scope roster to the playbook level.
--
-- Original Phase 1 (0021) put roster fields on a separate `team_members`
-- table thinking teams would be the access surface. In practice each
-- playbook IS its own team — coaches manage rosters per playbook, not per
-- some org-level grouping. Lifting the roster columns onto `playbook_members`
-- (which already gates access via RLS) collapses the model to one table per
-- "person on this playbook".

alter table public.playbook_members
  add column if not exists label text,
  add column if not exists jersey_number text,
  add column if not exists position text,
  add column if not exists is_minor boolean not null default false;

drop table if exists public.team_members;
drop type if exists public.team_member_role;
drop function if exists public.team_members_set_updated_at();
