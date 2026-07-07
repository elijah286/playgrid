-- Seat ledger sees league team playbooks (Phase 3 of
-- docs/league-platform/LIBRARY-DISTRIBUTION-PLAN.md).
--
-- seats_used counted free-tier editor collaborators only on playbooks where
-- the owner holds an owner-member row. League team playbooks deliberately
-- have NO owner-member row (seeding keeps them out of the operator's
-- personal quota), so league coaches were invisible to the ledger. Add the
-- league-ownership path: playbook → team → league → leagues.created_by.
-- Everything else is byte-identical to 0108 — editors only, active only,
-- Coach+ collaborators still ride free, players never counted.
--
-- REVIEW GATE: per the plan, this billing-adjacent change ships on a branch
-- and is applied to prod only after owner sign-off.

create or replace function public.seats_used(p_owner_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct m.user_id)::int
  from public.playbook_members m
  left join public.user_entitlements e on e.user_id = m.user_id
  where m.user_id <> p_owner_id
    and m.role = 'editor'
    and m.status = 'active'
    and (e.tier is null or e.tier = 'free')
    and (
      exists (
        select 1
        from public.playbook_members owner_m
        where owner_m.playbook_id = m.playbook_id
          and owner_m.user_id = p_owner_id
          and owner_m.role = 'owner'
          and owner_m.status = 'active'
      )
      or exists (
        select 1
        from public.playbooks pb
        join public.teams t on t.id = pb.team_id
        join public.leagues l on l.id = t.league_id
        where pb.id = m.playbook_id
          and l.created_by = p_owner_id
      )
    )
$$;
