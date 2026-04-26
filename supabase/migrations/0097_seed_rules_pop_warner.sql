-- Seed Coach AI knowledge base with Pop Warner youth tackle rules.
--
-- Pop Warner is age-and-weight-tiered with significant rule variation by
-- division (Tiny Mite through Bantam). This seed captures program-wide
-- rules; division-specific weight limits and contact rules are stored in
-- separate documents per age_division so retrieval can target precisely.
--
-- All rows authoritative=false / needs_review=true. Pop Warner publishes
-- annual rulebook updates; site admin should verify against the current year.

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body, game_level, age_division,
  source, source_note,
  authoritative, needs_review
) values

-- ── Program-wide ───────────────────────────────────────────────────
('global', null,
 'rules', 'overview',
 'Pop Warner — Program structure',
 'Pop Warner Little Scholars is a youth tackle football program with age-and-weight divisions. Common divisions: Tiny Mite (5-7), Mitey Mite (7-9), Junior Pee Wee (8-10), Pee Wee (9-11), Junior Varsity (10-12), Varsity (11-13), Bantam (12-14). Each division has age and weight maximums. Players are also classified by ball-carrier weight (X-rule) which limits which players may carry the ball or play certain positions.',
 'tackle_11', 'pop_warner', 'youth', null, 'seed',
 'Age/weight ranges shift season to season. Verify against current Pop Warner Official Rulebook.',
 false, true),

('global', null,
 'rules', 'mandatory_play',
 'Pop Warner — Mandatory play rule (MPR)',
 'Every roster player must receive a minimum number of plays per game (commonly 8-10 for most divisions). Failure to meet MPR is a penalty against the head coach (suspension, forfeit, or other discipline depending on league). Coaches typically track MPR with a play counter or wristband system.',
 'tackle_11', 'pop_warner', 'youth', null, 'seed',
 'MPR minimums and enforcement vary by league/division.',
 false, true),

('global', null,
 'rules', 'field',
 'Pop Warner — Field dimensions',
 'Standard field is 100 yards long with 10-yard end zones, 53 1/3 yards wide. Younger divisions may use shorter fields (80 yards) at league discretion. Goal posts and hash marks follow high school dimensions.',
 'tackle_11', 'pop_warner', 'youth', null, 'seed', null, false, true),

('global', null,
 'rules', 'game_length',
 'Pop Warner — Game length',
 'Games are four quarters of 8-10 minutes depending on division. The clock generally runs continuously except in the final 2 minutes of each half (it stops on standard NFHS clock-stopping events like incomplete passes, out of bounds, scores, and timeouts). Halftime is 10 minutes.',
 'tackle_11', 'pop_warner', 'youth', null, 'seed',
 'Quarter length varies by division — Tiny Mite uses shorter quarters than Bantam.',
 false, true),

('global', null,
 'rules', 'scoring',
 'Pop Warner — Scoring',
 'Touchdown = 6 points. PAT kick = 1 point, PAT run/pass = 2 points (some divisions disallow kicked PATs). Field goal = 3 points. Safety = 2 points. Scoring follows NFHS rules.',
 'tackle_11', 'pop_warner', 'youth', null, 'seed', null, false, true),

-- ── Contact and safety ─────────────────────────────────────────────
('global', null,
 'rules', 'contact_general',
 'Pop Warner — Contact and tackling',
 'Pop Warner enforces stricter heads-up tackling rules than high school. Targeting, leading with the crown of the helmet, and helmet-to-helmet contact result in immediate ejection and possible suspension. Practice contact is limited per week (typically no more than one-third of practice time may be live contact).',
 'tackle_11', 'pop_warner', 'youth', null, 'seed', null, false, true),

('global', null,
 'rules', 'kickoff',
 'Pop Warner — Kickoff rules',
 'Tiny Mite typically does not have kickoffs; the ball is placed at a designated yard line to start each possession. Mitey Mite and older divisions kick off, but with shorter kickoff distances (often from the 40-yard line of an 80-yard field). Onside kicks are allowed in older divisions only.',
 'tackle_11', 'pop_warner', 'youth', null, 'seed',
 'Kickoff rules vary by division and have changed in recent seasons toward safer formats.',
 false, true),

('global', null,
 'rules', 'punts',
 'Pop Warner — Punts',
 'Punting follows NFHS rules with division-specific modifications. In some younger divisions punts are dead at the spot of the kick reception (no return), or scrimmage kicks are not allowed at all and the ball is given to the opponent at a designated yard line.',
 'tackle_11', 'pop_warner', 'youth', null, 'seed', null, false, true),

('global', null,
 'rules', 'x_rule',
 'Pop Warner — X-rule (ball-carrier weight limits)',
 'Within each division, players over a specified weight (the X-rule weight) are marked with an X on their helmet and are restricted from playing certain skill positions (typically running back, fullback, and defensive backfield positions) and may not advance the ball. The X-rule keeps heavier players from running over lighter ones.',
 'tackle_11', 'pop_warner', 'youth', null, 'seed',
 'X-rule weight thresholds change annually. Verify current values per division.',
 false, true),

('global', null,
 'rules', 'overtime',
 'Pop Warner — Overtime',
 'Overtime follows the NFHS / Kansas Plan: each team gets a possession from the 10-yard line. After regular-season ties stand in some leagues; playoff games continue with additional rounds.',
 'tackle_11', 'pop_warner', 'youth', null, 'seed', null, false, true),

('global', null,
 'rules', 'prohibited',
 'Pop Warner — Prohibited actions',
 'Prohibited at all times: targeting, helmet-to-helmet contact, leading with the crown of the helmet, blocking below the waist outside the free-blocking zone, chop blocks, horse-collar tackles, hurdling defenders, taunting, and use of profanity. Coaches may not be on the field of play during a live ball.',
 'tackle_11', 'pop_warner', 'youth', null, 'seed', null, false, true);

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
where d.sanctioning_body = 'pop_warner'
  and d.source = 'seed'
  and not exists (
    select 1 from public.rag_document_revisions r where r.document_id = d.id
  );
