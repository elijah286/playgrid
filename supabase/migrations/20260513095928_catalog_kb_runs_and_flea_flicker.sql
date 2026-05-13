-- Catalog-derived KB seed — re-apply with run + Flea Flicker concept
-- chunks (2026-05-13).
--
-- Same pattern as 20260512183000_catalog_kb_concept_chunks.sql: this
-- is a TIMESTAMPED RE-APPLY of `0200_catalog_kb_seed.sql` so the
-- DELETE + INSERT body runs once more on remote and picks up the new
-- concept chunks (Sweep, Dive, Counter, Draw, Flea Flicker) that
-- landed in the 2026-05-13 catalog extension. Supabase tracks
-- migrations by filename — re-running `db push` against the
-- regenerated 0200 file would be a silent no-op because 0200 is
-- already in remote's migration history.
--
-- THIS FILE IS GENERATED (then re-saved with this header). Source:
-- src/domain/play/catalogKb.ts (buildCatalogKbChunks). Regenerate the
-- base file with `npx tsx scripts/build-catalog-kb.ts`, then copy
-- to a fresh timestamped filename for re-apply on remote.
--
-- Strategy (AGENTS.md Rule 6 — KB direction of truth):
--   Catalogs are the single source of truth for catalog-derived
--   topics (route_*, defense_*, concept_*). This migration is
--   idempotent: it DELETEs every row with source='catalog' and
--   re-inserts the fresh set. Hand-authored KB content
--   (source='seed', 'admin_chat', etc.) is unaffected.

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
  ('global', null, 'scheme', 'route_curl', 'Route: Curl', 'Vertical stem then a ROUNDED ~180° turn back toward the QB, settling in a soft spot in the zone (route tree #6). Canonical depth varies by use: traditional pro-style Curl runs 10-12 yds vertical, settling at ~9 yds; SHORT Curls (5-7 yds vertical, settling at ~5 yds) are the underneath in Curl-Flat / Flood concepts. The catalog accepts ANY depth in [4, 13] — a coach asking for a 7-yard curl is asking for the short variant, not a deviation. The break is a smooth turn-back, NOT a sharp corner — receiver decelerates, faces the QB, and finishes with a slight inside lean toward the middle. Reliable vs zone — find the window between defenders.
Depth: 4-13 yards from the LOS.
Direction: breaks inside, toward the QB / middle of the field.
Break shape: rounded.
Also called: Hook.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Curl).', true, false),
  ('global', null, 'scheme', 'route_dig', 'Route: Dig', 'Vertical 12-15 yards then a SHARP 90° break to the inside (toward the QB / middle), finishing across the middle (route tree #4). Beats man and zone — sits in the window between LB depth and safety depth. Foundation of dig-post and levels concepts.
Depth: 10-16 yards from the LOS.
Direction: breaks inside, toward the QB / middle of the field.
Break shape: sharp.
Also called: Square-In.', null, null, 'catalog', 'Generated from src/domain/play/routeTemplates.ts (Dig).', true, false),
  ('global', null, 'scheme', 'route_drag', 'Route: Drag', 'Shallow crossing route — receiver takes a 1-yard inside release then crosses the formation on a SMOOTH NEARLY-HORIZONTAL ARC at 3-5 yds depth (canonical default ~3yd; can deepen to 7-8yd via depthYds for the OVER drag in a Mesh). The cross itself is at a very shallow angle (~2-3° from horizontal) — the receiver gains essentially no depth as he travels laterally; he is NOT climbing diagonally and the path is NOT a rigid straight line. Coaches reading the diagram should see a HORIZONTAL line across the formation that VISIBLY clears the OL row, not crammed against the LOS. Foundation of mesh, drive, and shallow-cross concepts. Beats man coverage — the defender has to fight through traffic that the offense''s other routes generate underneath.
Depth: 1-9 yards from the LOS.
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
Coverage mode: man.
Zones: Deep middle (FS).', 'tackle_11', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (3-4 / Cover 1 / tackle_11).', true, false),
  ('global', null, 'scheme_defense', 'defense_46_bear_cover_1_tackle_11', 'Defense: 46 Bear — Cover 1', 'Bear front — 4 down with both DTs in 3-techs, both DEs wide, strong safety walked into the box. Cover 1 behind it — single-high FS, everyone else man. Crushes the run.
Personnel: 11 defenders.
Coverage mode: man.
Zones: Deep middle (FS).', 'tackle_11', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (46 Bear / Cover 1 / tackle_11).', true, false),
  ('global', null, 'scheme_defense', 'defense_4_3_over_cover_2_tackle_11', 'Defense: 4-3 Over — Cover 2', '4-3 Over front with Cover 2 shell — two safeties splitting the deep halves, corners squat in the flats, three LBs in hook/middle zones.
Personnel: 11 defenders.
Coverage mode: zone.
Zones: Deep 1/2 L, Deep 1/2 R, Flat L, Hook L, Hook M, Hook R, Flat R.', 'tackle_11', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (4-3 Over / Cover 2 / tackle_11).', true, false),
  ('global', null, 'scheme_defense', 'defense_4_3_over_cover_3_tackle_11', 'Defense: 4-3 Over — Cover 3', '4-3 Over with the 3-tech to the strong (right) side, Sam walked out over the TE. Cover 3 shell — corners take deep thirds, free safety in the deep middle, three LBs underneath.
Personnel: 11 defenders.
Coverage mode: zone.
Zones: Deep 1/3 L, Deep 1/3 M, Deep 1/3 R, Flat L, Hook L, Hook M, Flat R.', 'tackle_11', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (4-3 Over / Cover 3 / tackle_11).', true, false),
  ('global', null, 'scheme_defense', 'defense_4_4_stack_cover_1_tackle_11', 'Defense: 4-4 Stack — Cover 1', '8-in-the-box 4-4 with man-free behind it — corners and the 4 LBs in man on the 5 eligible receivers (slot/TE/RB), single-high FS over the top. Aggressive run-support look that asks the LBs to cover backs/TEs man-up.
Personnel: 11 defenders.
Coverage mode: man.
Zones: Deep middle (FS).', 'tackle_11', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (4-4 Stack / Cover 1 / tackle_11).', true, false),
  ('global', null, 'scheme_defense', 'defense_4_4_stack_cover_3_tackle_11', 'Defense: 4-4 Stack — Cover 3', 'Classic 8-in-the-box youth/HS run defense — 4 down linemen + 4 linebackers (Will, Mike, Buck, Sam) + 3 DBs (2 corners, 1 deep safety in Cover 3). Two ILBs stack directly behind the DTs; two OLBs play just outside the DEs. Heavy run support; vulnerable to spread passing because there are only 3 DBs to cover 4-5 receivers.
Personnel: 11 defenders.
Coverage mode: zone.
Zones: Deep 1/3 L, Deep 1/3 M, Deep 1/3 R, Flat L, Hook L, Hook R, Flat R.', 'tackle_11', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (4-4 Stack / Cover 3 / tackle_11).', true, false),
  ('global', null, 'scheme_defense', 'defense_5v5_man_cover_1_flag_5v5', 'Defense: 5v5 Man — Cover 1', '5v5 man — four defenders in man on the four skill players, one free safety deep.
Personnel: 5 defenders.
Coverage mode: man.
Zones: Deep middle (FS).', 'flag_5v5', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (5v5 Man / Cover 1 / flag_5v5).', true, false),
  ('global', null, 'scheme_defense', 'defense_5v5_zone_cover_3_flag_5v5', 'Defense: 5v5 Zone — Cover 3', '5v5 zone shell — 3 deep (two corners + free safety) and 2 underneath (flat/hook on each side).
Personnel: 5 defenders.
Coverage mode: zone.
Zones: Flat L, Flat R, Deep 1/3 L, Deep 1/3 M, Deep 1/3 R.', 'flag_5v5', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (5v5 Zone / Cover 3 / flag_5v5).', true, false),
  ('global', null, 'scheme_defense', 'defense_6v6_man_cover_0_flag_6v6', 'Defense: 6v6 Man — Cover 0', '6v6 Cover 0 — every defender in pure man, no deep help. Edge rusher disrupts the QB; used to bait an aggressive throw or on critical down/distance.
Personnel: 6 defenders.
Coverage mode: man.
Assignment-based — defenders track receivers.', 'flag_6v6', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (6v6 Man / Cover 0 / flag_6v6).', true, false),
  ('global', null, 'scheme_defense', 'defense_6v6_man_cover_1_flag_6v6', 'Defense: 6v6 Man — Cover 1', '6v6 man-free — four defenders in man on the four skill receivers, one free safety deep, edge rusher off the line.
Personnel: 6 defenders.
Coverage mode: man.
Zones: Deep middle (FS).', 'flag_6v6', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (6v6 Man / Cover 1 / flag_6v6).', true, false),
  ('global', null, 'scheme_defense', 'defense_6v6_zone_cover_2_flag_6v6', 'Defense: 6v6 Zone — Cover 2', '6v6 Cover 2 — two safeties split the deep halves, three underneath in zones (two flats + a middle hook), edge rusher off the line.
Personnel: 6 defenders.
Coverage mode: zone.
Zones: Flat L, Hook M, Flat R, Deep 1/2 L, Deep 1/2 R.', 'flag_6v6', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (6v6 Zone / Cover 2 / flag_6v6).', true, false),
  ('global', null, 'scheme_defense', 'defense_6v6_zone_cover_3_flag_6v6', 'Defense: 6v6 Zone — Cover 3', '6v6 zone shell — 3 deep (two corners + free safety), 2 underneath (flat/hook on each side), edge rusher off the line.
Personnel: 6 defenders.
Coverage mode: zone.
Zones: Flat L, Flat R, Deep 1/3 L, Deep 1/3 M, Deep 1/3 R.', 'flag_6v6', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (6v6 Zone / Cover 3 / flag_6v6).', true, false),
  ('global', null, 'scheme_defense', 'defense_7v7_man_cover_0_flag_7v7', 'Defense: 7v7 Man — Cover 0', '7v7 Cover 0 — every defender in pure man, no deep help. Rare, used to bait an aggressive throw or on critical down/distance.
Personnel: 7 defenders.
Coverage mode: man.
Assignment-based — defenders track receivers.', 'flag_7v7', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (7v7 Man / Cover 0 / flag_7v7).', true, false),
  ('global', null, 'scheme_defense', 'defense_7v7_man_cover_1_flag_7v7', 'Defense: 7v7 Man — Cover 1', '7v7 man-free — six defenders in man on the six skill receivers, single-high FS over the top.
Personnel: 7 defenders.
Coverage mode: man.
Zones: Deep middle (FS).', 'flag_7v7', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (7v7 Man / Cover 1 / flag_7v7).', true, false),
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
Coverage mode: zone.
Zones: Deep 1/4, Deep 1/4, Deep 1/4, Deep 1/4, Hook L, Hook M, Flat R.', 'tackle_11', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (Nickel (4-2-5) / Cover 4 (Quarters) / tackle_11).', true, false),
  ('global', null, 'scheme_offense', 'concept_bubble_rpo', 'Concept: Bubble RPO', 'Run-pass option built on Inside Zone with a bubble screen tag. The OL run-blocks; the back takes the Inside Zone path; a slot receiver releases on a bubble (lateral release, settling 0–2 yds behind the LOS); the QB reads the conflict defender (typically the playside OLB / overhang). If the conflict defender comes down to fill the run, the QB pulls and throws the bubble — the slot has the perimeter outflanked. If the defender stays out to play the bubble, the QB gives and the back hits a 5-on-5 box. Modern HS / college / NFL staple.
Complexity: advanced.
Requires a back carrying the ball (inside_zone).
Requires the QB to read a key defender and choose give vs throw at the snap.
Also called: Bubble Screen RPO, RPO Bubble, Inside Zone Bubble.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Bubble RPO).', true, false),
  ('global', null, 'scheme_offense', 'concept_counter', 'Concept: Counter', 'Misdirection run. The back jab-steps strong-side to hold the LBs, then takes the handoff going BACK weak-side behind pulling blockers (typically the backside guard + tackle). The ''counter'' is the defense''s pursuit moving the wrong way. Best vs defenses that flow hard to initial back action.
Complexity: intermediate.
Requires a back carrying the ball (counter).
Requires 1 ball-handling exchange(s) (multi-handoff misdirection — reverses, fakes).
Also called: Counter Trey, Counter GT, Counter OF.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Counter).', true, false),
  ('global', null, 'scheme_offense', 'concept_curl_flat', 'Concept: Curl-Flat', 'High-low read on the flat defender. Outside receiver runs a SHORT curl (~5 yds, settling at the soft spot just past the LBs); slot or back releases to the flat at 0-3 yds. The flat defender can''t cover both — sit on one and the QB throws the other.
Complexity: basic.
Also called: Curl/Flat, Hook-Flat.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Curl-Flat).', true, false),
  ('global', null, 'scheme_offense', 'concept_dagger', 'Concept: Dagger', 'Inside receiver runs a Seam (vertical clear, 14+ yds) to clear the deep safety; outside receiver runs a DEEP DIG at 14-16 yds in the void the seam created. Modern NFL shot play — the seam pulls the safety, the dig hits the soft spot behind the LB and in front of the safety''s vacated zone. Best vs single-high coverage.
Complexity: advanced.
Also called: Dagger Concept.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Dagger).', true, false),
  ('global', null, 'scheme_offense', 'concept_dive', 'Concept: Dive', 'North-south interior run. QB hands to the back attacking the A/B gap downhill — first available crease wins. OL inside-zone-blocks (or pin-and-pull for a power flavor). Stays on schedule, eats clock, and softens up a stout interior for the play-action that follows.
Complexity: basic.
Requires a back carrying the ball (inside_zone / trap / power).
Requires 1 ball-handling exchange(s) (multi-handoff misdirection — reverses, fakes).
Also called: Inside Dive, Iso, Lead Dive.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Dive).', true, false),
  ('global', null, 'scheme_offense', 'concept_draw', 'Concept: Draw', 'Late-developing interior run that sells pass first. The OL pass-sets to draw the rush upfield; receivers run hitches / verts to widen the coverage; QB drops back, then hands LATE to the back hitting the soft middle vacated by the rush. Best on obvious passing downs against rush-heavy fronts.
Complexity: intermediate.
Requires a back carrying the ball (draw).
Requires 1 ball-handling exchange(s) (multi-handoff misdirection — reverses, fakes).
Also called: RB Draw, Lead Draw.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Draw).', true, false),
  ('global', null, 'scheme_offense', 'concept_drive', 'Concept: Drive', 'Two crossers attacking the middle at differentiated depths — Drag UNDER (2-4 yds) and Dig OVER (10-14 yds). The under-drag rubs through traffic; the dig settles in the void behind the LBs. Beats man (rub on releases) and zone (dig sits in the hole). Often paired with a backside clear.
Complexity: intermediate.
Also called: Drive Concept.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Drive).', true, false),
  ('global', null, 'scheme_offense', 'concept_flea_flicker', 'Concept: Flea Flicker', 'Trick play that sells run, then attacks deep. QB hands to a back / WR going forward to the LOS; that player runs hard as if rushing, then PITCHES the ball BACK to the QB still behind the LOS. The defense has already triggered on the run fake; deep receivers clear out and find the void behind the now-collapsing safeties. Two backwards passes / handoffs, one deep throw. Best after the run game has been established — the defense has to believe the fake.
Complexity: advanced.
Requires 2 ball-handling exchange(s) (multi-handoff misdirection — reverses, fakes).
The ball returns to its original handler — typically the QB pitches forward, the carrier runs as if rushing, then pitches BACK to the QB behind the LOS, who then throws downfield. Defining trick-play structure (Flea Flicker, Hook-and-Lateral, Halfback Option).
Also called: Flicker, Halfback Flicker, WR Flicker.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Flea Flicker).', true, false),
  ('global', null, 'scheme_offense', 'concept_flood', 'Concept: Flood', 'Three receivers stretching ONE SIDE of the field at THREE depths — Corner deep (12-18 yds), Out at the second level (7-10 yds), Flat low (0-4 yds, typically the RB to the flood side). All on the SAME SIDE so the cornerback (high-low) and the flat defender are both stretched. Forces a single underneath defender to pick one. Beats Cover 3 and most rotated zones. Erhardt-Perkins / pro-style staple.
Complexity: intermediate.
Also called: Sail, Flood Concept, Sail Concept.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Flood).', true, false),
  ('global', null, 'scheme_offense', 'concept_four_verticals', 'Concept: Four Verticals', 'FOUR receivers run vertical, stretching every coverage deep. The two outside WRs run Go routes; the two inside players (slot + TE, or two slots) run Seams to split the safeties. The concept LITERALLY requires four vertical routes — a play with only two verts is NOT ''4 verts'', it''s a different concept (e.g. seam-flood, dagger). Beats Cover 2 (4 verts vs 2 deep), Cover 3 (seams threaten the FS), and any single-high look.
Complexity: intermediate.
Also called: Four Verts, 4 Verts, Verticals.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Four Verticals).', true, false),
  ('global', null, 'scheme_offense', 'concept_jet_reverse', 'Concept: Jet Reverse', 'Multi-handoff misdirection. QB takes the snap and hands to the back (or jet-motion receiver) running toward one side; the back/jet then hands the ball back to the weak-side receiver coming around from the opposite direction. Two exchanges, three ball-handlers. The whole defense flows to the initial fake; the reverse runner attacks the vacated weak side. Best when the defense is over-pursuing the run game and your perimeter blockers (slot, weak-side WR) can seal the cornerback.
Complexity: intermediate.
Requires 2 ball-handling exchange(s) (multi-handoff misdirection — reverses, fakes).
Also called: Reverse, Reverse Jet, End-Around Reverse.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Jet Reverse).', true, false),
  ('global', null, 'scheme_offense', 'concept_levels', 'Concept: Levels', 'Two crossing in-breaking routes at TWO LEVELS — low In at 6-8 yds and high Dig at 12-14 yds, both breaking inside on the same side. High-low stretches the underneath LB. LB sinks under the dig = throw the low In; LB drives short = throw the dig. Indianapolis Colts (Manning era) staple.
Complexity: intermediate.
Also called: Levels Concept.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Levels).', true, false),
  ('global', null, 'scheme_offense', 'concept_mesh', 'Concept: Mesh', 'Two crossing drags that ''mesh'' past each other at differentiated depths — one UNDER (~2 yds) and one OVER (~7-8 yds). The depth differentiation + meaningful absolute depth is what makes them mesh visibly: same depth = collision; close depths = visually-collided in the chat preview; both crammed at the LOS = invisible cross. Cal MUST set depthYds explicitly on each drag (e.g. 2 and 8) so the over-drag passes CLEARLY ABOVE the under-drag with unambiguous visible separation. Natural pick / rub action vs man, finds soft spots in zone.
Complexity: basic.
Also called: Mesh Concept.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Mesh).', true, false),
  ('global', null, 'scheme_offense', 'concept_qb_draw', 'Concept: QB Draw', 'Designed QB run from shotgun. The OL pass-sets to sell pass; receivers run pass routes (hitches / verts) to widen and pull the defense; the QB hesitates as if reading, then runs straight through the soft middle. Best against rush-heavy fronts on obvious passing downs — coverage drops, the box is light, the QB takes the easy yards.
Complexity: basic.
Requires the QB carrying the ball (draw / qb_keep).
Also called: Quarterback Draw, QB Lead Draw.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (QB Draw).', true, false),
  ('global', null, 'scheme_offense', 'concept_smash', 'Concept: Smash', 'High-low corner-flat combo. Outside receiver runs a hitch / short curl (4-6 yds) underneath; inside receiver / TE runs a corner (12-15 yds) over the top. Beats Cover 2 — the corner takes the flat receiver, the safety can''t cover the corner.
Complexity: basic.
Also called: Smash Concept.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Smash).', true, false),
  ('global', null, 'scheme_offense', 'concept_snag', 'Concept: Snag', 'Three-receiver triangle. Inside slot runs the ''snag'' (spot route at 5-6 yds, settling); outside runs a corner over the top; back to the flat. Triangle stretches the flat defender high-low AND the corner inside-out.
Complexity: intermediate.
Also called: Snag Concept, Spot Concept.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Snag).', true, false),
  ('global', null, 'scheme_offense', 'concept_stick', 'Concept: Stick', '3rd-down staple. Inside receiver / slot runs a sit at 5-6 yds (the ''stick''); outside receiver clears with a fade or go; back releases to the flat. High-low on the flat defender — same idea as curl-flat but uses a SIT instead of a curl (more deliberate settle).
Complexity: basic.
Also called: Stick Concept.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Stick).', true, false),
  ('global', null, 'scheme_offense', 'concept_sweep', 'Concept: Sweep', 'Wide perimeter run. QB hands to the back, who attacks the edge with the OL pulling or reaching playside. The back''s footwork is patient-then-fast: read the kick-out block, then turn vertical when the corner is sealed. Best vs over-aligned interior fronts where the perimeter is light.
Complexity: basic.
Requires a back carrying the ball (sweep / outside_zone).
Requires 1 ball-handling exchange(s) (multi-handoff misdirection — reverses, fakes).
Also called: Outside Sweep, Toss Sweep, Stretch.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Sweep).', true, false),
  ('global', null, 'scheme_offense', 'concept_y_cross', 'Concept: Y-Cross', 'TE/Y runs a DEEP crosser at 14-16 yds, paired with a deep clear-out (Post or Go) on top and a flat/drag underneath. Triangle stretch — high (clear), medium (deep cross), low (flat) on the same side. QB reads the safety, then the LB. Beats man and zone equally. Air Raid + West Coast staple.
Complexity: advanced.
Also called: Y Cross, Y-Cross Concept.', null, null, 'catalog', 'Generated from src/domain/play/conceptCatalog.ts (Y-Cross).', true, false)
;
