-- Coach AI KB — NFL Flag 5v5 deep expansion (v2).
--
-- Adds ~40 new chunks on top of 0116 to cover penalties detail, eligibility,
-- snap mechanics, overtime, equipment, officiating, and edge cases. All rows
-- remain authoritative=false / needs_review=true. Conservative phrasing —
-- where league/division varies the chunk says so explicitly.

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body,
  source, source_note,
  authoritative, needs_review
) values

-- ── Field markings & layout ────────────────────────────────────────
('global', null, 'rules', 'field_markings',
 'NFL Flag 5v5 — Field markings and zones',
 'The field is split into two equal 25-yard zones by the midfield line (the line to gain). Each end zone is 10 yards deep. No-run zones sit at the 5-yard line in front of each end zone and at the 5 yards on either side of the midfield line. Cones typically mark zone boundaries when permanent lines are absent (e.g. on grass overlay fields).',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'sidelines',
 'NFL Flag 5v5 — Sidelines and team area',
 'Players, coaches, and substitutes must remain in the designated team area between the 25-yard lines (or whatever boundary the league prescribes) on their sideline. Stepping out of the team area to coach or signal can draw a sideline-interference or sportsmanship penalty.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Coin toss & possession ────────────────────────────────────────
('global', null, 'rules', 'coin_toss',
 'NFL Flag 5v5 — Coin toss and start of play',
 'A coin toss before the game determines first possession. The winner chooses to take the ball, defer to the second half, or pick a direction. The losing captain gets the remaining choice. Possession alternates to start the second half. The team with possession starts on their own 5-yard line (or designated start spot) — there are no kickoffs.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'start_after_score',
 'NFL Flag 5v5 — Possession after a score',
 'After any score the ball changes possession. The team scored upon takes over at their own 5-yard line (or designated start spot) — there are no kickoffs or onside attempts. After a safety the team scored upon also starts at their own 5.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Snap mechanics & QB rules ─────────────────────────────────────
('global', null, 'rules', 'snap_mechanics',
 'NFL Flag 5v5 — Snap mechanics',
 'The center snaps the ball — between the legs or to the side — to start the play. A muffed snap is a live ball; if it hits the ground it''s a dead ball at the spot. The center is an eligible receiver and may release downfield immediately after the snap.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'qb_run_restriction',
 'NFL Flag 5v5 — Quarterback run restriction',
 'In standard NFL Flag 5v5 the quarterback may not run with the ball across the line of scrimmage. The QB may scramble behind the line and throw, but must hand off, pitch, or pass before crossing the line. This restriction is league-defined; some recreational leagues allow QB runs.',
 'flag_5v5', 'nfl_flag', 'seed',
 'NFL Flag national rules prohibit QB runs from scrimmage; verify against the latest rulebook.',
 false, true),

('global', null, 'rules', 'qb_sack',
 'NFL Flag 5v5 — Sacks and behind-the-line flag pulls',
 'If a defender pulls the QB''s flag behind the line of scrimmage before the ball is released, the result is a sack — the play ends and the ball is spotted where the flag was pulled. There is no negative-yardage limit; a sack on 4th down with no first down still results in turnover on downs.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Receiving & catches ───────────────────────────────────────────
('global', null, 'rules', 'eligibility',
 'NFL Flag 5v5 — Receiver eligibility',
 'All offensive players are eligible to receive a forward pass, including the center. Only one forward pass is allowed per play, and it must be thrown from behind the line of scrimmage. Backward passes (laterals) are unlimited and may occur anywhere on the field.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'completion',
 'NFL Flag 5v5 — Catch / completion',
 'A completion requires the receiver to gain control of the ball with at least one foot in bounds. A receiver pushed out of bounds before they can land may be ruled a completion at the official''s discretion. A pass that touches the ground before being secured is incomplete.',
 'flag_5v5', 'nfl_flag', 'seed',
 'Foot count (one vs two inbounds) varies; NFL Flag national rules typically require one foot.',
 false, true),

('global', null, 'rules', 'simultaneous_catch',
 'NFL Flag 5v5 — Simultaneous catch',
 'If an offensive and defensive player gain joint possession of a forward pass at the same time, possession is awarded to the offense.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Handoffs, pitches, laterals ───────────────────────────────────
('global', null, 'rules', 'handoffs',
 'NFL Flag 5v5 — Handoffs and pitches',
 'Handoffs may be forward or backward, in front of or behind the line of scrimmage. Multiple handoffs per play are allowed. Pitches and laterals (backward passes) are unlimited. Once any handoff or pitch is completed, the 7-second pass clock no longer applies.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'forward_pass_after_handoff',
 'NFL Flag 5v5 — Forward pass after handoff',
 'A forward pass is allowed after a handoff or pitch, provided (1) the passer is still behind the line of scrimmage when the pass is thrown, and (2) the original snap-to-throw 7-second clock has not expired. Throwing a forward pass from beyond the line of scrimmage is illegal forward pass — 5 yards from the spot, loss of down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Fumbles & turnovers ───────────────────────────────────────────
('global', null, 'rules', 'fumbles',
 'NFL Flag 5v5 — Fumbles',
 'Fumbles are dead at the spot. The team that fumbled retains possession at the spot of the fumble — a fumble is not a turnover. If a snap hits the ground, the play is dead at the spot of the fumble and counts as a down. There are no live-ball fumble recoveries.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'muffed_snap',
 'NFL Flag 5v5 — Muffed snap',
 'A snap that hits the ground without being controlled is a dead ball at the spot. The down counts. If the muff occurs in the end zone on offense, it is a safety.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Defense detail ────────────────────────────────────────────────
('global', null, 'rules', 'rush_marker',
 'NFL Flag 5v5 — Rush marker',
 'The 7-yard rush line is marked by a cone, line, or designated official. Defenders rushing the QB must clearly start behind this marker at the snap. A rusher who lines up inside the marker — or crosses it before the snap — commits illegal rush.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'rush_after_handoff',
 'NFL Flag 5v5 — Defenders crossing the line',
 'Non-rushing defenders may not cross the line of scrimmage until the ball has been handed off, pitched, or thrown. Crossing early is offside / illegal rush — 5 yards from the line of scrimmage, replay the down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'flag_pull_legal',
 'NFL Flag 5v5 — Legal flag pull',
 'A defender may pull either flag from the ball carrier''s belt to end the play. The defender must make a play at the flag — diving at the legs, pushing, or wrapping the runner is a penalty even if the flag is pulled.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'flag_pull_before_catch',
 'NFL Flag 5v5 — Flag pull before catch',
 'Pulling a receiver''s flag before they catch the ball is defensive holding or pass interference, depending on contact level — 10 yards and automatic first down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'inadvertent_flag_loss',
 'NFL Flag 5v5 — Inadvertent flag loss',
 'If a ball carrier loses a flag without being pulled (e.g., the belt falls off), they are down at the spot of the flag loss. A one-flag deduction does not end the play unless league rules say otherwise — verify with the local rulebook.',
 'flag_5v5', 'nfl_flag', 'seed',
 'Some leagues end the play on any flag loss; others only on flag pulls.',
 false, true),

-- ── Extra penalties ───────────────────────────────────────────────
('global', null, 'rules', 'penalty_delay_of_game',
 'NFL Flag 5v5 — Delay of game',
 'A play clock (typically 25 or 30 seconds) runs between plays. If the offense fails to snap before it expires, a delay-of-game penalty is assessed: 5 yards from the line of scrimmage, replay the down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_flag_guarding',
 'NFL Flag 5v5 — Flag guarding',
 'A ball carrier may not use a hand, arm, or the ball itself to prevent a defender from pulling a flag. Common forms: arm down to swat at a defender''s hand, hand placed over the flag, ball carried low against the flag belt. Penalty: 10 yards from the spot of the foul, loss of down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_illegal_contact',
 'NFL Flag 5v5 — Illegal contact (offense)',
 'Offensive players may not initiate contact with defenders. Picks, screens, blocks, stiff-arms, and lowering the shoulder are all illegal contact. Penalty: 10 yards from the spot of the foul, loss of down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_dpi',
 'NFL Flag 5v5 — Defensive pass interference',
 'A defender may not contact, push, or restrict a receiver attempting to catch a pass beyond an incidental level. Penalty: spot foul (ball placed at the spot of the foul) plus automatic first down. If the foul occurs in the end zone, the ball is placed at the 1-yard line.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_opi',
 'NFL Flag 5v5 — Offensive pass interference',
 'A receiver may not push off a defender or initiate a pick or rub route designed to free another receiver. Penalty: 10 yards from the line of scrimmage, loss of down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_unsportsmanlike',
 'NFL Flag 5v5 — Unsportsmanlike conduct',
 'Taunting, trash talk, excessive celebration, arguing with officials, or aggressive behavior toward opponents draws an unsportsmanlike-conduct penalty: 10 yards plus automatic first down (if against defense). Two unsportsmanlike penalties on the same player is an automatic ejection.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_personal_foul',
 'NFL Flag 5v5 — Personal fouls',
 'Any contact judged dangerous — pushing a player out of bounds late, hitting a defenseless receiver, late hits, fighting — is a personal foul: 10 yards plus automatic first down (if against defense). Repeat offenses may bring ejection.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'penalty_enforcement',
 'NFL Flag 5v5 — Penalty enforcement basics',
 'Most penalties are enforced from the previous spot (line of scrimmage). Spot fouls (defensive PI, flag guarding) are enforced from the spot of the foul. Half-the-distance-to-the-goal applies when a penalty would otherwise place the ball more than half the remaining distance into the end zone or beyond. The non-penalized team may always decline a penalty.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'dead_ball_fouls',
 'NFL Flag 5v5 — Dead-ball fouls',
 'Penalties committed after the play ends (taunting, late contact, unsportsmanlike) are dead-ball fouls and assessed from the succeeding spot — they do not negate yardage gained on the play.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Equipment ────────────────────────────────────────────────────
('global', null, 'rules', 'equipment_flag_belt',
 'NFL Flag 5v5 — Flag belt requirements',
 'Each player wears a flag belt with two flags hanging from opposite hips (some leagues require three flags). Belts must be worn over the jersey with flags clearly visible — tucking the jersey over the flag belt is a penalty (illegal equipment, 5 yards plus loss of down if discovered after a successful play).',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'equipment_mouthguard',
 'NFL Flag 5v5 — Mouthguard',
 'Mouthguards are required in many sanctioned leagues. A player without a mouthguard at the snap may be flagged for illegal equipment (5 yards) or asked to leave the field until equipped, depending on league rules.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'equipment_cleats_jewelry',
 'NFL Flag 5v5 — Cleats and jewelry',
 'Soft, rubber, or molded plastic cleats are allowed. Metal spikes are prohibited. All jewelry — watches, earrings, chains, hard hair beads — must be removed before play. Medical alert tags must be taped down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Game management ─────────────────────────────────────────────
('global', null, 'rules', 'timeouts',
 'NFL Flag 5v5 — Timeouts',
 'Each team typically gets one to two timeouts per half. A timeout is 60 seconds long. Unused timeouts do not carry over from first half to second half. Officials may call additional timeouts for injury or game management — those do not count against either team.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'two_minute_warning',
 'NFL Flag 5v5 — Two-minute warning and clock',
 'In the final two minutes of each half, the clock stops on incomplete passes, out-of-bounds, change of possession, scores, timeouts, and penalties. Outside of the two-minute period, a running clock is standard. The two-minute warning is itself an automatic stoppage.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'mercy_rule',
 'NFL Flag 5v5 — Mercy rule',
 'Many leagues use a mercy rule: when one team leads by a large margin in the second half (commonly 28+ points), the clock runs continuously regardless of incompletions, out-of-bounds, or scores. Some leagues end the game outright on mercy.',
 'flag_5v5', 'nfl_flag', 'seed',
 'Threshold and effect vary by league.',
 false, true),

('global', null, 'rules', 'forfeit',
 'NFL Flag 5v5 — Forfeit',
 'A team that cannot field the minimum number of players (commonly 4) by the official kickoff time forfeits. Forfeit scores are commonly recorded as a set value (e.g. 14-0) per league bylaws.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Overtime detail ─────────────────────────────────────────────
('global', null, 'rules', 'overtime_format',
 'NFL Flag 5v5 — Overtime shootout format',
 'A common playoff overtime: each team gets one possession from the 5-yard line. They may attempt 1 point (from the 5) or 2 points (from the 10). After both teams complete a possession, the team ahead wins. If still tied, another round is played. Defense may return an interception for the same point value (1 or 2).',
 'flag_5v5', 'nfl_flag', 'seed',
 'Overtime format varies; verify the league/tournament bracket.',
 false, true),

('global', null, 'rules', 'overtime_regular_season',
 'NFL Flag 5v5 — Regular-season overtime',
 'Regular-season games may end in a tie depending on the league. Some leagues play one shootout round to break a tie; others record the tie. Standings tiebreakers (head-to-head, point differential capped per game) typically appear in league bylaws.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Officiating ─────────────────────────────────────────────────
('global', null, 'rules', 'officials',
 'NFL Flag 5v5 — Officials and crew',
 'A typical crew is two officials: a referee (lined up behind the QB) and a downfield judge. Calls are final on the field — there are no instant-replay reviews. Coaches may request a rule clarification but not a judgment-call review.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'spot_of_ball',
 'NFL Flag 5v5 — Spot of the ball',
 'The ball is spotted where the ball carrier''s flag is pulled (not where the runner''s feet were). On out-of-bounds, the ball is spotted where the runner''s body crosses the sideline. On an incompletion, the ball returns to the previous spot.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Misc / edge cases ───────────────────────────────────────────
('global', null, 'rules', 'spike',
 'NFL Flag 5v5 — Spike to stop the clock',
 'The QB may spike the ball immediately after the snap to stop the clock. The spike is treated as an intentional incomplete pass and counts as a down. Spiking after a handoff or scramble is not allowed.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'kneel_down',
 'NFL Flag 5v5 — Kneel down',
 'A QB may kneel to end a play and run clock; the play ends at the spot the knee touches. A kneel counts as a down. Some leagues prohibit kneels in mercy-rule situations to avoid running up the clock unsportingly.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'safety_specifics',
 'NFL Flag 5v5 — When a safety is awarded',
 'A safety (2 points to the defense) is awarded when: the ball carrier''s flag is pulled in their own end zone, an offensive penalty is enforced from inside their own end zone, the snap or fumble goes out the back of the end zone, or the QB is sacked in their own end zone.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'turnover_on_downs_spot',
 'NFL Flag 5v5 — Turnover on downs spot',
 'When a team fails to gain a first down or score, the opposing team takes possession at the dead-ball spot — not the line of scrimmage. There are no punts, so a 4th-down stop deep in opponent territory often results in a short field for the defense.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'multiple_motion',
 'NFL Flag 5v5 — Multiple players in motion',
 'Only one offensive player may be in motion at the snap. Multiple players moving simultaneously, or a motion player moving toward the line of scrimmage, is illegal motion: 5 yards, replay the down.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'rules', 'illegal_formation',
 'NFL Flag 5v5 — Illegal formation',
 'The offense must have a snapper at the ball. Some leagues require a minimum number of players on the line of scrimmage; others do not. Illegal formation: 5 yards, replay the down.',
 'flag_5v5', 'nfl_flag', 'seed',
 'On-line requirements vary; many NFL Flag rule sets are open formation.',
 false, true);

-- Initial revisions for the new rows.
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
  'create', 'Initial seed v2 expansion (drafted, awaiting admin verification)', null
from public.rag_documents d
where d.sport_variant = 'flag_5v5'
  and d.sanctioning_body = 'nfl_flag'
  and d.source = 'seed'
  and not exists (
    select 1 from public.rag_document_revisions r where r.document_id = d.id
  );
