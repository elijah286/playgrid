-- Coach AI KB — new and corrected route entries (2026-05-26).
--
-- Covers three changes made to src/domain/football-kg/defs/routes.ts:
--
--   1. Z-In / Z-Out: previously shared kbSubtopic with the standard In/Out
--      routes (route_in / route_out). They now have unique subtopics
--      (route_z_in / route_z_out) and correct double-break geometry.
--      INSERT new rows; the existing route_in / route_out rows are unchanged.
--
--   2. Hook In / Hook Out / Quick In: new catalog entries; no KB rows exist yet.
--      INSERT rows so Cal can find them via search_kb.
--
-- Content mirrors the `body` field in routes.ts exactly so Cal's
-- get_route_template and search_kb results stay in sync.

-- ── Z-In / Z-Out (double-break zigzag routes) ────────────────────

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

('global', null, 'scheme', 'route_z_in',
 'Route: Z-In',
 '5-yd vertical stem, then a SHARP break to the outside (~3-4 yds lateral), then a SECOND SHARP break continuing upfield and back inside toward the QB. Creates a Z-shape — the receiver crosses toward the sideline before breaking back to the middle. Beats man coverage (double-move forces the defender to change direction twice). Finishes ~12-13 yds deep inside.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_z_out',
 'Route: Z-Out',
 '5-yd vertical stem, then a SHARP break to the inside (~3-4 yds lateral), then a SECOND SHARP break continuing upfield and back outside. Creates a Z-shape — the receiver crosses toward the middle before breaking back toward the sideline. Beats man coverage (double-move forces the defender to change direction twice). Finishes ~12-13 yds deep outside.',
 null, null, 'seed', null, true, false),

-- ── Hook In / Hook Out (rounded U-turn routes) ───────────────────

('global', null, 'scheme', 'route_hook_in',
 'Route: Hook In',
 '7-yd vertical release then a ROUNDED U-turn hooking back inside (toward the QB/middle), settling at 3-4 yds depth with the receiver facing inside. The receiver reverses direction — unlike a Curl which turns back to the QB, the Hook In finishes with momentum toward the inside. Beats off-man coverage and zone defenders who widen with the stem.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_hook_out',
 'Route: Hook Out',
 '7-yd vertical release then a ROUNDED U-turn hooking back outside (toward the sideline), settling at 3-4 yds depth. The receiver reverses direction back toward the sideline. Beats off-coverage corners who stop retreating — the receiver comes back to them. Strong boundary route and clock-stopper.',
 null, null, 'seed', null, true, false),

-- ── Quick In ─────────────────────────────────────────────────────

('global', null, 'scheme', 'route_quick_in',
 'Route: Quick In (Speed In)',
 '4-yd vertical stem then a SHARP inside cut across the middle at roughly 45° — catches at 4-5 yds depth. Inside mirror of the Quick Out. Beats off-man coverage with a quick inside release. Gets the ball out fast vs pressure. Common quick-game slot route.',
 null, null, 'seed', null, true, false);
