-- Coach AI KB — Flag 4v4 penalties.
-- 4v4 flag is a tight, small-field format. Penalties largely mirror 5v5 with
-- faster cadence and tighter spacing.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

('global', null, 'rules', 'penalty_false_start',
 'Flag 4v4 — Penalty: False start',
 'Offensive player movement after the set. Penalty: 5 yards, replay the down. Dead ball.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_offside',
 'Flag 4v4 — Penalty: Offside',
 'Defender across the LOS at snap. Penalty: 5 yards, replay the down. Live ball — play continues.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_delay_of_game',
 'Flag 4v4 — Penalty: Delay of game',
 'Failure to snap before the play clock expires (typically 25 seconds). Penalty: 5 yards, replay the down.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_illegal_motion',
 'Flag 4v4 — Penalty: Illegal motion',
 'More than one offensive player in motion at the snap, or motion player moving forward. Penalty: 5 yards, replay the down.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_illegal_formation',
 'Flag 4v4 — Penalty: Illegal formation',
 'Fewer than required players on the LOS at the snap (varies by ruleset). Penalty: 5 yards, replay the down.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_illegal_rush',
 'Flag 4v4 — Penalty: Illegal rush',
 'Defender rushes from inside the rusher line (typically 7 yards), or no designated rusher when rush is permitted. Penalty: 5 yards from LOS, automatic first down. Many 4v4 leagues are NO-RUSH — verify rule set.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_pass_interference_offense',
 'Flag 4v4 — Penalty: Offensive pass interference',
 'Pick play, push-off, or contact initiated by the receiver while the ball is in the air. Penalty: 10 yards from previous spot, loss of down.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_pass_interference_defense',
 'Flag 4v4 — Penalty: Defensive pass interference',
 'Defender impedes a receiver beyond incidental contact while the ball is in the air. Penalty: spot foul, automatic first down.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_flag_guarding',
 'Flag 4v4 — Penalty: Flag guarding',
 'Ball-carrier uses arm/hand/ball to block defender''s access to the flag. Penalty: 5 or 10 yards (verify ruleset) from spot of foul. Most-flagged offensive penalty in flag.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_diving',
 'Flag 4v4 — Penalty: Diving / jumping',
 'Ball-carrier dives or hurdles to gain yards or avoid a defender. Penalty: 5 yards from spot of foul, dead ball at spot of dive. Safety rule.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_charging',
 'Flag 4v4 — Penalty: Charging',
 'Ball-carrier initiates contact with defender (lowering shoulder, running through). Penalty: 10 yards, loss of down.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_stiff_arm',
 'Flag 4v4 — Penalty: Stiff-arm',
 'Ball-carrier extends arm to ward off defender. Penalty: 10 yards from spot, dead ball.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_holding_defense',
 'Flag 4v4 — Penalty: Defensive holding',
 'Defender grabs jersey, body, or arm of an eligible receiver before the ball is in the air. Penalty: 5 yards, automatic first down.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_strip',
 'Flag 4v4 — Penalty: Stripping the ball',
 'Defender strikes or grabs the ball from the carrier. Penalty: 10 yards from spot, automatic first down. Ball stays with offense.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_tackling',
 'Flag 4v4 — Penalty: Tackling / wrap-up',
 'Defender grabs the carrier''s body to bring them down rather than pulling the flag. Penalty: 10 yards from spot, automatic first down. Repeated offenses can lead to ejection.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_unsportsmanlike',
 'Flag 4v4 — Penalty: Unsportsmanlike conduct',
 'Taunting, profanity, arguing with officials, excessive celebration. Penalty: 10 yards from succeeding spot. Two unsportsmanlike fouls = automatic ejection.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_decline',
 'Flag 4v4 — Declining a penalty',
 'Offended team may decline a penalty and take the play result. Common: decline offside on a long completion.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_offsetting',
 'Flag 4v4 — Offsetting penalties',
 'Penalties on both teams during the same down typically offset and the down is replayed.',
 'flag_4v4', null, 'seed', null, true, false);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — flag 4v4 penalties (drafted, beta authoritative)', null
from public.rag_documents d
where d.sport_variant = 'flag_4v4' and d.topic = 'rules' and d.subtopic like 'penalty_%'
  and d.source = 'seed' and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
