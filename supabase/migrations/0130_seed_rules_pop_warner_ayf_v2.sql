-- Coach AI KB — Pop Warner + AYF rules v2 (dedupe + expansion).
-- Both leagues are youth tackle 11-man; rules largely parallel NFHS with
-- league-specific modifications (weight limits, MPR, contact restrictions).

-- ── Dedupe existing rows ─────────────────────────────────────────
update public.rag_documents r
   set retired_at = now()
  where r.sport_variant = 'tackle_11'
    and r.sanctioning_body in ('pop_warner','ayf')
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

-- ── Pop Warner v2 expansion ──────────────────────────────────────
insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

('global', null, 'rules', 'age_weight_pw',
 'Pop Warner — Age and weight matrix',
 'Pop Warner divides players by both age AND weight to control physical mismatches. Divisions roughly: Tiny-Mite (5-7yo), Mitey-Mite (7-9), Junior Pee Wee (8-10), Pee Wee (9-11), Junior Varsity (10-12), Varsity (11-14). Each division has age-specific weight ranges; older/heavier players within a division are designated as X-players (cannot carry the ball). Verify exact divisions on the current Pop Warner rulebook.',
 'tackle_11', 'pop_warner', 'seed',
 'Pop Warner age/weight matrix changes year to year — verify against the current official rulebook.',
 true, false),

('global', null, 'rules', 'practice_limits_pw',
 'Pop Warner — Practice and contact limits',
 'Pop Warner restricts contact during practice to limit injuries. Common limits: maximum 2 hours of contact practice per week during the season, mandatory hydration breaks, and required heat-acclimatization periods at the start of the season. Helmet-to-helmet drills are prohibited.',
 'tackle_11', 'pop_warner', 'seed', null, true, false),

('global', null, 'rules', 'qb_protection_pw',
 'Pop Warner — Quarterback / passer protection',
 'Late hits on the QB after the ball is released are roughing-the-passer fouls (15 yards, automatic first down). In younger divisions, hits to the head or neck of the QB carry automatic ejection.',
 'tackle_11', 'pop_warner', 'seed', null, true, false),

('global', null, 'rules', 'pat_pw',
 'Pop Warner — Point-after-touchdown',
 'PAT options: 1 point by kick from the 3-yard line, 2 points by run/pass from the 3-yard line. Some divisions use a 1-point try by run/pass + 2-point try by kick to encourage kicking development.',
 'tackle_11', 'pop_warner', 'seed', null, true, false),

('global', null, 'rules', 'kickoff_safety_pw',
 'Pop Warner — Kickoff safety modifications',
 'Pop Warner has progressively restricted kickoffs to reduce high-impact collisions. Many divisions (especially younger) eliminate kickoffs entirely — the receiving team starts at a designated yard line (commonly the 35). Where kickoffs exist, no-running-start rules limit the speed of the coverage team.',
 'tackle_11', 'pop_warner', 'seed', null, true, false),

('global', null, 'rules', 'punt_protection_pw',
 'Pop Warner — Punt rules',
 'Standard NFHS punt rules apply with safety modifications: no rushing through the long snapper, fair-catch protection extended (defender must give the punt returner a 2-yard cushion before the catch).',
 'tackle_11', 'pop_warner', 'seed', null, true, false),

('global', null, 'rules', 'overtime_pw',
 'Pop Warner — Overtime detail',
 'Kansas-style OT: each team gets a possession from the 10-yard line, attempts to score. After both teams have a possession, if tied another round is played. Some divisions limit OT to one round and record the tie.',
 'tackle_11', 'pop_warner', 'seed', null, true, false),

('global', null, 'rules', 'mpr_enforcement_pw',
 'Pop Warner — MPR enforcement',
 'Mandatory Play Rule: every player must participate in a minimum number of plays (commonly 8-10 plays per game). MPR is tracked by an opposing-team scorekeeper or league official. Failure to meet MPR results in forfeit and coach suspension.',
 'tackle_11', 'pop_warner', 'seed', null, true, false),

('global', null, 'rules', 'equipment_pw',
 'Pop Warner — Equipment requirements',
 'Required: helmet (NOCSAE-certified), shoulder pads, hip pads, thigh pads, knee pads, mouthguard (colored, not clear), athletic supporter. Cleats: rubber/molded only, no metal. Equipment inspections happen pre-game.',
 'tackle_11', 'pop_warner', 'seed', null, true, false),

('global', null, 'rules', 'concussion_protocol_pw',
 'Pop Warner — Concussion protocol',
 'Any player suspected of a concussion must be removed immediately and cannot return without medical clearance per state RTP (return to play) law. Concussed players sit out the remainder of the game by mandate.',
 'tackle_11', 'pop_warner', 'seed', null, true, false),

-- ── AYF v2 expansion ─────────────────────────────────────────────
('global', null, 'rules', 'age_division_ayf',
 'AYF — Age divisions',
 'AYF (American Youth Football) divides primarily by age, with weight serving as a secondary modifier. Divisions roughly: 5-6, 7-8, 9-10, 11-12, 13-14. Older or larger players within a division play designated linemen positions (cannot advance the ball). Verify exact divisions per current AYF rulebook.',
 'tackle_11', 'ayf', 'seed', null, true, false),

('global', null, 'rules', 'weight_relief_ayf',
 'AYF — Weight-relief / older-lighter',
 'AYF allows older players who fall below a weight threshold to "play down" to a younger division. This keeps lighter, less developed players from being mismatched with larger peers. Process is application-based and varies by region.',
 'tackle_11', 'ayf', 'seed', null, true, false),

('global', null, 'rules', 'practice_limits_ayf',
 'AYF — Practice and contact limits',
 'AYF restricts in-season contact practice volume. Common limits include 90-120 minutes of full-contact practice per week and required heat-acclimatization at the start of preseason. Helmet-to-helmet drills are prohibited.',
 'tackle_11', 'ayf', 'seed', null, true, false),

('global', null, 'rules', 'pat_ayf',
 'AYF — Point-after-touchdown',
 '1 point by kick or 2 points by run/pass from the 3-yard line. Defensive return of a PAT is worth 2 points.',
 'tackle_11', 'ayf', 'seed', null, true, false),

('global', null, 'rules', 'kickoff_ayf',
 'AYF — Kickoff modifications',
 'Many AYF divisions eliminate kickoffs in younger age groups for safety, replacing them with a fixed start-of-possession spot (often the 35-yard line). Where kickoffs are used, no-running-start rules apply.',
 'tackle_11', 'ayf', 'seed', null, true, false),

('global', null, 'rules', 'punts_ayf',
 'AYF — Punt rules',
 'Standard NFHS punt rules with safety modifications: protected long snapper, no leaping over the line, fair-catch protection enforced strictly.',
 'tackle_11', 'ayf', 'seed', null, true, false),

('global', null, 'rules', 'overtime_ayf',
 'AYF — Overtime detail',
 'Kansas-style overtime from the 10-yard line. Both teams get a possession; if tied after one round, another round is played. Two-point conversions become mandatory after a certain round in some regional rule sets.',
 'tackle_11', 'ayf', 'seed', null, true, false),

('global', null, 'rules', 'mpr_enforcement_ayf',
 'AYF — Minimum play participation',
 'AYF requires every rostered player to participate in a minimum number of plays each game. Commonly 8-10 plays. Failure can lead to forfeit and coach discipline. League officials track participation.',
 'tackle_11', 'ayf', 'seed', null, true, false),

('global', null, 'rules', 'equipment_ayf',
 'AYF — Equipment requirements',
 'Required: NOCSAE-certified helmet, shoulder pads, hip pads, thigh pads, knee pads, colored mouthguard, athletic supporter. Cleats: rubber/molded only. Pre-game equipment check by officials.',
 'tackle_11', 'ayf', 'seed', null, true, false),

('global', null, 'rules', 'concussion_protocol_ayf',
 'AYF — Concussion protocol',
 'Player removed immediately on suspected concussion; cannot return without written medical clearance per state RTP law. Mandatory sit-out for the remainder of the game.',
 'tackle_11', 'ayf', 'seed', null, true, false);

-- Initial revisions for new rows.
insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed v2 expansion (drafted, beta authoritative)', null
from public.rag_documents d
where d.sport_variant = 'tackle_11'
  and d.sanctioning_body in ('pop_warner','ayf')
  and d.source = 'seed'
  and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
