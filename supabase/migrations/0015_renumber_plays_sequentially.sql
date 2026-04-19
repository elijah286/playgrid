-- Number plays sequentially within each playbook, zero-padded to 2 digits.
-- Ordered by sort_order then created_at so the display matches the UI.
with ordered as (
  select
    id,
    row_number() over (
      partition by playbook_id
      order by sort_order, created_at
    ) as n
  from public.plays
)
update public.plays p
set wristband_code = lpad(ordered.n::text, 2, '0')
from ordered
where p.id = ordered.id;
