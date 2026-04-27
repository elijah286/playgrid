-- Coach AI KB — NFL Flag 5v5 penalties (granular).
--
-- One chunk per specific penalty with name, trigger, yardage, and
-- enforcement spot. Complements the summary chunks in 0116/0118.
-- All rows authoritative=false / needs_review=true.

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body,
  source, source_note,
  authoritative, needs_review
) values

-- ── Pre-snap, offense ─────────────────────────────────────────────
('global', null, 'rules', 'penalty_false_start',
 'NFL Flag 5v5 — Penalty: False start',
 'False start: any movement by an offensive player after taking a set position and before the snap that simulates the start of a play (lurching, head bob, stepping forward). Penalty: 5 yards from the line of scrimmage, replay the down. Dead-ball foul — kills the play immediately.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_illegal_motion_offense',
 'NFL Flag 5v5 — Penalty: Illegal motion',
 'Illegal motion: more than one offensive player in motion at the snap, or a motion player moving toward the line of scrimmage at the snap. Penalty: 5 yards from the line of scrimmage, replay the down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_illegal_formation',
 'NFL Flag 5v5 — Penalty: Illegal formation',
 'Illegal formation: failing to meet the league''s minimum requirements (e.g. no center over the ball, players outside the legal alignment). Penalty: 5 yards from the line of scrimmage, replay the down.',
 'flag_5v5', 'nfl_flag', 'seed',
 'NFL Flag national rules are largely open-formation; verify what your league requires.',
 false, true),

('global', null, 'rules', 'penalty_delay_of_game_v2',
 'NFL Flag 5v5 — Penalty: Delay of game',
 'Delay of game: failing to snap the ball before the play clock expires (typically 25 or 30 seconds). Penalty: 5 yards from the line of scrimmage, replay the down. Also called for deliberately delaying a dead ball ready (e.g. holding the ball too long after a flag pull).',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_illegal_substitution',
 'NFL Flag 5v5 — Penalty: Illegal substitution',
 'Illegal substitution: substituting after the ball is set for play, or having too many players on the field at the snap. Penalty: 5 yards from the line of scrimmage, replay the down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Pre-snap, defense ─────────────────────────────────────────────
('global', null, 'rules', 'penalty_offside_defense',
 'NFL Flag 5v5 — Penalty: Offside (defense)',
 'Offside: a defender lined up in or crossing the neutral zone at the snap. Penalty: 5 yards from the line of scrimmage, replay the down. The play continues — offense may decline if the result was favorable.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_encroachment',
 'NFL Flag 5v5 — Penalty: Encroachment',
 'Encroachment: defender crosses the line of scrimmage and contacts an offensive player before the snap, OR enters the neutral zone in an unabated path to the QB before the snap. Penalty: 5 yards from the line of scrimmage, dead-ball foul, replay the down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_illegal_rush',
 'NFL Flag 5v5 — Penalty: Illegal rush',
 'Illegal rush: a defender rushing the QB started inside the 7-yard rush marker, or a non-rushing defender crossed the line of scrimmage before the ball was handed off, pitched, or thrown. Penalty: 5 yards from the line of scrimmage, automatic first down (in some leagues), or replay the down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Snap-and-after, offense ───────────────────────────────────────
('global', null, 'rules', 'penalty_illegal_forward_pass',
 'NFL Flag 5v5 — Penalty: Illegal forward pass',
 'Illegal forward pass: forward pass thrown from beyond the line of scrimmage, second forward pass on the same play, or a forward pass after the ball changed possession. Penalty: 5 yards from the spot of the foul, loss of down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_intentional_grounding',
 'NFL Flag 5v5 — Penalty: Intentional grounding',
 'Intentional grounding: QB throws a forward pass with no eligible receiver in the area, intending only to avoid a sack. Penalty: 5 yards from the spot of the pass, loss of down.',
 'flag_5v5', 'nfl_flag', 'seed',
 'Some recreational NFL Flag rule sets do not call grounding; verify.',
 false, true),

('global', null, 'rules', 'penalty_illegal_run',
 'NFL Flag 5v5 — Penalty: Illegal run (no-run zone)',
 'Illegal run: ball carrier runs from inside a no-run zone (typically 5 yards before the line to gain at midfield, and 5 yards before the goal line). Penalty: loss of down at the previous spot. The offense must pass from inside a no-run zone.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_qb_run_illegal',
 'NFL Flag 5v5 — Penalty: Illegal QB run',
 'Illegal QB run: in leagues that prohibit QB runs from scrimmage, the QB advancing the ball across the line of scrimmage with possession is illegal. Penalty: loss of down at the previous spot.',
 'flag_5v5', 'nfl_flag', 'seed',
 'Only enforced in leagues that prohibit QB runs.',
 false, true),

('global', null, 'rules', 'penalty_flag_guarding_v2',
 'NFL Flag 5v5 — Penalty: Flag guarding',
 'Flag guarding: ball carrier uses a hand, arm, or the ball to prevent a defender from pulling a flag. Penalty: 10 yards from the spot of the foul, loss of down. Common forms: arm-bar swat at the defender, hand placed over the flag, ball carried tight against the flag belt.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_diving_jumping',
 'NFL Flag 5v5 — Penalty: Diving / jumping / spinning by ball carrier',
 'Ball carrier may not dive, jump, leap, hurdle, or spin to advance the ball or avoid a defender. Penalty: 5 yards from the spot of the foul, loss of down. Spinning in place to redirect (without lowering the shoulder) may be allowed at the official''s discretion.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_charging_shoulder',
 'NFL Flag 5v5 — Penalty: Charging / lowering the shoulder',
 'Ball carrier lowers the shoulder, pads, or helmet and initiates contact with a defender. Penalty: 10 yards from the spot of the foul, loss of down. May be elevated to unsportsmanlike conduct if judged flagrant.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_stiff_arm',
 'NFL Flag 5v5 — Penalty: Stiff-arm',
 'Ball carrier extends an arm to push a defender away. Penalty: 5 yards from the spot of the foul, loss of down. Distinguishing from incidental contact is at the official''s discretion.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_screen_block',
 'NFL Flag 5v5 — Penalty: Illegal screen / pick',
 'Offensive players may not set picks or screen blocks to free a teammate. Penalty: 10 yards from the spot of the foul, loss of down. Includes routes that intentionally cross to obstruct a defender.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_offensive_pi',
 'NFL Flag 5v5 — Penalty: Offensive pass interference',
 'Offensive pass interference: receiver pushes off a defender or initiates a pick to free another receiver while the ball is in the air. Penalty: 10 yards from the line of scrimmage, loss of down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Snap-and-after, defense ───────────────────────────────────────
('global', null, 'rules', 'penalty_defensive_pi_v2',
 'NFL Flag 5v5 — Penalty: Defensive pass interference',
 'Defensive pass interference: defender contacts, pushes, or restricts a receiver beyond incidental contact while the ball is in the air. Penalty: spot foul (ball placed where the foul occurred) plus automatic first down. If foul occurs in the end zone, ball is placed at the 1-yard line.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_holding_defense',
 'NFL Flag 5v5 — Penalty: Defensive holding',
 'Defensive holding: defender grabs, holds, or restricts an offensive player when the ball is not in the air. Penalty: 10 yards from the line of scrimmage, automatic first down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_strip',
 'NFL Flag 5v5 — Penalty: Stripping the ball',
 'Defender swats at, slaps, or strips the ball from the ball carrier or receiver. Penalty: 10 yards from the spot of the foul, automatic first down. Possession remains with the offense.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_roughing_passer',
 'NFL Flag 5v5 — Penalty: Roughing the passer',
 'Defender pulls the QB''s flag during the throwing motion in a way judged unnecessary, contacts the QB''s arm, or hits the QB after the ball is released. Penalty: 10 yards from the line of scrimmage, automatic first down. Pass result still stands if completed.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_roughing_receiver',
 'NFL Flag 5v5 — Penalty: Roughing the receiver',
 'Defender contacts a receiver after the ball is clearly uncatchable, or hits a defenseless receiver attempting a catch. Penalty: 10 yards from the spot, automatic first down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_tackling',
 'NFL Flag 5v5 — Penalty: Tackling / illegal contact (defense)',
 'Defender tackles, holds, pushes, wraps, or otherwise stops the ball carrier with anything other than a flag pull. Penalty: 10 yards from the spot of the foul, automatic first down. Repeat or flagrant offenses may bring ejection.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Conduct & equipment ─────────────────────────────────────────
('global', null, 'rules', 'penalty_unsportsmanlike_v2',
 'NFL Flag 5v5 — Penalty: Unsportsmanlike conduct',
 'Unsportsmanlike conduct: taunting, trash talk, excessive celebration, throwing the ball at a player, arguing with officials. Penalty: 10 yards plus automatic first down (against defense). Two unsportsmanlike penalties on the same player = automatic ejection.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_fighting',
 'NFL Flag 5v5 — Penalty: Fighting',
 'Fighting: any swing, push, or aggressive physical act after a play. Penalty: automatic ejection plus 10 yards. Both fighters are typically ejected even if only one threw a punch.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_illegal_equipment',
 'NFL Flag 5v5 — Penalty: Illegal equipment',
 'Illegal equipment: jersey tucked over the flag belt, missing flags, illegal cleats, jewelry, or hard hair beads. Penalty: 5 yards plus the player must correct the equipment before re-entering. If discovered after a successful play, the result is wiped and a loss of down assessed.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_sideline_interference',
 'NFL Flag 5v5 — Penalty: Sideline interference',
 'A coach or substitute on the sideline interferes with a play (steps onto the field, makes contact with a player, blocks an official''s view). Penalty: 10 yards from the succeeding spot. Repeat offenses can bring coach ejection.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Reference / enforcement ──────────────────────────────────────
('global', null, 'rules', 'penalty_decline',
 'NFL Flag 5v5 — Declining a penalty',
 'The non-penalized team may always decline a penalty and take the result of the play instead. Common cases: offense declines a defensive offside if the play resulted in a long gain; defense declines an offensive holding if the play resulted in a turnover.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_offsetting',
 'NFL Flag 5v5 — Offsetting penalties',
 'When both teams commit penalties on the same play, the penalties offset and the down is replayed at the previous spot. Dead-ball fouls after the play do not offset prior live-ball fouls.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true);

-- Initial revisions for new rows.
insert into public.rag_document_revisions (
  document_id, revision_number,
  title, content, source, source_note,
  authoritative, needs_review,
  change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — penalties (drafted, awaiting admin verification)', null
from public.rag_documents d
where d.sport_variant = 'flag_5v5'
  and d.sanctioning_body = 'nfl_flag'
  and d.source = 'seed'
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
