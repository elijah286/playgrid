-- Coach AI KB — NFHS rules v2 (dedupe + expansion).
-- NFHS = National Federation of State High School Associations rule book.
-- Used by virtually all US public high school football. State associations
-- can modify on top (e.g. mercy rule thresholds, OT rules).

-- ── Dedupe existing NFHS rows ────────────────────────────────────
update public.rag_documents r
   set retired_at = now()
  where r.sport_variant = 'tackle_11'
    and r.sanctioning_body = 'nfhs'
    and r.source = 'seed'
    and r.retired_at is null
    and exists (
      select 1 from public.rag_documents older
       where older.sport_variant = r.sport_variant
         and older.sanctioning_body = r.sanctioning_body
         and older.source = 'seed'
         and older.subtopic = r.subtopic
         and older.title = r.title
         and older.retired_at is null
         and older.created_at < r.created_at
    );

-- ── NFHS v2 expansion ────────────────────────────────────────────
insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

('global', null, 'rules', 'rulebook_authority',
 'NFHS — Rule book authority',
 'NFHS publishes the football rule book used by virtually every US public high school. State athletic associations may add modifications (e.g. mercy rules, OT format, classification-specific game length) but cannot override safety rules. The current rule book year applies — coaches should buy the annual edition each summer.',
 'tackle_11', 'nfhs', 'seed',
 'Always reference current-year NFHS rule book; state association overlays apply.',
 true, false),

('global', null, 'rules', 'game_length_nfhs',
 'NFHS — Game length and quarters',
 'Standard: four 12-minute quarters. Some state associations use 10- or 11-minute quarters at sub-varsity (JV, freshman). Halftime is 15 minutes (states may shorten to 10). Clock stops on incomplete pass, out of bounds, change of possession, score, and penalty enforcement.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'mercy_rule_nfhs',
 'NFHS — Mercy / running clock rules',
 'NFHS itself doesn''t mandate a mercy rule, but most state associations adopt one. Common form: when point differential reaches 35-40+ in the second half, the clock runs continuously except for scores, timeouts, and injuries. Verify against state rule.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'overtime_nfhs',
 'NFHS — Overtime format',
 'Kansas-style: each team gets a possession from the 10-yard line, 4 downs to score. After both teams have a possession, if tied, another round is played. Some states require 2-point conversion attempts after the second OT. Tie remains possible in the regular season per state rule.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'targeting_nfhs',
 'NFHS — Targeting rule',
 'Forcible contact to the head/neck of a defenseless player, or initiating contact with the crown of the helmet. Penalty: 15 yards. NFHS DOES NOT include automatic ejection (unlike NCAA), but state associations and individual officials may eject for flagrant fouls. Heavy emphasis on protecting the defenseless player.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'horse_collar_nfhs',
 'NFHS — Horse-collar tackle',
 'Tackler grabs the inside collar of the shoulder pads or jersey from behind and pulls the runner down. Penalty: 15 yards, automatic first down. Personal foul.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'spearing_nfhs',
 'NFHS — Spearing / butt-blocking',
 'Initiating contact with the top of the helmet, or driving the helmet into an opponent. Penalty: 15 yards, personal foul. Repeat or flagrant offenses can result in ejection at official''s discretion.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'blocking_below_waist_nfhs',
 'NFHS — Blocking below the waist restrictions',
 'Blocks below the waist are restricted: legal only in the free-blocking zone (4 yards on each side of the ball, 3 yards on each side of the LOS) and only on linemen at the snap. Outside the zone or after the play has moved away — illegal. Penalty: 15 yards.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'snap_nfhs',
 'NFHS — Snap mechanics',
 'Snapper may have the ball off the ground in shotgun. Snap must move the ball quickly in one motion. False start by snapper if any movement before the snap. The ball must cross the plane of the LOS for a legal snap.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'eligibility_nfhs',
 'NFHS — Receiver eligibility numbers',
 'Eligible numbers: 1-49 and 80-99. Ineligible: 50-79 (interior linemen). An ineligible-numbered player cannot legally catch a forward pass beyond the LOS. Numbers must be on the front and back of the jersey, minimum 8 inches and 10 inches respectively.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'two_point_nfhs',
 'NFHS — Two-point conversion',
 'After a TD: 1 point by kick, 2 points by run/pass, also 2 points by defensive return of a try (NFHS adopted this in 2014). Try is run from the 3-yard line.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'kickoff_nfhs',
 'NFHS — Kickoff and onside kicks',
 'Kickoff from the 40-yard line. Touchback brings the ball to the 20. Onside kick must travel 10 yards (or be touched by receiving team) to be recoverable by kicking team. Free-kick rules apply — receiving team gets a 5-yard halo around the returner.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'punts_nfhs',
 'NFHS — Punt rules',
 'Punt receiver entitled to a 2-yard cushion from coverage team for a fair catch. Roughing the kicker = 15 yards + automatic first down; running into = 5 yards. Long snapper may not be contacted for 1 second after the snap on scrimmage kicks.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'pass_interference_nfhs',
 'NFHS — Pass interference detail',
 'DPI: 15 yards from the previous spot, automatic first down. OPI: 15 yards from the previous spot, NO loss of down (different from NFL). Contact must be more than incidental — the receiver and defender both have a right to play the ball.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'roughing_passer_nfhs',
 'NFHS — Roughing the passer detail',
 'Late hit on the QB after release, hit to the head/neck, or hit below the knees on the planted leg. Penalty: 15 yards from the LOS, automatic first down. NFHS protects passing posture even more conservatively than NFL — emphasize getting off the QB.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'face_mask_nfhs',
 'NFHS — Face mask rule',
 'Grasping the face mask, helmet opening, or chin strap. Penalty: 15 yards from spot, automatic first down vs defense. NFHS does NOT distinguish "incidental" — any grasp is a foul.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'concussion_nfhs',
 'NFHS — Concussion management',
 'Any player exhibiting concussion signs/symptoms must be removed and cannot return to play that day without written clearance from a healthcare provider trained in concussion management. State Return-To-Play (RTP) laws apply on top — typically a 5-step graduated return spanning at least 5 days.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'equipment_nfhs',
 'NFHS — Required equipment',
 'NOCSAE-certified helmet (chin strap fastened, four snaps), shoulder pads, hip pads, thigh pads, knee pads, mouth guard (colored, not clear), athletic supporter. Tooth/lip protectors recommended. Pre-game inspection by officials.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'jersey_nfhs',
 'NFHS — Jersey rules',
 'Visiting team wears white jerseys; home team wears dark. Numbers must contrast with the body of the jersey. Names optional but if used must be on the back. Tucked-in jerseys required (varies by state) — pads must be covered.',
 'tackle_11', 'nfhs', 'seed', null, true, false),

('global', null, 'rules', 'state_modifications',
 'NFHS — State association modifications',
 'States can modify NFHS rules within limits. Common modifications: game length at sub-varsity, mercy/running-clock thresholds, OT format extensions, classification-specific equipment requirements. Coaches must check state athletic association handbook each summer alongside NFHS.',
 'tackle_11', 'nfhs', 'seed', null, true, false);

-- Initial revisions for new rows.
insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed v2 expansion (NFHS, dedupe + 20 new chunks)', null
from public.rag_documents d
where d.sport_variant = 'tackle_11'
  and d.sanctioning_body = 'nfhs'
  and d.source = 'seed'
  and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
