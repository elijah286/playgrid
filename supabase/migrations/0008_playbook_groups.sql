-- Playbook → group → play: optional named groups and stable ordering within a playbook

create table public.playbook_groups (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  name text not null default 'Group',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index playbook_groups_playbook_id_idx on public.playbook_groups (playbook_id);

create trigger playbook_groups_updated_at
  before update on public.playbook_groups
  for each row execute function public.set_updated_at();

alter table public.plays
  add column group_id uuid references public.playbook_groups (id) on delete set null,
  add column sort_order int not null default 0;

create index plays_group_id_idx on public.plays (group_id);

comment on table public.playbook_groups is 'Optional coach-defined groupings of plays within a playbook; plays.group_id is nullable (ungrouped).';
comment on column public.plays.sort_order is 'Order within the playbook (scoped by group when group_id is set).';

-- Backfill deterministic ordering from creation time
with ranked as (
  select
    id,
    row_number() over (partition by playbook_id order by created_at) - 1 as rn
  from public.plays
)
update public.plays p
set sort_order = ranked.rn
from ranked
where p.id = ranked.id;

alter table public.playbook_groups enable row level security;

create policy playbook_groups_all on public.playbook_groups
  for all using (
    exists (
      select 1
      from public.playbooks pb
      join public.teams t on t.id = pb.team_id
      where pb.id = playbook_id and public.is_org_owner(t.org_id)
    )
  )
  with check (
    exists (
      select 1
      from public.playbooks pb
      join public.teams t on t.id = pb.team_id
      where pb.id = playbook_id and public.is_org_owner(t.org_id)
    )
  );
