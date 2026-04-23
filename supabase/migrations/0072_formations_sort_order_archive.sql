-- Add sort_order and is_archived to formations so coaches can reorder and
-- archive formations from the playbook formations tab, mirroring plays.
-- Backfills sort_order per playbook using created_at so existing rows get
-- a stable initial order.

alter table public.formations
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_archived boolean not null default false;

-- Backfill per-playbook sort_order by created_at asc so older formations
-- appear first. Seeds (playbook_id null) all share 0 which is fine.
with ranked as (
  select id,
         row_number() over (
           partition by playbook_id
           order by created_at asc, id asc
         ) - 1 as rn
  from public.formations
  where playbook_id is not null
)
update public.formations f
set sort_order = ranked.rn
from ranked
where f.id = ranked.id;

create index if not exists formations_playbook_sort_idx
  on public.formations (playbook_id, sort_order);
