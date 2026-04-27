-- Coach AI KB — Tackle 11-man penalties (shared, sanctioning_body=NULL).
-- Tackle football penalties are essentially uniform across Pop Warner, AYF,
-- NFHS — the rule books align. League-specific modifications (e.g. heads-up
-- contact ejection rules in youth) are tagged as separate chunks.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── Pre-snap ─────────────────────────────────────────────────────
('global', null, 'rules', 'penalty_false_start',
 'Tackle 11 — Penalty: False start',
 'False start: any movement by an offensive player after assuming a set position and before the snap that simulates the start of a play (lurching, head bob, hand twitch on the ground). Penalty: 5 yards from the line of scrimmage, replay the down. Dead-ball foul.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_offside',
 'Tackle 11 — Penalty: Offside',
 'Offside: defender lined up in or crossing the neutral zone at the snap (any part of the body in the neutral zone). Penalty: 5 yards from the line of scrimmage, replay the down. Live-ball foul — play continues.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_encroachment',
 'Tackle 11 — Penalty: Encroachment',
 'Encroachment: defender enters the neutral zone and contacts an offensive player before the snap, OR is in the neutral zone with an unabated path to the QB. Penalty: 5 yards from the line of scrimmage, dead-ball foul, replay the down.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_neutral_zone',
 'Tackle 11 — Penalty: Neutral zone infraction',
 'Defender enters the neutral zone and causes an offensive player to flinch (false start). Penalty: 5 yards on the defense (not the offense) from the line of scrimmage, dead ball, replay the down.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_illegal_motion',
 'Tackle 11 — Penalty: Illegal motion',
 'Illegal motion: more than one offensive player in motion at the snap, or motion player moving forward toward the line of scrimmage. Penalty: 5 yards from the line of scrimmage, replay the down.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_illegal_shift',
 'Tackle 11 — Penalty: Illegal shift',
 'Illegal shift: offensive players shift but fail to come to a complete stop (1-second pause) before the snap. Penalty: 5 yards from the line of scrimmage, replay the down.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_illegal_formation',
 'Tackle 11 — Penalty: Illegal formation',
 'Illegal formation: offense fails to have at least 7 players on the line of scrimmage, or has ineligible numbers in the wrong position. Penalty: 5 yards from the line of scrimmage, replay the down.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_delay_of_game',
 'Tackle 11 — Penalty: Delay of game',
 'Delay of game: failing to snap before the 25-second play clock expires. Penalty: 5 yards from the line of scrimmage, replay the down.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_too_many_men',
 'Tackle 11 — Penalty: Too many men on the field',
 'Twelve or more players on the field at the snap. Penalty: 5 yards from the line of scrimmage, replay the down.',
 'tackle_11', null, 'seed', null, true, false),

-- ── Offensive (snap and after) ───────────────────────────────────
('global', null, 'rules', 'penalty_holding_offense',
 'Tackle 11 — Penalty: Offensive holding',
 'Offensive holding: hooking, grabbing, or restraining a defender by means other than legal blocking technique. Penalty: 10 yards from the line of scrimmage (NFHS) or spot of the foul (NFL/college). Replay the down.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_illegal_block',
 'Tackle 11 — Penalty: Illegal block (in the back / clip)',
 'Block in the back: contact with the back of an opponent above the waist away from the action. Clip: contact with the back at or below the waist. Penalty: 10 yards (block in the back) or 15 yards (clip), enforced from the spot of the foul.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_chop_block',
 'Tackle 11 — Penalty: Chop block',
 'A high-low double-team (one blocker engages high, another engages at or below the thigh). Illegal at all levels for safety. Penalty: 15 yards from the line of scrimmage.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_offensive_pi',
 'Tackle 11 — Penalty: Offensive pass interference',
 'Offensive PI: receiver pushes off, picks, or initiates a rub on a defender while the ball is in the air. Penalty: 15 yards from the previous spot (NFHS) or 10 yards (NFL), loss of down.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_illegal_forward_pass',
 'Tackle 11 — Penalty: Illegal forward pass',
 'Forward pass thrown beyond the line of scrimmage, or a second forward pass on the same play. Penalty: 5 yards from the spot of the foul, loss of down.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_intentional_grounding',
 'Tackle 11 — Penalty: Intentional grounding',
 'QB throws away with no eligible receiver in the area while still inside the tackle box, intending only to avoid a sack. Penalty: 5 yards from the spot, loss of down (NFHS); spot of foul, loss of down (NFL).',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_ineligible_downfield',
 'Tackle 11 — Penalty: Ineligible receiver downfield',
 'A lineman (interior #50-79 in HS) advances more than 2-3 yards past the line of scrimmage on a passing play before the ball is thrown. Penalty: 5 yards from the line of scrimmage.',
 'tackle_11', null, 'seed', null, true, false),

-- ── Defensive (snap and after) ───────────────────────────────────
('global', null, 'rules', 'penalty_defensive_pi',
 'Tackle 11 — Penalty: Defensive pass interference',
 'Defensive PI: defender contacts, pushes, or restricts a receiver beyond an incidental level while the ball is in the air. Penalty: spot foul + automatic first down (NFL); 15 yards + automatic first down (NFHS).',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_holding_defense',
 'Tackle 11 — Penalty: Defensive holding',
 'Defender grabs or restricts an eligible receiver before the ball is in the air. Penalty: 5 yards (NFL) or 10 yards (NFHS), automatic first down.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_facemask',
 'Tackle 11 — Penalty: Facemask',
 'A defender (or any player) grasps the facemask of an opponent. Penalty: 15 yards from the spot of the foul, automatic first down if against the defense. May be elevated to personal foul if the grasp is twisted/turned violently.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_horse_collar',
 'Tackle 11 — Penalty: Horse-collar tackle',
 'Tackler grabs the inside collar of the shoulder pads or jersey from behind and pulls the runner down. Penalty: 15 yards from the spot of the foul, automatic first down.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_targeting',
 'Tackle 11 — Penalty: Targeting',
 'Forcible contact to the head or neck area of a defenseless player, or leading with the helmet (spearing). Penalty: 15 yards from the spot of the foul, automatic first down. In NFHS and college: automatic ejection. Heavily emphasized in youth football for safety.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_roughing_passer',
 'Tackle 11 — Penalty: Roughing the passer',
 'Late hit on the QB after the ball is released; hits below the knee or above the shoulders. Penalty: 15 yards from the line of scrimmage, automatic first down.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_roughing_kicker',
 'Tackle 11 — Penalty: Roughing the kicker / holder',
 'Defender contacts the kicker''s plant leg or the holder after the kick, beyond incidental contact. Penalty: 15 yards from the line of scrimmage, automatic first down. Running into the kicker (lighter contact) = 5 yards.',
 'tackle_11', null, 'seed', null, true, false),

-- ── Conduct ──────────────────────────────────────────────────────
('global', null, 'rules', 'penalty_unsportsmanlike',
 'Tackle 11 — Penalty: Unsportsmanlike conduct',
 'Taunting, baiting, profanity, excessive celebration, removal of helmet on the field, throwing the ball at an opponent. Penalty: 15 yards from the succeeding spot. Two unsportsmanlike fouls on the same player = automatic ejection.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_personal_foul',
 'Tackle 11 — Penalty: Personal foul',
 'Late hit, unnecessary roughness, hitting a player out of bounds, hitting a defenseless receiver. Penalty: 15 yards from the spot of the foul, automatic first down (vs defense).',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_fighting',
 'Tackle 11 — Penalty: Fighting',
 'Any swing, push, or aggressive physical act after a play. Penalty: automatic ejection plus 15 yards. Both fighters typically ejected.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_substitution',
 'Tackle 11 — Penalty: Illegal substitution',
 'Substituting after the ball is set, or 12+ players in formation. Penalty: 5 yards, replay the down.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_decline',
 'Tackle 11 — Declining a penalty',
 'The non-penalized team may decline any penalty and take the play result. Common cases: offense declines defensive offside on a long completion; defense declines offensive holding on a turnover.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_offsetting',
 'Tackle 11 — Offsetting penalties',
 'Penalties on both teams during the same down typically offset, and the down is replayed at the previous spot. Dead-ball fouls after the play do not offset live-ball fouls.',
 'tackle_11', null, 'seed', null, true, false);

-- Initial revisions.
insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — tackle 11 shared penalties (drafted, beta authoritative)', null
from public.rag_documents d
where d.sport_variant = 'tackle_11'
  and d.sanctioning_body is null
  and d.source = 'seed'
  and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
