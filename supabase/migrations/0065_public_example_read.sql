-- Opens up SELECT on published example playbooks to any visitor (signed
-- in or anonymous). Without this, /examples → /playbooks/[id] only works
-- for members of the example playbook, which defeats the purpose.
--
-- Scope: read-only. Writes still require membership, so nothing persists
-- for a non-member visitor even if the UI somehow attempts a mutation.

create policy playbooks_public_example_select on public.playbooks
  for select using (is_public_example = true);

create policy plays_public_example_select on public.plays
  for select using (
    exists (
      select 1 from public.playbooks pb
      where pb.id = plays.playbook_id and pb.is_public_example = true
    )
  );

create policy play_versions_public_example_select on public.play_versions
  for select using (
    exists (
      select 1 from public.plays p
      join public.playbooks pb on pb.id = p.playbook_id
      where p.id = play_versions.play_id and pb.is_public_example = true
    )
  );

-- Formations belong to a team; expose any formation whose team owns at
-- least one published example playbook. System formations (team_id null,
-- is_system true) are already world-readable via 0053's policy.
create policy formations_public_example_select on public.formations
  for select using (
    team_id is not null and exists (
      select 1 from public.playbooks pb
      where pb.team_id = formations.team_id and pb.is_public_example = true
    )
  );
