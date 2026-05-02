-- Catalog-derived KB seed.
-- 
-- THIS FILE IS GENERATED. Do not edit by hand.
-- Source: src/domain/play/catalogKb.ts (buildCatalogKbChunks).
-- Regenerate: `npx tsx scripts/build-catalog-kb.ts`.
-- 
-- Strategy (AGENTS.md Rule 6 — KB direction of truth):
--   Catalogs are the single source of truth for catalog-derived
--   topics (route_*, defense_*). This migration is idempotent:
--   it DELETEs every row with source='catalog' and re-inserts the
--   fresh set. Hand-authored KB content (source='seed', 'admin',
--   etc.) is unaffected.

delete from public.rag_documents where source = 'catalog';

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values
  ('global', null, 'scheme', 'route_arrow', 'Route: Arrow', 'RB or slot releases on a CLEAN DIAGONAL toward the flat at a shallow angle (~25° from horizontal). Mostly lateral with a small upfield component — finishes ~2-3 yds deep, ~10 yds out (tackle_11 reference). No break, no settle. Outlet for the QB and a natural high-low partner with a sit/curl over the top.
Depth: 1-5 yards from the LOS.
Direction: breaks outside, toward the sideline.
Break shape: none.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Arrow).', true, false),
  ('global', null, 'scheme', 'route_bubble_screen', 'Route: Bubble', 'Receiver releases BACKWARD and outside in a ROUNDED banana arc — apex is 2-3 yds behind the LOS — then arcs forward toward the sideline to catch a quick lateral pass. The deep apex is what makes this a BUBBLE (vs a now screen, which catches at the LOS). Other receivers block downfield. Common RPO tag and quick-perimeter answer.
Depth: -4-1 yards from the LOS.
Direction: breaks outside, toward the sideline.
Break shape: rounded.
Also called: Bubble Screen.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Bubble).', true, false),
  ('global', null, 'scheme', 'route_comeback', 'Route: Comeback', 'Vertical 12-13 yards then a ROUNDED break back at ~45° toward the sideline, settling at ~10 yds depth (route tree #5). ''Comeback'' refers to coming back DOWN in depth, not toward the QB — it''s a sideline route. Stops the clock. Defender must drive forward — comeback wins on the cushion.
Depth: 9-14 yards from the LOS.
Direction: breaks outside, toward the sideline.
Break shape: rounded.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Comeback).', true, false),
  ('global', null, 'scheme', 'route_corner', 'Route: Corner', 'Vertical 11-12 yards then a SHARP 45°-above-horizontal break outside toward the back pylon (route tree #7). Beats Cover 2 (corner sits flat) and Cover 4 (corner stays inside on outside #1). Often the high in a smash concept.
Depth: 10-18 yards from the LOS.
Direction: breaks outside, toward the sideline.
Break shape: sharp.
Also called: Flag.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Corner).', true, false),
  ('global', null, 'scheme', 'route_curl', 'Route: Curl', 'Vertical 10-12 yards then a ROUNDED ~180° turn back toward the QB, settling in a soft spot in the zone at ~9 yds depth (route tree #6). The break is a smooth turn-back, NOT a sharp corner — receiver decelerates, faces the QB, and finishes with a slight inside lean toward the middle. Reliable vs zone — find the window between defenders.
Depth: 8-13 yards from the LOS.
Direction: breaks inside, toward the QB / middle of the field.
Break shape: rounded.
Also called: Hook.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Curl).', true, false),
  ('global', null, 'scheme', 'route_dig', 'Route: Dig', 'Vertical 12-15 yards then a SHARP 90° break to the inside (toward the QB / middle), finishing across the middle (route tree #4). Beats man and zone — sits in the window between LB depth and safety depth. Foundation of dig-post and levels concepts.
Depth: 10-16 yards from the LOS.
Direction: breaks inside, toward the QB / middle of the field.
Break shape: sharp.
Also called: Square-In.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Dig).', true, false),
  ('global', null, 'scheme', 'route_drag', 'Route: Drag', 'Shallow crossing route — receiver takes a 1-yard inside release then crosses the formation on a SMOOTH NEARLY-HORIZONTAL ARC at 1.5-2 yds depth. The cross itself is at a very shallow angle (~2-3° from horizontal) — the receiver gains essentially no depth as he travels laterally; he is NOT climbing diagonally and the path is NOT a rigid straight line. Coaches reading the diagram should see a HORIZONTAL line across the formation, not an angled one. Foundation of mesh, drive, and shallow-cross concepts. Beats man coverage — the defender has to fight through traffic that the offense''s other routes generate underneath.
Depth: 1-4 yards from the LOS.
Direction: breaks inside, toward the QB / middle of the field.
Break shape: none.
Also called: Shallow, Shallow Cross.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Drag).', true, false),
  ('global', null, 'scheme', 'route_fade', 'Route: Fade', 'Vertical release with a ROUNDED outside arc toward the sideline (no hard break). Ball thrown back-shoulder or up-and-away. Red-zone staple — defender can''t recover when the throw is placed up-and-away. Usually a tall WR vs a short DB.
Depth: 10-22 yards from the LOS.
Direction: breaks outside, toward the sideline.
Break shape: rounded.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Fade).', true, false),
  ('global', null, 'scheme', 'route_flat', 'Route: Flat', 'Receiver releases on a NEARLY HORIZONTAL path directly to the sideline at 0-2 yds depth — gains very little depth as he travels laterally (the route is FLAT — that''s literally the name). Common RB or slot route paired with a curl/corner/sit over the top to high-low the flat defender. The path may arc slightly as the receiver flattens out from the snap angle, but it should NEVER read as a steep climbing diagonal.
Depth: 0-4 yards from the LOS.
Direction: breaks outside, toward the sideline.
Break shape: none.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Flat).', true, false),
  ('global', null, 'scheme', 'route_go', 'Route: Go', 'Straight vertical sprint downfield (route tree #9). No break — full-speed release, accelerate upfield, ball thrown over the top. Stretches the defense vertically. Best vs single-high coverage with no deep help.
Depth: 10-25 yards from the LOS.
Direction: stays vertical (no significant lateral commit).
Break shape: none.
Also called: Fly, Streak, Vertical, 9.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Go).', true, false),
  ('global', null, 'scheme', 'route_hitch', 'Route: Hitch', '5-yard vertical release then a ROUNDED quick turn back toward the QB, settling at 4-5 yds with a slight inside lean (route tree #1). The turn-back is a smooth settle, not a sharp corner. Beats off-coverage instantly. Quick-game staple.
Depth: 3-6 yards from the LOS.
Direction: breaks inside, toward the QB / middle of the field.
Break shape: rounded.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Hitch).', true, false),
  ('global', null, 'scheme', 'route_hitch_and_go', 'Route: Stop & Go', 'Stem 5 yds, fake the hitch (small ROUNDED settle), then release vertical at full speed. Beats off-coverage corners who break aggressively on the hitch. Same family as sluggo (slant-and-go).
Depth: 12-25 yards from the LOS.
Direction: stays vertical (no significant lateral commit).
Break shape: multi.
Also called: Sluggo, Hitch and Go.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Stop & Go).', true, false),
  ('global', null, 'scheme', 'route_in', 'Route: In', 'Vertical 8 yards then a SHARP 90° break to the inside (toward the QB / middle of the field). Shallower than a Dig — sits in front of the LBs / under the safeties. Common quick-game intermediate vs zone.
Depth: 6-10 yards from the LOS.
Direction: breaks inside, toward the QB / middle of the field.
Break shape: sharp.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (In).', true, false),
  ('global', null, 'scheme', 'route_out', 'Route: Out', 'Vertical 10 yards then a SHARP 90° break toward the sideline (route tree #3). Stops the clock — common late-game call. Vulnerable to a jumping cornerback if undisguised.
Depth: 8-12 yards from the LOS.
Direction: breaks outside, toward the sideline.
Break shape: sharp.
Also called: Square-Out.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Out).', true, false),
  ('global', null, 'scheme', 'route_out_and_up', 'Route: Out & Up', 'Sell the quick out at 5 yds, then SHARPLY break vertical up the sideline. Beats corners who jump outs. Effective on the boundary.
Depth: 10-22 yards from the LOS.
Direction: breaks outside, toward the sideline.
Break shape: multi.
Also called: Out and Up.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Out & Up).', true, false),
  ('global', null, 'scheme', 'route_post', 'Route: Post', 'Vertical 11-12 yards then a SHARP 45°-above-horizontal break inside toward the goalpost / middle of the field (route tree #8). Beats single-high (Cover 1, Cover 3) when the safety bites, and beats Cover 2 between the safeties. Pair with a deep crosser to clear the safety.
Depth: 10-18 yards from the LOS.
Direction: breaks inside, toward the QB / middle of the field.
Break shape: sharp.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Post).', true, false),
  ('global', null, 'scheme', 'route_quick_out', 'Route: Quick Out', '5-yard out — vertical then SHARP 90° break to the sideline at full speed (no break-down). Catches at 4-5 yds. Beats off-man, stops the clock, gets the ball out fast vs pressure.
Depth: 4-7 yards from the LOS.
Direction: breaks outside, toward the sideline.
Break shape: sharp.
Also called: Speed Out.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Quick Out).', true, false),
  ('global', null, 'scheme', 'route_seam', 'Route: Seam', 'Vertical sprint from a slot or TE alignment, splitting the deep safeties. No hard break — slight inside release, then sustained vertical. Beats Cover 2 (gap between safeties) and Cover 4 (vertical the safety can''t carry). Foundation route in 4 verts.
Depth: 10-25 yards from the LOS.
Direction: stays vertical (no significant lateral commit).
Break shape: none.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Seam).', true, false),
  ('global', null, 'scheme', 'route_skinny_post', 'Route: Skinny Post', 'Vertical 10 yards then a SHALLOW inside break (~70° above horizontal — much closer to vertical than a true 45° post). Beats Cover 3 between the corner and the deep middle safety. Common as the pass option in inside-zone RPOs.
Depth: 10-18 yards from the LOS.
Direction: breaks inside, toward the QB / middle of the field.
Break shape: sharp.
Also called: Glance.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Skinny Post).', true, false),
  ('global', null, 'scheme', 'route_slant', 'Route: Slant', '3-yard vertical stem then a SHARP 25°-above-horizontal cut across the middle (angle measured from horizontal — mostly lateral with a shallow upfield lean, NOT a steep vertical-leaning break). Catches at 5-6 yds depth, having gained 5-7 yds laterally (route tree #2). Beats press man (inside leverage fast) and Cover 2 (slant fits between underneath defenders).
Depth: 3-7 yards from the LOS.
Direction: breaks inside, toward the QB / middle of the field.
Break shape: sharp.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Slant).', true, false),
  ('global', null, 'scheme', 'route_snag', 'Route: Spot', 'Receiver releases inside on a slight angle, then SETTLES with a small ROUNDED turn-back facing the QB at 5-6 yds depth in a soft spot in the zone. The settle is what defines this route — it is NOT a clean diagonal that ends; the receiver finishes by stopping and squaring up to the QB so he''s a ready target. More deliberate than a hitch (longer angled release, deeper sit). Often the inside route in a snag concept (with corner over and flat under).
Depth: 3-7 yards from the LOS.
Direction: breaks inside, toward the QB / middle of the field.
Break shape: rounded.
Also called: Snag.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Spot).', true, false),
  ('global', null, 'scheme', 'route_stick', 'Route: Sit', 'Vertical stem to 5-6 yards, then a small ROUNDED settle facing the QB (the receiver stops and turns back). Foundation of the stick concept (with a flat underneath and a clear over the top). Quick-game staple, 3rd-and-medium reliable.
Depth: 3-7 yards from the LOS.
Direction: breaks inside, toward the QB / middle of the field.
Break shape: rounded.
Also called: Stick.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Sit).', true, false),
  ('global', null, 'scheme', 'route_wheel', 'Route: Wheel', 'RB or slot releases flat to the sideline (~3 yds depth, ~6 yds out), then ROUNDS UP and runs vertical along the sideline (the rounded turnup is the wheel). Beats LBs in man coverage who can''t run with a back. Common pair with a deep crosser to clear the safety.
Depth: 10-22 yards from the LOS.
Direction: breaks outside, toward the sideline.
Break shape: rounded.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Wheel).', true, false),
  ('global', null, 'scheme', 'route_whip', 'Route: Whip', 'Receiver fakes outward (like a quick out) for 3-5 yards, then SHARPLY whips back inside on a slant angle. Misdirection — beats man when defender bites on the out fake. The ''whip'' refers to the inside snap-back, finishing toward the QB.
Depth: 4-8 yards from the LOS.
Direction: breaks inside, toward the QB / middle of the field.
Break shape: multi.
Also called: Whip-In.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Whip).', true, false),
  ('global', null, 'scheme_defense', 'defense_3_4_cover_1_tackle_11', 'Defense: 3-4 — Cover 1', 'Three down linemen (NT head-up, two DEs over the tackles), four LBs (two ILBs and two OLBs as edge rushers/setters). Cover 1 — single-high FS, everyone else man.
Personnel: 11 defenders.
Coverage mode: mixed/unspecified.', 'tackle_11', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (3-4 / Cover 1 / tackle_11).', true, false),
  ('global', null, 'scheme_defense', 'defense_46_bear_cover_1_tackle_11', 'Defense: 46 Bear — Cover 1', 'Bear front — 4 down with both DTs in 3-techs, both DEs wide, strong safety walked into the box. Cover 1 behind it — single-high FS, everyone else man. Crushes the run.
Personnel: 11 defenders.
Coverage mode: mixed/unspecified.', 'tackle_11', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (46 Bear / Cover 1 / tackle_11).', true, false),
  ('global', null, 'scheme_defense', 'defense_4_3_over_cover_2_tackle_11', 'Defense: 4-3 Over — Cover 2', '4-3 Over front with Cover 2 shell — two safeties splitting the deep halves, corners squat in the flats, three LBs in hook/middle zones.
Personnel: 11 defenders.
Coverage mode: mixed/unspecified.', 'tackle_11', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (4-3 Over / Cover 2 / tackle_11).', true, false),
  ('global', null, 'scheme_defense', 'defense_4_3_over_cover_3_tackle_11', 'Defense: 4-3 Over — Cover 3', '4-3 Over with the 3-tech to the strong (right) side, Sam walked out over the TE. Cover 3 shell — corners take deep thirds, free safety in the deep middle, three LBs underneath.
Personnel: 11 defenders.
Coverage mode: mixed/unspecified.', 'tackle_11', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (4-3 Over / Cover 3 / tackle_11).', true, false),
  ('global', null, 'scheme_defense', 'defense_4_4_stack_cover_1_tackle_11', 'Defense: 4-4 Stack — Cover 1', '8-in-the-box 4-4 with man-free behind it — corners and the 4 LBs in man on the 5 eligible receivers (slot/TE/RB), single-high FS over the top. Aggressive run-support look that asks the LBs to cover backs/TEs man-up.
Personnel: 11 defenders.
Coverage mode: man.
Assignment-based — defenders track receivers.', 'tackle_11', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (4-4 Stack / Cover 1 / tackle_11).', true, false),
  ('global', null, 'scheme_defense', 'defense_4_4_stack_cover_3_tackle_11', 'Defense: 4-4 Stack — Cover 3', 'Classic 8-in-the-box youth/HS run defense — 4 down linemen + 4 linebackers (Will, Mike, Buck, Sam) + 3 DBs (2 corners, 1 deep safety in Cover 3). Two ILBs stack directly behind the DTs; two OLBs play just outside the DEs. Heavy run support; vulnerable to spread passing because there are only 3 DBs to cover 4-5 receivers.
Personnel: 11 defenders.
Coverage mode: zone.
Zones: Deep 1/3 L, Deep 1/3 M, Deep 1/3 R, Flat L, Hook L, Hook R, Flat R.', 'tackle_11', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (4-4 Stack / Cover 3 / tackle_11).', true, false),
  ('global', null, 'scheme_defense', 'defense_5v5_man_cover_1_flag_5v5', 'Defense: 5v5 Man — Cover 1', '5v5 man — four defenders in man on the four skill players, one free safety deep.
Personnel: 5 defenders.
Coverage mode: man.
Assignment-based — defenders track receivers.', 'flag_5v5', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (5v5 Man / Cover 1 / flag_5v5).', true, false),
  ('global', null, 'scheme_defense', 'defense_5v5_zone_cover_3_flag_5v5', 'Defense: 5v5 Zone — Cover 3', '5v5 zone shell — 3 deep (two corners + free safety) and 2 underneath (flat/hook on each side).
Personnel: 5 defenders.
Coverage mode: mixed/unspecified.', 'flag_5v5', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (5v5 Zone / Cover 3 / flag_5v5).', true, false),
  ('global', null, 'scheme_defense', 'defense_7v7_man_cover_0_flag_7v7', 'Defense: 7v7 Man — Cover 0', '7v7 Cover 0 — every defender in pure man, no deep help. Rare, used to bait an aggressive throw or on critical down/distance.
Personnel: 7 defenders.
Coverage mode: man.
Assignment-based — defenders track receivers.', 'flag_7v7', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (7v7 Man / Cover 0 / flag_7v7).', true, false),
  ('global', null, 'scheme_defense', 'defense_7v7_man_cover_1_flag_7v7', 'Defense: 7v7 Man — Cover 1', '7v7 man-free — six defenders in man on the six skill receivers, single-high FS over the top.
Personnel: 7 defenders.
Coverage mode: man.
Assignment-based — defenders track receivers.', 'flag_7v7', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (7v7 Man / Cover 1 / flag_7v7).', true, false),
  ('global', null, 'scheme_defense', 'defense_7v7_zone_cover_2_flag_7v7', 'Defense: 7v7 Zone — Cover 2', '7v7 Cover 2 — two safeties split the deep halves, five underneath in zones (two flats, three hooks).
Personnel: 7 defenders.
Coverage mode: zone.
Zones: Flat L, Hook L, Hook M, Hook R, Flat R, Deep 1/2 L, Deep 1/2 R.', 'flag_7v7', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (7v7 Zone / Cover 2 / flag_7v7).', true, false),
  ('global', null, 'scheme_defense', 'defense_7v7_zone_cover_3_flag_7v7', 'Defense: 7v7 Zone — Cover 3', 'Standard 7v7 zone shell. 3 deep (corners + free safety), 4 underneath (two flat, two hook).
Personnel: 7 defenders.
Coverage mode: zone.
Zones: Flat L, Hook L, Hook R, Flat R, Deep 1/3 L, Deep 1/3 M, Deep 1/3 R.', 'flag_7v7', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (7v7 Zone / Cover 3 / flag_7v7).', true, false),
  ('global', null, 'scheme_defense', 'defense_7v7_zone_cover_4_flag_7v7', 'Defense: 7v7 Zone — Cover 4', '7v7 Quarters — four deep defenders each take a quarter of the field, three underneath. Strong vs verticals; soft underneath.
Personnel: 7 defenders.
Coverage mode: zone.
Zones: Curl/Flat L, Hook M, Curl/Flat R, Deep 1/4, Deep 1/4, Deep 1/4, Deep 1/4.', 'flag_7v7', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (7v7 Zone / Cover 4 / flag_7v7).', true, false),
  ('global', null, 'scheme_defense', 'defense_7v7_zone_tampa_2_flag_7v7', 'Defense: 7v7 Zone — Tampa 2', '7v7 Tampa 2 — Cover 2 shell with the middle hook (M) carrying any vertical down the deep middle. Effectively a 3-deep, 4-under look out of a 2-high disguise.
Personnel: 7 defenders.
Coverage mode: zone.
Zones: Flat L, Hook L, Hook R, Flat R, Deep 1/2 L, Deep mid (M), Deep 1/2 R.', 'flag_7v7', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (7v7 Zone / Tampa 2 / flag_7v7).', true, false),
  ('global', null, 'scheme_defense', 'defense_nickel_4_2_5_cover_4_quarters_tackle_11', 'Defense: Nickel (4-2-5) — Cover 4 (Quarters)', 'Modern nickel front — 4 down, 2 ILBs, 5 DBs (nickel/STAR replaces a LB over the slot). Cover 4 quarters: corners and safeties each take a deep quarter, three underneath.
Personnel: 11 defenders.
Coverage mode: mixed/unspecified.', 'tackle_11', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (Nickel (4-2-5) / Cover 4 (Quarters) / tackle_11).', true, false)
;
