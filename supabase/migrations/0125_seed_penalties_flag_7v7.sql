-- Coach AI KB — Flag 7v7 penalties (granular, passing-only context).

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body,
  source, source_note,
  authoritative, needs_review
) values

('global', null, 'rules', 'penalty_false_start',
 'Flag 7v7 — Penalty: False start',
 'Movement by an offensive player after taking a set position and before the snap. 5 yards, replay the down. Dead-ball foul.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_illegal_motion',
 'Flag 7v7 — Penalty: Illegal motion',
 'More than one offensive player in motion at the snap, or motion player moving toward the line of scrimmage. 5 yards, replay the down.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_delay_of_game',
 'Flag 7v7 — Penalty: Delay of game',
 'Failing to snap before the play clock expires (typically 25 seconds). 5 yards, replay the down.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_offside',
 'Flag 7v7 — Penalty: Offside (defense)',
 'Defender lined up in or crossing the neutral zone at the snap. 5 yards, replay the down. Play continues — offense may decline.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_illegal_forward_pass',
 'Flag 7v7 — Penalty: Illegal forward pass',
 'Forward pass thrown from beyond the line of scrimmage, second forward pass on the same play, or pass after a change of possession. 5 yards from the spot, loss of down.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_intentional_grounding',
 'Flag 7v7 — Penalty: Intentional grounding',
 'QB throws away with no eligible receiver in the area while the count is still running. 5 yards from the spot, loss of down.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_count_violation',
 'Flag 7v7 — Penalty: Pass count violation',
 'QB still holding the ball at the end of the count (typically 4 seconds). Ball is dead at the line of scrimmage; the down counts. Not a yardage penalty — the play simply ends.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_qb_run',
 'Flag 7v7 — Penalty: QB advance past line',
 'QB carries the ball across the line of scrimmage. In passing-only 7v7 this is illegal — typically loss of down at the previous spot.',
 'flag_7v7', null, 'seed',
 'Some recreational 7v7 leagues allow QB scrambles; verify.', false, true),

('global', null, 'rules', 'penalty_flag_guarding',
 'Flag 7v7 — Penalty: Flag guarding',
 'Ball carrier uses hand, arm, or the ball itself to prevent a flag pull. 10 yards from the spot of the foul, loss of down.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_diving',
 'Flag 7v7 — Penalty: Diving / jumping / spinning',
 'Ball carrier dives, hurdles, leaps, or spins to advance or avoid a defender. 5 yards from the spot, loss of down.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_charging',
 'Flag 7v7 — Penalty: Charging / lowering the shoulder',
 'Ball carrier lowers shoulder/helmet and initiates contact. 10 yards from the spot, loss of down. May be elevated to unsportsmanlike if flagrant.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_screen_pick',
 'Flag 7v7 — Penalty: Illegal screen / pick',
 'Offensive player sets a pick or screen block to free a teammate. 10 yards from the spot, loss of down.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_offensive_pi',
 'Flag 7v7 — Penalty: Offensive pass interference',
 'Receiver pushes off or initiates a pick while the ball is in the air. 10 yards from the line of scrimmage, loss of down.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_defensive_pi',
 'Flag 7v7 — Penalty: Defensive pass interference',
 'Defender contacts, pushes, or restricts a receiver beyond incidental contact while the ball is in the air. Spot foul + automatic first down. End-zone fouls placed at the 1-yard line.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_holding_def',
 'Flag 7v7 — Penalty: Defensive holding',
 'Defender grabs/restricts a receiver when the ball is not in the air. 10 yards from the line of scrimmage, automatic first down.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_strip',
 'Flag 7v7 — Penalty: Stripping the ball',
 'Defender slaps or strips the ball from a receiver/ball carrier. 10 yards from the spot, automatic first down. Possession remains with the offense.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_tackling',
 'Flag 7v7 — Penalty: Tackling / illegal contact',
 'Defender wraps, tackles, or makes contact beyond a flag pull. 10 yards from the spot, automatic first down.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_unsportsmanlike',
 'Flag 7v7 — Penalty: Unsportsmanlike conduct',
 'Taunting, trash talk, excessive celebration, arguing with officials. 10 yards plus automatic first down (vs defense). Two on the same player = ejection.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_personal_foul',
 'Flag 7v7 — Penalty: Personal foul',
 'Late hit, hitting a defenseless receiver, fighting. 10 yards plus automatic first down. Repeat or flagrant offenses bring ejection.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'penalty_illegal_sub',
 'Flag 7v7 — Penalty: Illegal substitution',
 'Substituting after the ball is set, or having too many players on the field at the snap. 5 yards, replay the down.',
 'flag_7v7', null, 'seed', null, false, true);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — 7v7 penalties (drafted, awaiting admin verification)', null
from public.rag_documents d
where d.sport_variant = 'flag_7v7'
  and d.source = 'seed'
  and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
