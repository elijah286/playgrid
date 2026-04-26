-- Seed Coach AI knowledge base with NFL Flag 5v5 rules.
--
-- These are drafted from commonly-known rule patterns and are NOT pulled
-- from the current official NFL Flag rulebook. Every row is marked
-- authoritative=false and needs_review=true so a site admin can verify
-- and update via the admin chat training mode before users rely on them.
--
-- Filter scope: scope='global', sport_variant='flag_5v5',
-- sanctioning_body='nfl_flag'. game_level/age_division left null because
-- core rules apply across divisions; division-specific overrides will be
-- added as separate documents later.

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body,
  source, source_note,
  authoritative, needs_review
) values

-- ── Field & players ────────────────────────────────────────────────
('global', null,
 'rules', 'field',
 'NFL Flag 5v5 — Field dimensions',
 'The field is typically 30 yards wide by 70 yards long, with two 10-yard end zones. The field is divided into two 25-yard zones with a midfield line-to-gain. Exact dimensions can vary by division and venue; smaller divisions sometimes use shorter fields.',
 'flag_5v5', 'nfl_flag', 'seed',
 'Drafted from common NFL Flag conventions; verify exact dimensions against current official rulebook.',
 false, true),

('global', null,
 'rules', 'players',
 'NFL Flag 5v5 — Players on field',
 'Each team fields 5 players at a time. Substitutions are allowed between plays. Teams must have a minimum number to start play (commonly 4); below that the team forfeits.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Game length & scoring ──────────────────────────────────────────
('global', null,
 'rules', 'game_length',
 'NFL Flag 5v5 — Game length & clock',
 'Games are commonly two 20-minute halves with a running clock that stops only in the final two minutes of each half (for incomplete passes, out of bounds, scores, timeouts, and injuries). Each team typically gets one to two timeouts per half. Halftime is short (3-5 minutes). Length varies by division and league.',
 'flag_5v5', 'nfl_flag', 'seed',
 'Halves length varies (often 20 min for older divisions, 18 or 15 for younger). Verify with official rulebook.',
 false, true),

('global', null,
 'rules', 'scoring',
 'NFL Flag 5v5 — Scoring',
 'Touchdown = 6 points. Extra point from the 5-yard line = 1 point (pass or run). Extra point from the 10-yard line = 2 points (pass or run). Safety = 2 points; the team scored upon then puts the ball in play from their own 5-yard line. Defensive return of an extra point attempt = 2 points.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Snap, downs, line of scrimmage ─────────────────────────────────
('global', null,
 'rules', 'snap',
 'NFL Flag 5v5 — Snap',
 'The ball is snapped between the legs (or sideways) from the center to the quarterback. The snap puts the ball in play. The center can be eligible to receive a pass after the snap.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null,
 'rules', 'downs',
 'NFL Flag 5v5 — Downs and line to gain',
 'Each team has 4 downs to cross midfield (the line to gain). Once midfield is crossed, the team has 4 more downs to score. If the team fails to cross midfield, the ball is turned over on downs at the spot. There are no punts.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Offense rules ──────────────────────────────────────────────────
('global', null,
 'rules', 'pass_clock',
 'NFL Flag 5v5 — 7-second pass clock',
 'The quarterback has 7 seconds from the snap to throw the ball. If the QB still has the ball at 7 seconds, the play is dead and the ball returns to the line of scrimmage. The 7-second clock does not apply once the ball has been handed off.',
 'flag_5v5', 'nfl_flag', 'seed',
 'Some leagues use a 4-second clock for younger divisions; verify.',
 false, true),

('global', null,
 'rules', 'motion',
 'NFL Flag 5v5 — Motion and shifts',
 'One offensive player may be in motion at the snap, parallel to or away from the line of scrimmage. Motion toward the line of scrimmage at the snap is a false start / illegal motion. All other players must be set for at least one second before the snap.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null,
 'rules', 'no_run_zones',
 'NFL Flag 5v5 — No-run zones',
 'There are no-run zones at midfield (typically 5 yards before the line to gain) and near the goal line (typically the 5-yard line going in). Inside a no-run zone, the offense must pass the ball — no designed runs are allowed. The QB is also not allowed to run from scrimmage in some league variants.',
 'flag_5v5', 'nfl_flag', 'seed',
 'Whether the QB can run outside no-run zones varies; many leagues prohibit QB runs entirely.',
 false, true),

('global', null,
 'rules', 'blocking',
 'NFL Flag 5v5 — No blocking',
 'Blocking is not allowed. Offensive players may not impede defensive players physically. This includes screen blocks, picks, or any physical contact intended to obstruct a defender. Incidental contact is judged by the official.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null,
 'rules', 'ball_carrier',
 'NFL Flag 5v5 — Ball carrier rules',
 'Ball carriers may not stiff-arm, dive, jump, or spin to avoid a defender. Lowering the shoulder or charging into a defender is prohibited. The ball carrier is down when a flag is pulled, when the ball touches the ground, or when they step out of bounds.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Defense rules ──────────────────────────────────────────────────
('global', null,
 'rules', 'pass_rush',
 'NFL Flag 5v5 — Pass rush',
 'Defenders rushing the QB must start at least 7 yards from the line of scrimmage at the snap. Any number of defenders may rush from 7 yards back. Defenders not rushing may not cross the line of scrimmage until the ball is handed off, pitched, or thrown.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null,
 'rules', 'flag_pull',
 'NFL Flag 5v5 — Flag pulls and contact',
 'A play ends when a defender pulls the ball carrier''s flag. Defenders may not hold, push, or tackle the ball carrier — the only legal stop is a flag pull. Stripping the ball, swatting at the ball, or contacting the ball carrier beyond what is needed for the flag pull is a penalty.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null,
 'rules', 'interceptions',
 'NFL Flag 5v5 — Interceptions',
 'Interceptions are live and may be returned. If an interception is returned for a touchdown, it counts as 6 points. An intercepted pass on an extra-point attempt is dead at the spot in some leagues; in others it is returnable for 2 points.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Common penalties ───────────────────────────────────────────────
('global', null,
 'rules', 'penalties_offense',
 'NFL Flag 5v5 — Common offensive penalties',
 'Common offensive penalties include: false start (5 yards, replay down), illegal motion (5 yards), illegal forward pass (5 yards from spot, loss of down), offensive pass interference (10 yards, loss of down), flag guarding — using a hand or the ball to prevent a flag pull (10 yards from spot, loss of down), and illegal run (loss of down at previous spot when running from a no-run zone).',
 'flag_5v5', 'nfl_flag', 'seed',
 'Exact yardages vary by league. Verify against current rulebook.',
 false, true),

('global', null,
 'rules', 'penalties_defense',
 'NFL Flag 5v5 — Common defensive penalties',
 'Common defensive penalties include: offside (5 yards), illegal rush — rushing from inside the 7-yard mark (5 yards), defensive pass interference (spot foul, automatic first down), holding (10 yards, automatic first down), stripping the ball (10 yards, possession retained by offense), and unnecessary roughness (10 yards, automatic first down, possible ejection).',
 'flag_5v5', 'nfl_flag', 'seed',
 'Exact yardages vary by league. Verify against current rulebook.',
 false, true),

-- ── Prohibited / safety ────────────────────────────────────────────
('global', null,
 'rules', 'prohibited',
 'NFL Flag 5v5 — Prohibited actions',
 'Prohibited at all times: any form of contact-based defense (tackling, holding, pushing), screen blocks or picks by the offense, stiff-arming, diving, jumping, or spinning by the ball carrier, flag guarding, and trick plays involving deception in formation (e.g. fake snaps designed to draw the defense offside). Fumbles are dead at the spot — there are no live fumbles.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null,
 'rules', 'overtime',
 'NFL Flag 5v5 — Overtime',
 'In playoff games, overtime is typically a series-by-series shootout from the 5-yard line (1 point) or 10-yard line (2 points). Each team gets one possession per round; if tied after a round, another round is played. Regular-season ties may stand depending on the league.',
 'flag_5v5', 'nfl_flag', 'seed',
 'Overtime format varies significantly by league. Verify.',
 false, true);

-- Seed initial revision rows for each newly inserted document.
insert into public.rag_document_revisions (
  document_id, revision_number,
  title, content, source, source_note,
  authoritative, needs_review,
  change_kind, change_summary, changed_by
)
select
  d.id, 1,
  d.title, d.content, d.source, d.source_note,
  d.authoritative, d.needs_review,
  'create', 'Initial seed (drafted, awaiting admin verification)', null
from public.rag_documents d
where d.sport_variant = 'flag_5v5'
  and d.sanctioning_body = 'nfl_flag'
  and d.source = 'seed'
  and not exists (
    select 1 from public.rag_document_revisions r where r.document_id = d.id
  );
