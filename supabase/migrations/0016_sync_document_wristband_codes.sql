-- Sync wristbandCode inside play_versions.document JSON with the value stored
-- on the plays row. Print templates read the JSON copy, so without this the
-- sequential codes from 0015 don't reach the print/playsheet view.
update public.play_versions pv
set document = jsonb_set(
  pv.document,
  '{metadata,wristbandCode}',
  to_jsonb(p.wristband_code)
)
from public.plays p
where pv.play_id = p.id
  and pv.document #>> '{metadata,wristbandCode}' is distinct from p.wristband_code;
