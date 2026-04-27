-- Coach AI KB — NFL Flag 5v5 defensive schemes.
--
-- 5v5 defense has 5 players and a 7-yard rush requirement. Coverages adapt
-- traditional 11-man concepts to a smaller field. All chunks
-- authoritative=false / needs_review=true.

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body,
  source, source_note,
  authoritative, needs_review
) values

-- ── Coverage shells ───────────────────────────────────────────────
('global', null, 'scheme', 'defense_cover_0',
 'NFL Flag 5v5 — Coverage: Cover 0 (all man, no help)',
 'Five defenders in pure man coverage with no deep safety. Typically paired with a rusher (4 cover, 1 rush) or two rushers (3 cover man, 2 rush — very risky). Maximum pressure but vulnerable to any deep route. Use when defense must force a quick throw or short field dictates.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'defense_cover_1',
 'NFL Flag 5v5 — Coverage: Cover 1 (man + free safety)',
 'Three or four defenders in man on the receivers, one defender as a deep free safety (centerfielder), zero or one rusher. Free safety reads QB''s eyes and helps over the top. Most common 5v5 base coverage — gives man matchups with deep insurance.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'defense_cover_2',
 'NFL Flag 5v5 — Coverage: Cover 2 (two deep, three under)',
 'Two deep safeties split the field in halves; three underneath defenders cover the flats and middle. Strong vs deep passes and Smash, weak vs four verts and any seam-stretching concept. Typically zero rushers or one rusher.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'defense_cover_3',
 'NFL Flag 5v5 — Coverage: Cover 3 (three deep, two under)',
 'Three defenders divide the deep field in thirds; two underneath defenders cover the short middle and flats. Strong vs deep balls, weak in the flats and on out-breaking routes. Useful late in halves to prevent the big play.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'defense_cover_4',
 'NFL Flag 5v5 — Coverage: Cover 4 / Quarters',
 'All four non-rushing defenders bail to deep zones, splitting the field into quarters. No underneath coverage at all. Useful only in obvious deep-shot situations (e.g. last play of half, defending Hail Mary). Concedes anything short.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'defense_drop_5',
 'NFL Flag 5v5 — Coverage: Drop-5 (no rush, all coverage)',
 'No defender rushes. All 5 drop into zone — three deep, two underneath, or four deep with one robber. Forces the QB to hold the ball and let the 7-second pass clock run out. Excellent on long down-and-distance.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Pressure / blitz ─────────────────────────────────────────────
('global', null, 'scheme', 'defense_single_rush',
 'NFL Flag 5v5 — Pressure: Single rusher',
 'One defender rushes from 7 yards back, four drop into coverage. Standard NFL Flag pressure — gets to the QB quickly without sacrificing coverage. The rusher should take a clean angle to the QB''s throwing shoulder.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'defense_double_rush',
 'NFL Flag 5v5 — Pressure: Double rush',
 'Two defenders rush from 7 yards. Three remain in coverage — typically Cover 1 with one safety. Forces the QB to release the ball quickly but creates a 3-on-3 matchup downfield. Use when winning man matchups.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'defense_zero_blitz',
 'NFL Flag 5v5 — Pressure: Zero blitz (Cover 0 + 2 rush)',
 'Two rushers, three defenders in pure man coverage with no safety. All-in gamble — either the pressure gets home or the defense gives up a big play. Reserve for short-yardage or end-of-game must-stop situations.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'defense_delayed_rush',
 'NFL Flag 5v5 — Pressure: Delayed rush / green dog',
 'A defender starts in zone or man coverage, then rushes the QB after a 1-2 second delay if his receiver stays in to fake-block. Confuses the QB''s pre-snap rush count. Effective vs offenses that motion or fake jet sweeps.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Coverage techniques ──────────────────────────────────────────
('global', null, 'scheme', 'defense_press_man',
 'NFL Flag 5v5 — Technique: Press man',
 'Defender lines up directly across from his receiver with no cushion (legal — no contact at the line is allowed in flag, so "press" means alignment only). Disrupts timing routes. Vulnerable to double-moves and stacks.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'defense_off_man',
 'NFL Flag 5v5 — Technique: Off man',
 'Defender plays 5-7 yards off his receiver. Easier to defend deep routes and react to shorter routes underneath. Concedes hitches and short slants — common vs young or pass-heavy offenses.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'defense_bracket',
 'NFL Flag 5v5 — Technique: Bracket coverage',
 'Two defenders double-team one elite receiver — one underneath, one over the top. Forces the offense to throw to its other three receivers. Use against a clear #1 target. Pair with man-free or zone behind.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'defense_combo',
 'NFL Flag 5v5 — Technique: Combo (man + zone)',
 'Defenders on one side play man, defenders on the other play zone. Used to bracket a strong-side concept while allowing freelance on the back side. Good vs unbalanced formations like Trips.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'defense_robber',
 'NFL Flag 5v5 — Technique: Robber',
 'A defender drops underneath a deep route to "rob" intermediate digs and crossers. Typically a safety reading the QB''s eyes from depth, then jumping a route. Effective vs Y-Cross and dig concepts.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Situational ──────────────────────────────────────────────────
('global', null, 'scheme', 'defense_vs_no_run_zone',
 'NFL Flag 5v5 — Situation: Defending a no-run zone',
 'Inside no-run zones the offense MUST pass — no run threat. Drop all 5 defenders into coverage, or rush 1 with 4 in zone. Protect the goal line / line to gain by playing under all routes; let the QB throw a low-percentage ball to the back of the zone.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'defense_vs_jet_motion',
 'NFL Flag 5v5 — Situation: Defending jet motion',
 'When a receiver motions full-speed across the formation, one defender (usually the safety or the strong-side defender) bumps with the motion. Be alert for the fake-jet/pass and the reverse. Don''t lose contain on the back side.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true);

-- Initial revisions.
insert into public.rag_document_revisions (
  document_id, revision_number,
  title, content, source, source_note,
  authoritative, needs_review,
  change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — defensive schemes (drafted, awaiting admin verification)', null
from public.rag_documents d
where d.sport_variant = 'flag_5v5'
  and d.sanctioning_body = 'nfl_flag'
  and d.source = 'seed'
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
