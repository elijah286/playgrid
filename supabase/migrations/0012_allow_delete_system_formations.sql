-- Allow authenticated users to delete system (team_id is null) formations.
-- Users asked for all formations to be deletable from the UI; the original
-- policy only permitted deleting team-owned formations.

drop policy if exists formations_delete on public.formations;

create policy formations_delete on public.formations
  for delete using (
    team_id is null
    or exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_owner(t.org_id)
    )
    or public.is_site_admin()
  );
