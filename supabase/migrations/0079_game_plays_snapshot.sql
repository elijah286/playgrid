-- Frozen snapshot of the play + formation as they existed at call time.
-- Stored on game_plays so the Game Results review surface can re-render
-- the play exactly as the coach saw it on the sideline, even if the play
-- (or its current play_versions row) is later edited or renamed.
--
-- play_versions rows are *almost* immutable but renamePlayAction can
-- mutate document.metadata.coachName in place, and past migrations have
-- backfilled fields into historical version documents. So we cannot rely
-- on the play_versions row pointed at by game_plays.play_version_id as a
-- frozen snapshot. The snapshot column below is written once at call
-- time and never updated.
--
-- Shape:
--   {
--     "snapshotVersion": 1,
--     "play": { ...PlayDocument as it was at called_at... },
--     "formation": { ...formation doc, may be null... },
--     "playName": "Power Right",
--     "groupName": "Run Game" | null
--   }
--
-- snapshotVersion 0 is reserved for best-effort backfills from the
-- current play_versions document (data may have drifted).

alter table public.game_plays
  add column if not exists snapshot jsonb not null default '{}'::jsonb;

-- Best-effort backfill of existing rows from the play_versions document
-- that game_plays.play_version_id points at. Marked snapshotVersion: 0
-- so consumers know this is an approximation, not a true snapshot.
update public.game_plays gp
set snapshot = jsonb_build_object(
  'snapshotVersion', 0,
  'play', coalesce(
    (select document from public.play_versions where id = gp.play_version_id),
    '{}'::jsonb
  ),
  'formation', null,
  'playName', coalesce(p.name, ''),
  'groupName', g.name
)
from public.plays p
left join public.playbook_groups g on g.id = p.group_id
where gp.play_id = p.id
  and gp.snapshot = '{}'::jsonb;
