-- Coach AI KB — make every route entry canonical.
--
-- This migration rewrites every route_* entry so the prose description
-- exactly matches the `description` field in
-- src/domain/play/routeTemplates.ts. That file is the single source of
-- truth; this row mirrors it so Cal's get_route_template tool result and
-- search_kb result say the same thing.
--
-- Format for every route:
--   STEM (if any) → BREAK shape/angle/direction → CATCH depth.
--   When-to-use bullet. Route tree # if applicable.
--
-- Angle convention: angles are measured FROM HORIZONTAL (LOS / sideline-
-- to-sideline) unless the route entry says otherwise. So "25° slant" =
-- mostly lateral with a shallow upfield lean, NOT mostly vertical.
--
-- Sharp vs rounded is called out explicitly in EVERY entry. This is the
-- field that drives Cal's `curve: true` decision in the diagram.

-- ── Vertical / deep ──────────────────────────────────────────────

update public.rag_documents set
  content = 'Straight vertical sprint downfield (route tree #9). No break — full-speed release, accelerate upfield, ball thrown over the top. Stretches the defense vertically. Best vs single-high coverage with no deep help.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_go';

update public.rag_documents set
  content = 'Vertical sprint from a slot or TE alignment, splitting the deep safeties. No hard break — slight inside release, then sustained vertical. Beats Cover 2 (gap between safeties) and Cover 4 (vertical the safety can''t carry). Foundation route in 4 verts.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_seam';

update public.rag_documents set
  content = 'Vertical release with a ROUNDED outside arc toward the sideline (no hard break). Ball thrown back-shoulder or up-and-away. Red-zone staple — defender can''t recover when the throw is placed up-and-away. Usually a tall WR vs a short DB.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_fade';

update public.rag_documents set
  content = 'Vertical 11-12 yards then a SHARP 45°-above-horizontal break inside toward the goalpost (route tree #8). Beats single-high (Cover 1, Cover 3) when the safety bites, and beats Cover 2 between the safeties. Pair with a deep crosser to clear the safety.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_post';

update public.rag_documents set
  content = 'Vertical 10 yards then a SHALLOW inside break (~70° above horizontal — much closer to vertical than a true 45° post). Beats Cover 3 between the corner and the deep middle safety. Common as the pass option in inside-zone RPOs.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_skinny_post';

update public.rag_documents set
  content = 'Vertical 11-12 yards then a SHARP 45°-above-horizontal break outside toward the back pylon (route tree #7). Beats Cover 2 (corner sits flat) and Cover 4 (corner stays inside on outside #1). Often the high in a smash concept.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_corner';

update public.rag_documents set
  content = 'RB or slot releases flat to the sideline (~3 yds depth, ~6 yds out), then ROUNDS UP and runs vertical along the sideline (the rounded turnup is the wheel). Beats LBs in man coverage who can''t run with a back. Common pair with a deep crosser to clear the safety.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_wheel';

-- ── Intermediate (8-15 yards) ────────────────────────────────────

update public.rag_documents set
  content = 'Vertical 12-15 yards then a SHARP 90° break to the inside, finishing across the middle (route tree #4). Beats man and zone — sits in the window between LB depth and safety depth. Foundation of dig-post and levels concepts.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_dig';

update public.rag_documents set
  content = 'Vertical 8 yards then a SHARP 90° break to the inside. Shallower than a Dig — sits in front of the LBs / under the safeties. Common quick-game intermediate vs zone.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_in';

update public.rag_documents set
  content = 'Vertical 10 yards then a SHARP 90° break toward the sideline (route tree #3). Stops the clock — common late-game call. Vulnerable to a jumping cornerback if undisguised.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_out';

update public.rag_documents set
  content = 'Vertical 12-13 yards then a ROUNDED break back at ~45° toward the sideline, settling at ~10 yds depth (route tree #5). Sideline route, stops the clock. Defender must drive forward — comeback wins on the cushion.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_comeback';

update public.rag_documents set
  content = 'Vertical 10-12 yards then a ROUNDED ~180° turn back toward the QB, settling in a soft spot in the zone at ~9 yds depth (route tree #6). The break is a smooth turn-back, NOT a sharp corner — receiver decelerates and curls. Reliable vs zone — find the window between defenders.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_curl';

-- ── Short / quick (≤7 yds) ───────────────────────────────────────

update public.rag_documents set
  content = '3-yard vertical stem then a SHARP 25°-above-horizontal cut across the middle (angle measured from horizontal — mostly lateral with a shallow upfield lean, NOT a steep vertical-leaning break). Catches at 5-6 yds depth, having gained 5-7 yds laterally (route tree #2). Beats press man (inside leverage fast) and Cover 2 (slant fits between underneath defenders).',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_slant';

update public.rag_documents set
  content = '5-yard vertical release then a ROUNDED quick turn back toward the QB, settling at 4-5 yds (route tree #1). The turn-back is a smooth settle, not a sharp corner. Beats off-coverage instantly. Quick-game staple.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_hitch';

update public.rag_documents set
  content = '5-yard out — vertical then SHARP 90° break to the sideline at full speed (no break-down). Catches at 4-5 yds. Beats off-man, stops the clock, gets the ball out fast vs pressure.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_quick_out';

update public.rag_documents set
  content = 'Shallow crossing route — receiver releases across the formation at 2-4 yds depth, gaining a small amount of depth as he crosses. No hard break. Foundation of mesh and shallow concepts. Beats man — defender has to fight through traffic.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_drag';

update public.rag_documents set
  content = 'Vertical stem to 5-6 yards, then a small ROUNDED settle facing the QB (the receiver stops and turns back). Foundation of the stick concept (with a flat underneath and a clear over the top). Quick-game staple, 3rd-and-medium reliable.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_stick';

update public.rag_documents set
  content = 'Receiver releases inside on a slight angle, settling 5-6 yards downfield in a soft spot. More deliberate than a hitch. Often the inside route in a snag concept (with corner over and flat under).',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_snag';

update public.rag_documents set
  content = 'Receiver releases directly to the sideline at 0-3 yards depth. Common RB or slot route paired with a curl/corner over the top to high-low the flat defender.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_flat';

update public.rag_documents set
  content = 'RB or slot releases at a slight angle to the flat, gaining a bit of depth (~3 yds). Outlet for the QB and high-low partner with a sit/curl over the top.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_arrow';

update public.rag_documents set
  content = 'Receiver releases backward and outside in a ROUNDED banana arc, catching a quick lateral pass behind the LOS. Other receivers block downfield. Common RPO tag.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_bubble_screen';

-- ── Double moves ─────────────────────────────────────────────────

update public.rag_documents set
  content = 'Receiver fakes outward (like a quick out) for 3-5 yards, then SHARPLY whips back inside on a slant angle. Misdirection — beats man when defender bites on the out fake.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_whip';

update public.rag_documents set
  content = 'Sell the quick out at 5 yds, then SHARPLY break vertical up the sideline. Beats corners who jump outs. Effective on the boundary.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_out_and_up';

update public.rag_documents set
  content = 'Stem 5 yds, fake the hitch (small ROUNDED settle), then release vertical at full speed. Beats off-coverage corners who break aggressively on the hitch.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_hitch_and_go';

-- Sluggo (slant-and-go) is conceptually the same as the Stop & Go template
-- in code; align the KB description so search_kb returns matching prose.
update public.rag_documents set
  content = 'Fake a slant for 2-3 steps, then SHARPLY break vertical. Beats man defenders and Cover 3 corners who jump the slant. Best after a slant has hit earlier in the game. Same family as hitch-and-go and stop-and-go.',
  needs_review = false
where scope='global' and topic='scheme' and subtopic='route_sluggo';
