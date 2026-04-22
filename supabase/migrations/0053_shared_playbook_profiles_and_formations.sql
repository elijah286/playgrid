-- Shared playbooks need to expose co-members' display names and the
-- owner's custom formations. Previously:
--   * profiles RLS only revealed your own row, so a shared coach saw
--     "—" instead of staff names.
--   * formations RLS only allowed org owners to read, so shared coaches
--     couldn't see the custom formations the playbook depends on.
-- Both policies now also match when the viewer shares an active
-- membership with the profile/team via any playbook.

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or public.is_site_admin()
    or exists (
      select 1
      from public.playbook_members m_me
      join public.playbook_members m_them
        on m_them.playbook_id = m_me.playbook_id
      where m_me.user_id = auth.uid()
        and m_them.user_id = profiles.id
        and m_me.status = 'active'
        and m_them.status = 'active'
    )
  );

drop policy if exists formations_select on public.formations;
create policy formations_select on public.formations
  for select using (
    is_system = true
    or team_id is null
    or exists (
      select 1 from public.teams t
      where t.id = formations.team_id and public.is_org_owner(t.org_id)
    )
    or exists (
      select 1
      from public.playbooks p
      join public.playbook_members m on m.playbook_id = p.id
      where p.team_id = formations.team_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );
