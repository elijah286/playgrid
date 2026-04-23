-- Formations move from team-scoped to playbook-scoped.
--
-- Before: formations.team_id implicitly shared every formation across every
-- playbook in that team, with playbook_formation_exclusions as an opt-out
-- patch. That coupling made copying playbooks, inviting cross-team members,
-- and reasoning about ownership painful.
--
-- After: formations.playbook_id owns each row. Sharing between playbooks is
-- explicit (via the Copy flow). A global seed pool (is_seed=true,
-- playbook_id=null) is cloned into every new playbook at creation time.
-- Site admins manage seeds; they are the source of "starter" formations.

begin;

-- 1. Add the new columns. playbook_id is nullable during backfill; we add
--    the XOR CHECK after data is repaired.
alter table public.formations
  add column playbook_id uuid references public.playbooks(id) on delete cascade,
  add column is_seed boolean not null default false;

create index if not exists formations_playbook_idx
  on public.formations (playbook_id)
  where playbook_id is not null;

create index if not exists formations_seed_idx
  on public.formations (is_seed)
  where is_seed;

-- 2. System formations become the initial seed pool. They already have
--    team_id null, so the is_seed flag is the only change.
update public.formations
   set is_seed = true
 where is_system = true;

-- 3. Backfill user formations. For each user formation F in team T:
--    clone it into every playbook in T that currently references F (either
--    because a play links to it, or because it was visible = not excluded).
--    The first visible playbook claims F itself (keeps its id, preserves
--    existing play FKs); subsequent playbooks get fresh clones with plays
--    repointed.
do $$
declare
  f record;
  pb record;
  new_id uuid;
  first_pb uuid;
  fallback_pb uuid;
begin
  for f in
    select id, team_id, semantic_key, params, kind, created_at
      from public.formations
     where is_system = false and team_id is not null
  loop
    first_pb := null;

    for pb in
      select distinct p.id, p.created_at
        from public.playbooks p
       where p.team_id = f.team_id
         and (
           not exists (
             select 1 from public.playbook_formation_exclusions e
              where e.playbook_id = p.id and e.formation_id = f.id
           )
           or exists (
             select 1 from public.plays pl
              where pl.playbook_id = p.id
                and (pl.formation_id = f.id or pl.opponent_formation_id = f.id)
           )
         )
       order by p.created_at asc, p.id asc
    loop
      if first_pb is null then
        update public.formations set playbook_id = pb.id where id = f.id;
        first_pb := pb.id;
      else
        new_id := gen_random_uuid();
        insert into public.formations
          (id, team_id, is_system, semantic_key, params, kind, created_at, playbook_id, is_seed)
        values
          (new_id, f.team_id, false, f.semantic_key, f.params, f.kind, f.created_at, pb.id, false);

        update public.plays
           set formation_id = new_id
         where playbook_id = pb.id and formation_id = f.id;

        update public.plays
           set opponent_formation_id = new_id
         where playbook_id = pb.id and opponent_formation_id = f.id;
      end if;
    end loop;

    -- Formation was visible to no playbook: assign to any playbook in the
    -- team (including the hidden default) so it survives, or drop it if
    -- the team has no playbooks at all.
    if first_pb is null then
      select p.id into fallback_pb
        from public.playbooks p
       where p.team_id = f.team_id
       order by p.created_at asc, p.id asc
       limit 1;
      if fallback_pb is not null then
        update public.formations set playbook_id = fallback_pb where id = f.id;
      else
        delete from public.formations where id = f.id;
      end if;
    end if;
  end loop;
end $$;

-- 4. Repoint any play still dangling across teams (e.g. a play in team A's
--    playbook pointing to a formation that ended up in team B's playbook).
--    Clone the formation into the play's playbook on demand.
do $$
declare
  r record;
  new_id uuid;
  src record;
begin
  for r in
    select pl.id as play_id, pl.playbook_id as play_pb, pl.formation_id as f_id
      from public.plays pl
      join public.formations f on f.id = pl.formation_id
     where pl.formation_id is not null
       and f.playbook_id is not null
       and f.playbook_id <> pl.playbook_id
  loop
    select semantic_key, params, kind, team_id, created_at
      into src
      from public.formations
     where id = r.f_id;
    new_id := gen_random_uuid();
    insert into public.formations
      (id, team_id, is_system, semantic_key, params, kind, created_at, playbook_id, is_seed)
    values
      (new_id, src.team_id, false, src.semantic_key, src.params, src.kind, src.created_at, r.play_pb, false);
    update public.plays set formation_id = new_id where id = r.play_id;
  end loop;

  for r in
    select pl.id as play_id, pl.playbook_id as play_pb, pl.opponent_formation_id as f_id
      from public.plays pl
      join public.formations f on f.id = pl.opponent_formation_id
     where pl.opponent_formation_id is not null
       and f.playbook_id is not null
       and f.playbook_id <> pl.playbook_id
  loop
    select semantic_key, params, kind, team_id, created_at
      into src
      from public.formations
     where id = r.f_id;
    new_id := gen_random_uuid();
    insert into public.formations
      (id, team_id, is_system, semantic_key, params, kind, created_at, playbook_id, is_seed)
    values
      (new_id, src.team_id, false, src.semantic_key, src.params, src.kind, src.created_at, r.play_pb, false);
    update public.plays set opponent_formation_id = new_id where id = r.play_id;
  end loop;
end $$;

-- 5. Any non-seed row still missing a playbook_id is an orphan (team had no
--    playbooks). Drop it.
delete from public.formations where not is_seed and playbook_id is null;

-- 6. Enforce the invariant going forward.
alter table public.formations
  add constraint formations_seed_xor_playbook
  check (
    (is_seed and playbook_id is null)
    or (not is_seed and playbook_id is not null)
  );

-- 7. Drop old policies (they reference the columns we're about to drop).
drop policy if exists formations_select on public.formations;
drop policy if exists formations_insert on public.formations;
drop policy if exists formations_update on public.formations;
drop policy if exists formations_delete on public.formations;
drop policy if exists formations_public_example_select on public.formations;

-- 8. Retire the old scoping columns + exclusions table.
drop index if exists public.formations_is_system_idx;
alter table public.formations drop column is_system;
alter table public.formations drop column team_id;
drop table if exists public.playbook_formation_exclusions;

-- Read: seeds are world-readable (every coach needs them at playbook
-- creation time); otherwise membership on the owning playbook.
create policy formations_select on public.formations
  for select using (
    is_seed
    or (playbook_id is not null and public.can_view_playbook(playbook_id))
  );

-- Public-example formations: expose formations owned by a published
-- example playbook to anonymous visitors.
create policy formations_public_example_select on public.formations
  for select using (
    playbook_id is not null and exists (
      select 1 from public.playbooks pb
      where pb.id = formations.playbook_id and pb.is_public_example = true
    )
  );

-- Write: seeds are admin-only; playbook formations require edit rights on
-- the owning playbook.
create policy formations_insert on public.formations
  for insert with check (
    (is_seed and public.is_site_admin())
    or (not is_seed and playbook_id is not null and public.can_edit_playbook(playbook_id))
  );

create policy formations_update on public.formations
  for update using (
    (is_seed and public.is_site_admin())
    or (not is_seed and playbook_id is not null and public.can_edit_playbook(playbook_id))
  );

create policy formations_delete on public.formations
  for delete using (
    (is_seed and public.is_site_admin())
    or (not is_seed and playbook_id is not null and public.can_edit_playbook(playbook_id))
  );

commit;
