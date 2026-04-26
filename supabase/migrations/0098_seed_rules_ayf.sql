-- Seed Coach AI knowledge base with American Youth Football (AYF) rules.
--
-- AYF differs from Pop Warner: it is age-only (no weight limits or X-rule)
-- and uses NFHS rules with a small set of youth-safety modifications.
-- This means heavier kids can carry the ball but contact rules are tighter.
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
 'AYF — Program structure',
 'American Youth Football (AYF) is age-only — no weight limits and no X-rule. Common divisions: 6U, 7U, 8U, 9U, 10U, 11U, 12U, 13U, 14U. A player''s age on a cutoff date determines their division. Any player may carry the ball or play any position, regardless of weight.',
 'tackle_11', 'ayf', 'youth', 'seed',
 'Cutoff date varies by region; verify against current AYF rulebook.',
 false, true),

('global', null,
 'rules', 'rulebook_base',
 'AYF — Base rules and modifications',
 'AYF games are played under NFHS rules with AYF-specific modifications for youth safety: stricter targeting/helmet-contact enforcement, mandatory play minimums, limited blitzing in some younger divisions, and shortened quarters.',
 'tackle_11', 'ayf', 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'mandatory_play',
 'AYF — Mandatory play rule (MPR)',
 'AYF requires every roster player to receive a minimum number of plays per game (commonly 8 plays for younger divisions, sometimes more). Coaches track MPR with wristbands or play counters. Failing to meet MPR results in penalties to the coach (suspension, forfeit) per league discipline.',
 'tackle_11', 'ayf', 'youth', 'seed',
 'MPR minimum varies by league/division.',
 false, true),

('global', null,
 'rules', 'field',
 'AYF — Field dimensions',
 'Standard NFHS field: 100 yards plus two 10-yard end zones, 53 1/3 yards wide. Younger divisions may play on shortened fields (80 yards) at league discretion.',
 'tackle_11', 'ayf', 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'game_length',
 'AYF — Game length',
 'Four quarters of 8-10 minutes depending on division. Clock typically runs continuously except in the final 2 minutes of each half. Halftime is 10 minutes.',
 'tackle_11', 'ayf', 'youth', 'seed',
 'Quarter length varies by division.',
 false, true),

('global', null,
 'rules', 'scoring',
 'AYF — Scoring',
 'Standard NFHS scoring: TD = 6, kicked PAT = 1, run/pass PAT = 2, FG = 3, safety = 2. Some younger divisions disallow kicked PATs and require run/pass.',
 'tackle_11', 'ayf', 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'blitz_limits',
 'AYF — Blitz / pressure restrictions',
 'Some younger AYF divisions limit defensive pressure: maximum number of pass rushers, requirement that interior linemen rush head-up, or ban on stunts/twists. These rules protect inexperienced offensive linemen and QBs and are strictly division-dependent.',
 'tackle_11', 'ayf', 'youth', 'seed',
 'Blitz restrictions vary widely. Verify per division and league.',
 false, true),

('global', null,
 'rules', 'kickoff',
 'AYF — Kickoff rules',
 'Kickoffs follow NFHS rules with AYF safety modifications: shorter kickoff distance in younger divisions, restrictions on the number of players in the wedge, and a possible ban on kickoffs entirely in the youngest divisions (ball placed at a designated yard line instead).',
 'tackle_11', 'ayf', 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'contact_general',
 'AYF — Contact and tackling',
 'Heads-up tackling enforced strictly. Targeting and helmet-to-helmet contact = ejection. Practice contact is limited (commonly no more than 2 days of full contact per week). Players are typically required to complete a heads-up certification before playing.',
 'tackle_11', 'ayf', 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'overtime',
 'AYF — Overtime',
 'Overtime follows the NFHS / Kansas Plan: each team gets a possession from the 10-yard line. Regular-season ties may stand depending on the league.',
 'tackle_11', 'ayf', 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'prohibited',
 'AYF — Prohibited actions',
 'Prohibited at all times: targeting, helmet-to-helmet contact, leading with the crown of the helmet, chop blocks, blocking below the waist outside the free-blocking zone, horse-collar tackles, hurdling defenders, and taunting. Coaches may not be on the field during a live ball.',
 'tackle_11', 'ayf', 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'pop_warner_diff',
 'AYF vs Pop Warner — Key differences',
 'AYF is age-only; Pop Warner is age-and-weight with the X-rule restricting heavier players from carrying the ball. AYF allows any player at any position regardless of weight. Both programs use NFHS rules with youth safety modifications, but the specific contact-limit and blitz rules differ. A coach should know which program their league plays under because mismatched expectations affect roster construction and play calling.',
 'tackle_11', 'ayf', 'youth', 'seed', null, false, true);

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
where d.sanctioning_body = 'ayf'
  and d.source = 'seed'
  and not exists (
    select 1 from public.rag_document_revisions r where r.document_id = d.id
  );
