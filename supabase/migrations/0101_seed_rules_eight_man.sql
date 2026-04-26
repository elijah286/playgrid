-- Seed Coach AI knowledge base with 8-man tackle football rules.
--
-- 8-man is played in small high schools across the US (CO, KS, NE, MT, OR,
-- and others). It uses NFHS rules with modifications for the smaller
-- roster and field. Less radically different from 11-man than 6-man is.
--
-- Note: this introduces sport_variant='eight_man' which is not yet a
-- selectable variant in the playbook UI; the data will be there when UI
-- support is added.
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
 '8-man — Overview',
 '8-man tackle football is a high-school variant played in small schools across the western and midwestern US. Eight players per side. Uses NFHS rules with modifications for the smaller roster and (in most states) a smaller field. Less radically different from 11-man than 6-man — recognizable formations and play structure.',
 'eight_man', null, 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'field',
 '8-man — Field dimensions',
 'Field is 80 yards long with two 10-yard end zones, 40 yards wide in most states. Some state associations use a full 53 1/3-yard width. Goal posts and hash marks per NFHS.',
 'eight_man', null, 'high_school', 'seed',
 'Field width varies by state.',
 false, true),

('global', null,
 'rules', 'players',
 '8-man — Players on field',
 'Eight players per side. Typical offensive alignments have 5 on the line of scrimmage (center, two guards, two ends — both ends eligible) and 3 in the backfield (QB plus two backs). The ends are always eligible receivers because they are at the end of the line. Some leagues require 5 on the line; others allow 3 minimum (similar to 6-man).',
 'eight_man', null, 'high_school', 'seed',
 'Minimum players on the line varies by state.',
 false, true),

('global', null,
 'rules', 'first_down',
 '8-man — Line to gain',
 'Standard 10 yards for a first down in most states. (6-man uses 15.) NFHS down-and-distance rules apply.',
 'eight_man', null, 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'scoring',
 '8-man — Scoring',
 'Standard NFHS scoring: TD = 6, kicked PAT = 1, run/pass PAT = 2, FG = 3, safety = 2. (Unlike 6-man, the kicked PAT is NOT worth more than the run/pass.)',
 'eight_man', null, 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'mercy_rule',
 '8-man — Mercy rule',
 'Most 8-man states use a 45-point mercy rule (game ends if a team leads by 45+ at any point in the second half) or a running-clock variant at the same threshold. Specifics vary by state.',
 'eight_man', null, 'high_school', 'seed',
 'Mercy threshold varies by state.',
 false, true),

('global', null,
 'rules', 'game_length',
 '8-man — Game length',
 'Four 10- to 12-minute quarters depending on the state. Halftime 15-20 minutes. Standard NFHS clock-stopping rules.',
 'eight_man', null, 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'kickoff',
 '8-man — Kickoff',
 'Kickoff from the kicking team''s 30- or 35-yard line depending on state. Onside kicks legal. Touchback returns the ball to the 20-yard line.',
 'eight_man', null, 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'punts',
 '8-man — Punting',
 'Punting follows NFHS rules. Punts are more common than in 6-man because the longer line to gain (10 yards) and bigger field make 4th-down conversions less automatic. Roughing the kicker = 15 yards and automatic first down.',
 'eight_man', null, 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'overtime',
 '8-man — Overtime',
 'Kansas Plan: each team gets a possession from the 10-yard line. Standard NFHS scoring applies.',
 'eight_man', null, 'high_school', 'seed', null, false, true),

('global', null,
 'rules', 'prohibited',
 '8-man — Prohibited actions',
 'Standard NFHS prohibitions: targeting, helmet-to-helmet contact, leading with the crown of the helmet, chop blocks, blocks below the waist outside the free-blocking zone, horse-collar tackles, hurdling, taunting.',
 'eight_man', null, 'high_school', 'seed', null, false, true);

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
where d.sport_variant = 'eight_man'
  and d.source = 'seed'
  and not exists (
    select 1 from public.rag_document_revisions r where r.document_id = d.id
  );
