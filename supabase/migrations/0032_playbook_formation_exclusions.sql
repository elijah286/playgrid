-- Per-playbook formation exclusions.
-- Default: every formation whose variant matches the playbook's sport_variant
-- is available in that playbook. This table lists exceptions — formations the
-- coach has explicitly removed from a given playbook. Removing a row re-adds
-- the formation; deleting the formation or playbook cascades.

create table if not exists public.playbook_formation_exclusions (
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  formation_id uuid not null references public.formations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (playbook_id, formation_id)
);

create index if not exists idx_pfx_formation on public.playbook_formation_exclusions (formation_id);

alter table public.playbook_formation_exclusions enable row level security;

-- Anyone who can edit a playbook can see + modify its formation exclusions.
create policy "pfx_select" on public.playbook_formation_exclusions
  for select using (public.can_edit_playbook(playbook_id));

create policy "pfx_modify" on public.playbook_formation_exclusions
  for all using (public.can_edit_playbook(playbook_id))
  with check (public.can_edit_playbook(playbook_id));
