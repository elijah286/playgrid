-- Seed Coach AI knowledge base with 6-man tackle football rules.
--
-- 6-man is played in small rural high schools (TX, CO, NE, MT, others)
-- and is governed by state associations under NFHS-derived rulebooks
-- with major modifications. The most influential variant is the Texas
-- UIL 6-man rulebook.
--
-- All rows authoritative=false / needs_review=true.

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body, game_level,
  source, source_note,
  authoritative, needs_review
) values

('global', null,
 'rules', 'overview',
 '6-man — Overview',
 '6-man tackle football is a high-school variant played mostly in small rural schools in Texas, Colorado, Nebraska, Montana, and other plains states. Six players per side. The game emphasizes open-field offense, lateral plays, and high scoring. Texas UIL 6-man is the largest single league.',
 'six_man', null, 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'field',
 '6-man — Field dimensions',
 'Field is 80 yards long with two 10-yard end zones, 40 yards wide. Goal posts are narrower than 11-man. The shorter and narrower field combined with fewer players means much more space per player, which drives the high-scoring style.',
 'six_man', null, 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'players',
 '6-man — Players on field',
 'Six players per side. Offense must have at least 3 players on the line of scrimmage (typically a center and two ends). The remaining 3 are in the backfield. Every offensive player is an eligible receiver — there is no concept of an ineligible lineman.',
 'six_man', null, 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'snap_rule',
 '6-man — The "clear pass" / handoff rule',
 'A defining rule: the player who receives the snap from center may NOT cross the line of scrimmage with the ball until the ball has changed hands at least once (a handoff, lateral, or forward pass behind the line). This forces every play to involve at least two players touching the ball, eliminating QB sneaks and direct runs.',
 'six_man', null, 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'first_down',
 '6-man — Line to gain',
 'In Texas UIL 6-man, the offense must gain 15 yards (not 10) for a first down. This rewards big plays and discourages slow grinding offenses. Some other state 6-man rulebooks retain the 10-yard line to gain.',
 'six_man', null, 'high_school', 'seed',
 'Verify whether the league uses 10-yard or 15-yard line to gain.',
 false, true),

('global', null,
 'rules', 'scoring',
 '6-man — Scoring',
 'TD = 6 points. Kicked PAT = 2 points (worth more than the run/pass try because kicking is harder in 6-man — narrower posts, fewer blockers). Run/pass PAT = 1 point. FG = 4 points. Safety = 2 points. The kicked PAT being worth more than the run/pass PAT is the inverse of 11-man and is the most-asked-about 6-man rule.',
 'six_man', null, 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'mercy_rule',
 '6-man — 45-point mercy rule',
 'In Texas UIL 6-man, if a team leads by 45 or more points at any point after halftime (or at the end of the first half), the game ends. This is a hard stop, not a running clock. Some other state 6-man leagues use 40 or 50.',
 'six_man', null, 'high_school', 'seed',
 'Mercy threshold varies by state. Verify per league.',
 false, true),

('global', null,
 'rules', 'game_length',
 '6-man — Game length',
 'Four 10-minute quarters in Texas UIL. Halftime is typically 15 minutes. Standard NFHS clock-stopping rules apply within quarters. The mercy rule (above) can end the game early.',
 'six_man', null, 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'kickoff',
 '6-man — Kickoff',
 'Kickoff is from the kicking team''s 30-yard line. Onside kicks legal. Touchback returns the ball to the 20-yard line. Several state associations use modified kickoff distances given the shorter field.',
 'six_man', null, 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'punts',
 '6-man — Punting',
 'Punting is legal but rare given the short field and 15-yard line to gain — most teams go for it on 4th down. When punted, all 6-man rules around the kicker (no roughing, fair catch) apply per the state rulebook.',
 'six_man', null, 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'overtime',
 '6-man — Overtime',
 'Texas UIL uses a Kansas-Plan-style overtime: each team gets a possession from the opponent''s 15-yard line. Score still determined by standard 6-man scoring. Other state associations vary.',
 'six_man', null, 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'prohibited',
 '6-man — Prohibited actions',
 'Standard NFHS prohibitions apply: targeting, helmet-to-helmet, chop blocks, blocks below the waist outside the free-blocking zone, horse-collar tackles. The 6-man-specific prohibition is the snap-receiver crossing the LOS without the ball changing hands, which is treated as an illegal procedure (loss of down at previous spot).',
 'six_man', null, 'high_school', 'seed', null, false, true);

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
where d.sport_variant = 'six_man'
  and d.source = 'seed'
  and not exists (
    select 1 from public.rag_document_revisions r where r.document_id = d.id
  );
