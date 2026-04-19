-- Performance indexes for hot query paths.
-- listPlaysAction filters by (playbook_id, is_archived) and orders by updated_at.
create index if not exists plays_playbook_archived_updated_idx
  on public.plays (playbook_id, is_archived, updated_at desc);

-- getDashboardSummaryAction orders non-archived plays by updated_at desc.
create index if not exists plays_archived_updated_idx
  on public.plays (is_archived, updated_at desc);

-- listFormationsAction filters by is_system.
create index if not exists formations_is_system_idx
  on public.formations (is_system);
