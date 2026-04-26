-- Seed Coach AI knowledge base with NFHS (high school) tackle football rules.
--
-- NFHS publishes the rulebook used by ~48 US states for high school football.
-- Texas and Massachusetts use modified NCAA-based rules. This seed covers
-- the NFHS baseline; state-specific deltas should be added as separate
-- documents later.
--
-- All rows authoritative=false / needs_review=true. NFHS publishes annual
-- updates; site admin should verify against the current edition.

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body, game_level,
  source, source_note,
  authoritative, needs_review
) values

('global', null,
 'rules', 'overview',
 'NFHS — Rulebook overview',
 'The NFHS Football Rules Book is the standard for US high school football, used by approximately 48 state associations. Texas (UIL) and Massachusetts use NCAA-based modifications. The NFHS book differs from NCAA in clock management, blocking below the waist rules, and several penalty enforcements.',
 'tackle_11', 'nfhs', 'high_school', 'seed',
 'Texas and Massachusetts deltas not yet seeded.',
 false, true),

('global', null,
 'rules', 'field',
 'NFHS — Field dimensions',
 'Field is 100 yards long with two 10-yard end zones, 53 1/3 yards wide. Hash marks are 53 1/3 feet from each sideline (NFHS hashes are wider apart than NCAA/NFL). Goal posts are 23 feet 4 inches wide.',
 'tackle_11', 'nfhs', 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'players',
 'NFHS — Players on field',
 '11 players per side. Offense must have 7 players on the line of scrimmage at the snap; backs must be at least 1 yard behind the line. Eligible receivers are the two players at the end of the offensive line, plus all players in the backfield.',
 'tackle_11', 'nfhs', 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'game_length',
 'NFHS — Game length and clock',
 'Four 12-minute quarters. Halftime is up to 20 minutes (often 15). Mercy-rule clocks (running clock once a team leads by 35+ in the second half) are state-specific. Each team gets 3 timeouts per half. The play clock is 40 seconds (or 25 seconds after stoppages).',
 'tackle_11', 'nfhs', 'high_school', 'seed',
 'Mercy-rule thresholds vary by state association.',
 false, true),

('global', null,
 'rules', 'scoring',
 'NFHS — Scoring',
 'TD = 6, kicked PAT = 1, run/pass PAT (try) from the 3-yard line = 2, FG = 3, safety = 2. A defensive return on a try is worth the same point value as the try would have been (1 or 2). Defensive recovery of a fumble in the end zone on a try = same point value.',
 'tackle_11', 'nfhs', 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'overtime',
 'NFHS — Overtime (Kansas Plan)',
 'Each team gets a possession from the opponent''s 10-yard line. The team on offense has 4 downs to score. If the score is tied after both teams have a possession, additional rounds are played. Beginning with the third overtime, teams must attempt a 2-point conversion after a TD. Beginning with later overtimes (typically the 5th), the format may shift to alternating 2-point attempts only — varies by state.',
 'tackle_11', 'nfhs', 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'blocking',
 'NFHS — Blocking rules',
 'Blocking below the waist is allowed only in the free-blocking zone (a tight rectangle around the line of scrimmage), and only by linemen, only against linemen, and only at the snap. Outside the FBZ or after the ball leaves the FBZ, blocking below the waist is illegal. Crackback blocks (blindside blocks toward the original position of the ball) are illegal. Chop blocks are illegal.',
 'tackle_11', 'nfhs', 'high_school', 'seed',
 'Free-blocking zone rules differ from NCAA.',
 false, true),

('global', null,
 'rules', 'targeting',
 'NFHS — Targeting and helmet contact',
 'Targeting (forcible contact to the head/neck of a defenseless player or with the crown of the helmet) is a 15-yard penalty and may result in disqualification at the official''s discretion. NFHS has tightened helmet-contact rules in recent seasons; spearing and butt-blocking are flagrant and ejectable.',
 'tackle_11', 'nfhs', 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'kickoff',
 'NFHS — Kickoffs',
 'Kickoff from the 40-yard line. The kicking team must have at least 4 players on each side of the kicker. Touchback returns the ball to the 20. Onside kicks are legal — must travel 10 yards before the kicking team can recover (or be touched first by receiving team). The "pop-up" kick (driven directly into the ground) is illegal in NFHS.',
 'tackle_11', 'nfhs', 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'punts',
 'NFHS — Punting',
 'Punter must be at least 10 yards behind the line of scrimmage at the snap (not strictly required but typical). The receiving team may signal a fair catch with one arm extended above the head. A muffed punt is recoverable but not advanceable by the receiving team. Roughing the kicker = 15 yards and automatic first down.',
 'tackle_11', 'nfhs', 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'pass_interference',
 'NFHS — Pass interference',
 'Defensive pass interference: 15 yards from the previous spot, automatic first down (NFHS does NOT use spot fouls like NFL). Offensive pass interference: 15 yards from the previous spot, no loss of down (NFHS distinguishes from NCAA which assesses loss of down).',
 'tackle_11', 'nfhs', 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'penalties_common',
 'NFHS — Common penalties',
 'False start = 5 yards. Encroachment / offside = 5 yards. Holding (offense or defense) = 10 yards. Illegal procedure = 5 yards. Personal foul = 15 yards. Unsportsmanlike conduct = 15 yards (two = ejection). Roughing the passer = 15 yards, automatic first down. Intentional grounding = 5 yards from previous spot, loss of down (note: NFHS, not loss of yardage from spot of foul).',
 'tackle_11', 'nfhs', 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'state_variations',
 'NFHS — Major state variations',
 'Texas (UIL) and Massachusetts use NCAA-based rules instead of NFHS. Some states have additional modifications: 8-quarter rules for JV games, mercy-rule running clocks at +35 or +40 in the second half, and specific mouthguard / equipment requirements. Always verify the state association''s adoption notes.',
 'tackle_11', 'nfhs', 'high_school', 'seed', null, false, true);

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
where d.sanctioning_body = 'nfhs'
  and d.source = 'seed'
  and not exists (
    select 1 from public.rag_document_revisions r where r.document_id = d.id
  );
