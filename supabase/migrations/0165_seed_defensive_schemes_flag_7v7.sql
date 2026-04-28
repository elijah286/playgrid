-- Coach AI KB — 7v7 flag-football-specific defensive scheme entries.
-- Fills the gap that the global (NFL-flavored) `coverage_*` entries from
-- migration 0145 leave for Cal: when a coach asks "what beats Tampa 2",
-- Cal was returning NFL bodies ("MLB sprints to deep middle", "Buccaneers
-- staple") and disclaiming that the concept doesn't apply to flag. It does
-- — the read mechanic transfers, the labels just change. These entries
-- restate the major defensive concepts in 7v7 vocabulary (no pass rush,
-- defenders labeled CB/N/M/S/W/FS/SS) and tie each one to specific
-- offensive concepts already in the KB (Smash, Y-Cross, Four Verts, etc.)
-- so retrieval surfaces actionable matchup advice.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── Tampa 2 / Tampa 2 read ─────────────────────────────────────────
('global', null, 'scheme', 'defense_tampa_2',
 'Flag 7v7 — Coverage: Tampa 2 (Cover 2 with middle-hole carry)',
 'Two safeties play deep halves, but the middle hook defender (M / "Mike") sprints/carries any vertical down the middle instead of settling at 10 yards — effectively a 3-deep, 4-under shell out of a Cover 2 disguise. In 7v7 there''s no MLB to rob the seam, so the M takes that job. Pre-snap looks identical to Cover 2 (two safeties at 10-12 yds, corners squatting flats). Strong vs Smash, Curl-Flat, four verts (the seam isn''t open). Vulnerable to: anything that pulls the M out before #2 runs vertical (shallow cross, mesh, dig under), and any concept that holds both safeties (double post, deep crossers).',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_tampa_2_read',
 'Flag 7v7 — Concept: Tampa 2 read (how the middle defender keys it)',
 'The "read" half of Tampa 2 is the M''s rule: eyes on #2 to the strong side at the snap. If #2 runs a vertical or seam, the M turns and runs with him to the deep middle. If #2 runs flat/short, the M stays in the hook zone. Same key works in 7v7 even though there''s no rush — the M just has more depth available because they''re not lined up in the box. Coaches should drill this as a single key: "see #2, run with #2 vertical." Tells the M apart from a true zone Cover 2 where they''d sit at 10 yards regardless.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'offense_attack_tampa_2',
 'Flag 7v7 — Attacking Tampa 2 (best offensive answers)',
 'Tampa 2 covers four verts and Smash cleanly because the M carries the seam. Best answers: (1) Y-Cross or shallow-cross concepts that pull the M off his vertical key with a fast crosser before the #2 vertical develops; (2) Mesh — the two crossers force the M to commit one way and leave a hole the other; (3) Double dig / deep cross — both safeties get held, M can''t cover the inside breaking route 12 yards downfield; (4) Smash-7 with a fade-out instead of a corner — fade beats the squatting CB and the safety can''t cap deep over both seams plus the fade; (5) Levels (slant + dig) — the slant pulls the underneath defender, the dig sits behind them under the M. Avoid pure four-verts and pure Smash without a window-dresser.',
 'flag_7v7', null, 'seed', null, true, false),

-- ── Cover 2 (true) — distinct from Tampa 2 ─────────────────────────
('global', null, 'scheme', 'defense_cover_2_attack',
 'Flag 7v7 — Attacking Cover 2 (pure two-deep, five-under)',
 'Pure Cover 2 (M does NOT carry the seam) is vulnerable to anything that splits the safeties or stresses the seam. Best answers: (1) Four Verts — both seams (#2 and #3) split the safeties; one is open; (2) Smash-7 (corner-flat read) — corner route holes the safety high, flat route holes the CB low; (3) Seam-flat combo — #2 vertical pulls the safety, flat behind the squatting CB; (4) Double post — the inside post splits the two safeties down the middle. The way to tell pure C2 from Tampa 2 pre-snap is hard — reveal it post-snap by running #2 vertical and watching whether M carries (Tampa 2) or settles (true C2).',
 'flag_7v7', null, 'seed', null, true, false),

-- ── Cover 0 (no safety) ────────────────────────────────────────────
('global', null, 'scheme', 'defense_cover_0',
 'Flag 7v7 — Coverage: Cover 0 (all-man, no deep help)',
 'Every coverage defender is in man with no deep safety. In 7v7 (no rush) this is rare and risky — the only reason to call it is to bait an aggressive throw or to bracket-and-key-blitz on a critical down. Vulnerable to ANY double-move (slant-and-go, sluggo, post-corner), rub/pick concepts (mesh, snag), and bunch releases. Best answers: (1) double-move on the outside; (2) mesh or snag from bunch — the natural rub frees one receiver; (3) wheel route from the backfield/slot — the underneath defender can''t turn and run with depth. Identify it pre-snap by NO defender at safety depth.',
 'flag_7v7', null, 'seed', null, true, false),

-- ── Pattern match / Solo / Trips checks ────────────────────────────
('global', null, 'scheme', 'defense_solo_trips',
 'Flag 7v7 — Coverage: Solo / "Special" check vs trips (3x1)',
 'Quarters check vs a trips set: the safety to the trips side takes #3 vertical alone (no inside help). Frees the backside safety to bracket the lone backside receiver (#1). Combats the trips offensive answer of running #3 down the seam. Recognizable post-snap: backside safety drifts toward the single receiver instead of staying centered. Vulnerable to: backside isolation routes that beat the bracket (hitch-and-go, slant-and-go), and trips-side concepts that send #2 deep instead of #3 (the safety bites on #3, #2 has no help).',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_match_quarters',
 'Flag 7v7 — Coverage: Match Quarters (pattern-match Cover 4)',
 'Cover 4 shell pre-snap; defenders convert to man on specific route distributions. Standard rules: corner stays man on #1; safety reads #2 — if #2 goes vertical, safety carries him; if #2 runs short/flat, safety helps over #1 (becomes a bracket). Underneath defenders (M/S/W) read crossers and sit under digs. Strong vs four verts (everyone gets matched), Smash (safety squats on the corner route), and isolated #1 routes (bracketed). Vulnerable to: shallow crossers that drag underneath defenders out of position, double moves on #1 (corner has no help if safety jumped #2''s short route), and any concept that makes the safety wrong on his #2 read.',
 'flag_7v7', null, 'seed', null, true, false),

-- ── Cover 3 variants ───────────────────────────────────────────────
('global', null, 'scheme', 'defense_cover_3_sky',
 'Flag 7v7 — Coverage: Cover 3 Sky (safety down to flat)',
 'Cover 3 rotation where a safety drops late to the strong-side flat (the "sky" call) and the strong-side corner takes the deep third over the top. Disguises as Cover 2 (two-high pre-snap) and rotates at the snap. Strong vs strong-side run/screen and Smash (safety arrives in the flat fast). Vulnerable to: backside isolation routes (the rotated-away corner is now alone with no safety help), and play-action that holds the rotating safety (deep corner is open behind a half-rotated defense).',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_cover_3_cloud',
 'Flag 7v7 — Coverage: Cover 3 Cloud (corner stays in flat)',
 'Cover 3 where the strong-side CORNER stays in the flat (the "cloud" call) and the safety rotates over the top to take the deep third. Inverse of Sky. Lets a smaller corner support short routes while the safety covers deep. Strong vs Curl-Flat and quick game outside. Vulnerable to: deep comeback or fade by the outside receiver — the rotating safety is late getting overtop, and the corner is sitting in the flat. Also vulnerable to seams behind the corner who is no longer covering deep.',
 'flag_7v7', null, 'seed', null, true, false),

-- ── Disguise & pre-snap reads ──────────────────────────────────────
('global', null, 'scheme', 'defense_pre_snap_keys',
 'Flag 7v7 — Pre-snap coverage keys (how to read the defense)',
 'Reading 7v7 coverage from the line: (1) Two safeties at equal depth (10-12 yds) and centered → Cover 2 / Tampa 2 / Quarters. Distinguish by what M does post-snap. (2) One deep safety in the middle of the field (MOFC) → Cover 1 or Cover 3. Distinguish by what the corners do — squat-and-react = Cover 3, trail in man = Cover 1. (3) Two safeties asymmetric — one closer to a sideline → split-field Cover 6 (quarters one side, C2 other). (4) NO deep safety pre-snap → Cover 0 (man, no help) — attack with double-moves or rubs. (5) Safety creeping toward the LOS pre-snap → likely a rotation; bait it with motion to force the declare.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_motion_declare',
 'Flag 7v7 — Using motion to declare the coverage',
 'Pre-snap motion is the cleanest way to identify the coverage in 7v7. (1) Send a slot/back across the formation. If a defender follows him man-to-man (turns and travels) → man coverage (Cover 1 or Cover 0). If defenders pass him off (no defender travels) → zone (Cover 2/3/4). (2) Watch the safeties on motion: if a safety rotates to the motion side → coverage is rolling (Cover 3 Sky or Cloud). If they stay symmetric → two-high zone holding. Use motion every 2-3 plays even when not designing the play around it — it''s the cheapest information you can buy.',
 'flag_7v7', null, 'seed', null, true, false),

-- ── Concept-vs-coverage cheat sheet ────────────────────────────────
('global', null, 'scheme', 'offense_concept_vs_coverage',
 'Flag 7v7 — Concept-vs-coverage cheat sheet',
 'Quick matchup table for play-calling: vs Cover 1 (man + 1 deep) → mesh, snag, double-moves, slants, bunch rubs. vs Cover 2 (two-deep zone, M sits) → four verts, Smash-7, double post, seam-flat. vs Tampa 2 (M carries seam) → Y-Cross, mesh, levels, deep dig. vs Cover 3 (one deep middle) → flood/sail, all-curls, smash, four verts (the two seams are open vs single-high). vs Cover 4 / Quarters → all-curls, drive (shallow + dig), Y-stick (anything underneath the squatting safeties). vs Cover 0 (no safety) → double-moves, mesh, snag, wheel from backfield. vs Match Quarters → shallow crossers, double moves on #1, anything that makes the safety wrong on his #2 read.',
 'flag_7v7', null, 'seed', null, true, false),

-- ── Bunch/stack vs man and zone ────────────────────────────────────
('global', null, 'scheme', 'offense_bunch_vs_coverage',
 'Flag 7v7 — Bunch/stack vs man and zone',
 'Bunch and stack formations expose man and bracket coverages because the natural traffic at the LOS forces defenders into rubs and pick-offs (legal as long as receivers don''t intentionally block). Vs Cover 1 / Cover 0 (man), bunch concepts like Snag, Smash, Spot, and Mesh-from-bunch are extremely high-percentage — at least one receiver gets a free release. Vs zone, bunch loses some of its edge because defenders are reading their landmarks, not chasing receivers; against zone, motion the bunch out into trips or doubles before the snap so you''re attacking the zone with route distribution instead of rubs.',
 'flag_7v7', null, 'seed', null, true, false);
