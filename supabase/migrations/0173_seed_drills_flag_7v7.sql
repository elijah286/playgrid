-- Coach AI KB — Drills for Flag 7v7.
-- 7-on-7 typically passing-only (no run game in most leagues), larger field
-- than 5v5, more defenders allows zone schemes, often used as offseason
-- training for tackle teams (Pylon, OT7, etc.) and as its own competition.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  age_tier, authoritative, needs_review
) values

-- ============ 7v7-SPECIFIC PRINCIPLES ============

('global', null, 'drill', 'flag_7v7_principles',
 '7v7 coaching principles',
 '7v7 differs from 5v5 in 4 ways: (1) PASSING ONLY in most leagues — no run game; (2) 4-second pass clock common (Pylon) vs 7-second (NFL Flag); (3) 7-on-7 = 1 QB + 5 receivers + 1 RB / center, vs 7 defenders (3 LBs, 4 DBs typically); (4) field is longer/wider, opening deep concepts.
Implication: route running and QB reads are the entire game. Prioritize pass concepts (Hi-Lo, Mesh, Smash, 4-Verts), zone-busting, and clock-disciplined throws. Defenses run pattern-match to handle the volume.',
 'flag_7v7', null, 'seed', 'Pylon 7v7 / OT7 coaching standards',
 null, false, true),

('global', null, 'drill', 'flag_7v7_4_second_clock',
 '4-second pass clock training',
 'Setup: QB in shotgun with 5 WRs running a route concept (e.g. Stick).
Reps: coach yells "go!" and counts down "4-3-2-1" out loud. Ball MUST leave hand by 1 or it''s a sack. 12 throws.
Coaching points: 7v7 demands rhythm. By "3" the QB must be at the top of the drop, eyes on the read. By "2" the throw is in motion. There is no scramble in pure 7v7 — pre-snap reads + decisive release.',
 'flag_7v7', null, 'seed', 'Pylon 7v7 4-second rule',
 'tier3_12_14', false, true),

-- ============ PASS CONCEPT DRILLS ============

('global', null, 'drill', 'flag_7v7_stick_concept',
 'Stick concept (7v7)',
 'Setup: 3 WRs to one side. Outside WR runs a hitch at 6, slot WR runs a stick (curl-out at 6 yards), inside WR runs a flat at 3.
Reps: 8 reps vs varied coverage.
Coaching points: stick is the Cover 3 / Cover 2 killer. QB read: cloud corner = throw flat; wide cushion = throw hitch; dropping LB = throw stick. Stick (the slot route) is the staple — most catches happen here. Drill the slot WR''s stem first.',
 'flag_7v7', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'flag_7v7_mesh_concept',
 'Mesh concept (7v7)',
 'Setup: two slot/inside WRs run shallow crossers at 5 yards, "meshing" at the middle. Outside WRs run posts or gos.
Reps: 8 reps. Defense runs man and zone.
Coaching points: mesh kills man coverage — natural rub at the cross. Vs zone, the QB throws to whoever sits down in space. Receivers must cross AT 5 yards EXACTLY — too deep and they collide; too shallow and they''re both covered by the same defender.',
 'flag_7v7', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'flag_7v7_smash_concept',
 'Smash concept (7v7)',
 'Setup: outside WR runs hitch at 6, slot WR runs corner from 5-yard depth.
Reps: 8 reps vs cover 2.
Coaching points: smash = corner-hitch combo. Beats cover 2 because the corner is in front of the safety, who has to choose. QB reads safety: safety widens = throw hitch underneath; safety stays = throw corner over the top. Slot WR''s break point is exactly 12 yards.',
 'flag_7v7', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'flag_7v7_4_verts',
 '4 verticals (7v7)',
 'Setup: 4 receivers (2 outside WR + 2 slot WR) all running vertical routes. Outside WR run go (sideline), slot WR run seam.
Reps: 8 reps.
Coaching points: 4-verts beats single-high coverage (Cover 1, Cover 3) because the seams attack the safety. QB read: 1-high safety = throw the seam to weak side; 2-high = throw outside go ball with cushion. Slot WRs must STAY skinny (off the hash) to widen the safety.',
 'flag_7v7', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'flag_7v7_hi_lo',
 'Hi-Lo concept (7v7)',
 'Setup: outside WR runs dig at 12, slot WR runs shallow cross at 5 (under the dig).
Reps: 8 reps vs zone.
Coaching points: high-low stretches a single defender vertically. QB read: where is the LB/safety? Drops underneath dig = throw the dig; sits flat = throw the shallow cross. Most-flexible 3rd-and-medium concept; works at every level.',
 'flag_7v7', null, 'seed', null,
 'tier3_12_14', false, true),

-- ============ DEFENSIVE 7v7 DRILLS ============

('global', null, 'drill', 'flag_7v7_pattern_match_intro',
 'Pattern-match coverage intro',
 'Setup: 3 WRs to one side, 3 defenders.
Reps: 5-6 reps with varied route combinations.
Coaching points: pattern match rules: deepest defender takes deepest threat. Underneath defender takes shallowest threat. If routes cross (mesh), defenders pass off ("you take 2, I take 3"). Communication is everything — defenders must call out routes pre-snap and post-route. Most 7v7 zone busts come from a missed handoff.',
 'flag_7v7', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'flag_7v7_man_match_drill',
 'Man-match (combo coverage) drill',
 'Setup: 3 WRs vs 3 defenders. Two outside DBs in man, slot DB rolls to flat — pattern-match concept.
Reps: 6 reps.
Coaching points: man-match handles motion well — the defender follows the receiver until route declares, then peels into zone if route goes outside his rule. Tier-4 concept. For tier-3, run straight man instead.',
 'flag_7v7', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'flag_7v7_lb_drop_zone',
 'LB zone drop progression',
 'Setup: 3 LBs (curl, hook, curl), QB throws to receivers running varied routes.
Reps: 8 reps. LBs drop to spots, eyes on QB, react on throw.
Coaching points: in 7v7, LBs are the most-targeted defenders (no run game means they live in coverage). Drop depth: 10-12 yards. Eyes on QB''s shoulders, NOT on routes. React on throw, break to ball. Drill the head-on-a-swivel: scan receivers in your zone but lock eyes on QB.',
 'flag_7v7', null, 'seed', null,
 'tier3_12_14', false, true),

-- ============ ROUTE PRECISION DRILLS ============

('global', null, 'drill', 'flag_7v7_depth_precision',
 'Route depth precision (cone drill)',
 'Setup: cones at 5/8/10/12/15 yards from LOS. WR runs route, must break AT the cone exactly.
Reps: 12 routes — 2 each at every depth. Coach grades: hit cone exactly = 1 pt, miss by 1 yd = 0 pts.
Coaching points: 7v7 throws are timed. 1 yard short of depth = INT. 1 yard deep = late throw. Drill until it''s automatic. Use a stopwatch on top of the depth grade — the route must finish at the right depth AND right time.',
 'flag_7v7', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'flag_7v7_release_release',
 'WR release vs trail technique',
 'Setup: WR vs DB in inside-leverage trail technique (DB shadows the inside hip).
Reps: WR runs random route. Goal: get separation at the break.
Coaching points: vs trail technique, OUTSIDE breaks are easier (DB has to flip hips). Inside breaks need a HARDER vertical sell first. Drill the head/eyes on the break — DBs read your eyes more than your feet.',
 'flag_7v7', null, 'seed', null,
 'tier4_hs', false, true),

-- ============ COMPETITION DRILLS ============

('global', null, 'drill', 'flag_7v7_routes_on_air',
 '7-on-air route timing',
 'Setup: full offense + scout cards. No defense. 4-second clock.
Reps: full play scripts of 12-15 plays, run 2-3 times per practice.
Coaching points: builds QB-WR timing without defensive reaction. Coach grades: did the throw and break happen at the same instant? Is the depth right? Is the QB''s release on time?',
 'flag_7v7', null, 'seed', null,
 null, false, true),

('global', null, 'drill', 'flag_7v7_competition_period',
 '7v7 competition period',
 'Setup: full O vs full D, 30-yard field. Refs or coaches call rules.
Reps: 4-down series, score = 1 pt, defensive stop (incomplete + sack) = 1 pt for D, INT = 2 pt for D. Run 6 series.
Coaching points: keeps defense engaged (often the bored side in 7v7). Track stats. Best concept = highest TD %; least-effective concept = drop or play-call problem? Diagnose weekly.',
 'flag_7v7', null, 'seed', null,
 null, false, true),

('global', null, 'drill', 'flag_7v7_2_min',
 '2-minute drill (7v7)',
 'Setup: ball at midfield, 2:00 on the clock, 1 timeout. Down by 4 (need TD).
Reps: full no-huddle drive. End-state: TD or fail.
Coaching points: 7v7 has no run game so 2-min is pure no-huddle pass. Tempo + spike management. Practice this WEEKLY in offseason — this is the situation that often decides 7v7 tournaments.',
 'flag_7v7', null, 'seed', null,
 'tier4_hs', false, true),

-- ============ TIER-2 (9-11) 7v7 SIMPLIFICATIONS ============

('global', null, 'drill', 'flag_7v7_tier2_simplified',
 'Tier-2 7v7 simplified install',
 'For ages 9-11, dial back to 4 concepts total: stick, slant-flat, smash (corner-hitch), 4-verts. Defense: cover 3 only. Reps over install variety.
Drill priority: catching, route depth (cones), reading leverage. Skip pattern-match and combo coverages — too complex.
Note: 7v7 at this age is rare in leagues; usually a tournament/clinic format. Treat it as skill development, not competition.',
 'flag_7v7', null, 'seed', null,
 'tier2_9_11', false, true);
