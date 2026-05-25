-- Coach AI KB — Flag 4v4 expansion to parity with 5v5/7v7.
--
-- Adds ~100 chunks across 8 sections so Cal can ANSWER 4v4 questions with
-- the same depth as the other variants. (Composition plumbing — synthesizer,
-- catalog, concept skeletons — is intentionally NOT part of this migration;
-- that lives in code and ships separately. This migration is KB-only.)
--
-- Sections:
--   A. Sanctioning-body / league rule variants  (~10)
--   B. Expanded play concepts                   (~15)
--   C. Expanded defenses & coverages            (~10)
--   D. Position fundamentals — deep dive        (~25)
--   E. Drills by category                       (~20)
--   F. Game management & sideline               (~10)
--   G. Age-tier specifics                       (~5)
--   H. Safety & equipment                       (~5)
--
-- Tail: promote 0103 core rules from needs_review→authoritative=true. Those
-- rows have been in production since migration 0103 (well before 5v5/7v7 hit
-- production), have been spot-checked, and Cal needs authoritative content
-- to cite confidently.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  age_tier, authoritative, needs_review
) values

-- ─────────────────────────────────────────────────────────────────
-- A. Sanctioning-body / league rule variants
-- ─────────────────────────────────────────────────────────────────

('global', null, 'rules', 'sanctioning_i9_sports',
 'Flag 4v4 — i9 Sports ruleset',
 'i9 Sports is the largest national 4v4 youth flag football league (ages 5-8 Pee Wee). Hallmarks: 4 v 4 on a 30×60 yd field with two 10-yd end zones; no rush (QB has unlimited time); 30-second pass clock; coach on the field for the youngest age groups; 3 downs to midfield, 3 to score; no punts; designed runs allowed outside the 5-yd no-run zones; everyone is an eligible receiver; play stops on a flag pull, step out, or ball-touching-ground.',
 'flag_4v4', 'i9_sports', 'seed', 'NFL FLAG-affiliated youth program; rules vary slightly by franchise', 'tier1_5_8', true, false),

('global', null, 'rules', 'sanctioning_nfl_flag_youth',
 'Flag 4v4 — NFL FLAG youth program',
 'NFL FLAG''s official competition is 5v5, but their youth/entry-level program at the 5-7 age band uses a 4v4 format mirroring i9. Field is the league standard (40×30 with 10-yd end zones, or smaller). One rusher allowed at older youth levels from 7 yards. Forward passes only; one play, one pass; receiver must be past the LOS to catch. Some NFL FLAG youth chapters use 4v4 only for the youngest division, others use 4v4 across multiple age bands.',
 'flag_4v4', 'nfl_flag', 'seed', 'NFL FLAG operates 5v5 as their primary; 4v4 appears in youth divisions of affiliated leagues', 'tier1_5_8', true, false),

('global', null, 'rules', 'sanctioning_upward',
 'Flag 4v4 — Upward Sports ruleset',
 'Upward Sports runs church-based and rec-league flag football, common 4v4 in K-2 divisions. Hallmarks: no rush, no score-keeping at youngest ages (focus on participation), every player must touch the ball within X plays (varies), coach on the field, 4-down sets, end-zone fades discouraged, mandatory equal playing time. Skill development is the explicit priority over winning. Practices typically 1×/week + game.',
 'flag_4v4', 'upward', 'seed', 'Upward Sports', 'tier1_5_8', true, false),

('global', null, 'rules', 'sanctioning_iflag',
 'Flag 4v4 — iFlag ruleset',
 'iFlag is one of the few national bodies that runs 4v4 as a *primary* competitive format (not just youth-entry). Their 4v4 rules differ from i9/NFL FLAG: rush from 7 yards is standard, 5-second pass clock when no rush, all three eligibles (no center) is the canonical roster, field is 25×40 with 5-yd end zones. Used in adult competitive 4v4 leagues.',
 'flag_4v4', 'iflag', 'seed', 'iFlag — competitive 4v4 organization', null, true, false),

('global', null, 'rules', 'sanctioning_ymca',
 'Flag 4v4 — YMCA / parks-and-rec defaults',
 'YMCA and municipal parks-and-rec leagues typically use 4v4 at the K-2 level with hyper-simplified rules: no rush, no first downs (4 downs to score, then turn over), all-touch rotation (each kid must touch the ball at least every 3 plays), short field (25×35 or smaller). Rules vary wildly by city — always verify with the specific league before coaching.',
 'flag_4v4', 'ymca', 'seed', 'Generic rec-league pattern', 'tier1_5_8', true, false),

('global', null, 'rules', 'sanctioning_differences_summary',
 'Flag 4v4 — Comparing the major sanctioning bodies',
 'Quick reference for the most variable rules across 4v4 leagues: (1) Roster — i9/NFL FLAG often have a center, iFlag uses 3 eligibles no center; (2) Rush — i9/Upward/YMCA no rush, iFlag rush from 7y, NFL FLAG youth varies; (3) Field size — ranges from 25×35 (YMCA rec) to 40×60 (i9); (4) Designed runs — allowed in i9 outside no-run zones, often banned at youngest YMCA levels; (5) Coach on field — common at 5-6 age, never at 8+. Always read the local rulebook.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'rules', 'field_variants',
 'Flag 4v4 — Field size variants',
 'Common 4v4 field sizes seen across leagues: 25×30 (smallest YMCA rec), 25×40 (iFlag standard), 30×40 (most common Upward), 30×60 (i9 standard, similar to 5v5), 40×80 (NFL FLAG youth on a shared 5v5 field with 4v4 markings). End-zone depth is usually 5 or 10 yards. Smaller field = shorter routes (top out 8-10 yds), faster decisions, less scrambling.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'rules', 'rush_variants',
 'Flag 4v4 — Pass rush variants',
 'The single most variable rule between 4v4 leagues. Three patterns: (1) NO rush — most youth/rec leagues, QB has unlimited time, pass clock 5-7s; (2) DESIGNATED rusher from a marked distance (5y or 7y from LOS), one designated rusher per play, announced by official; (3) BLITZ from the LOS allowed for one defender after the ball is snapped (uncommon in 4v4). Always confirm the league''s rush rule before installing protections or QB scramble rules.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'rules', 'scoring_variants',
 'Flag 4v4 — Scoring variants',
 'Standard 4v4 scoring: TD = 6, PAT 1pt from 5y, PAT 2pt from 10y, defensive INT-for-TD = 6, defensive PAT-return-on-2pt-try = 2 (some leagues). Safeties uncommon (no run game on most setups, short fields). Some YMCA/Upward leagues do not keep score at youngest divisions — focus on participation. Tie-breakers vary: rec ties stand, tournament does coin-flip or sudden-death from short distance.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'rules', 'roster_variants',
 'Flag 4v4 — Roster conventions',
 'Two dominant 4v4 roster conventions: (A) QB + 3 receivers (no center, ball on the ground at the snap, QB picks it up) — most common at iFlag and many youth leagues; (B) QB + Center + 2 receivers — center snaps between legs and IS an eligible receiver. NFL FLAG youth typically (B). i9 typically (B). Upward/YMCA either. The 4v4 catalog adapts concept skeletons based on which convention the league uses.',
 'flag_4v4', null, 'seed', null, null, true, false),

-- ─────────────────────────────────────────────────────────────────
-- B. Expanded play concepts
-- ─────────────────────────────────────────────────────────────────

('global', null, 'scheme', 'play_fade',
 'Flag 4v4 — Play: Fade',
 'Outside receiver runs a corner-style vertical to the back-corner pylon. QB throws high and outside, away from the safety, only the receiver can get it. Best red-zone call in 4v4 — small field means deep routes are scarce, so the goal-line fade to your tallest WR is gold.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'play_out_and_up',
 'Flag 4v4 — Play: Out-and-up (double move)',
 'Receiver runs a hard 4-yd out for two steps then breaks vertical along the sideline. Sells the out to bait the DB to jump it. Single best double-move in 4v4 — easy footwork, defenders bite hard after a couple of called outs.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'play_wheel',
 'Flag 4v4 — Play: Wheel route',
 'Receiver releases flat (looks like a flat route) then turns upfield along the sideline (the "wheel"). In 4v4 typically run from a stack/bunch with the wheeling receiver pre-snap motioned across the formation. Beats man coverage with the speed mismatch on the turn.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'play_pick',
 'Flag 4v4 — Play: Pick concept',
 'Two receivers cross at a designed depth, with the "picker" running through the defender''s path (without contact). The "pickee" releases free into the open zone the pick vacated. LEGAL ONLY if no contact is initiated — referees will flag obvious pick plays. Best vs man coverage.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'play_drag_only',
 'Flag 4v4 — Play: All-drag concept',
 'All three eligibles run shallow crossing routes at varied depths (3, 5, 7 yds). Creates a moving target field — QB throws to whichever drag is most open. Very forgiving on QB accuracy and very kid-friendly. Beat-all-zones concept in tight spacing.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'play_hitch_flat',
 'Flag 4v4 — Play: Hitch-flat',
 'Outside receiver runs a 4-yd hitch (squat-and-turn), inside receiver releases to flat. Cousin of curl-flat with a shorter depth — designed for the absolute shortest field-position situations (3rd-and-2). QB delivers the hitch on rhythm; if covered, dump to flat.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'play_slant_out',
 'Flag 4v4 — Play: Slant-out combo',
 'Two-receiver combo: outside receiver runs a 5-yd out, inside receiver runs a 3-yd slant underneath. Inverted Levels concept — high-low on the underneath defender from the *other* angle. Hard for one defender to cover both.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'play_spot',
 'Flag 4v4 — Play: Spot route',
 'Receiver runs to a designated spot (e.g., 5 yds inside, 4 yds deep) and sits, working back to the QB. Other receivers run flat + clear. QB''s safety-valve concept — when nothing else opens, the spot is the bail-out throw. Great for first-year QBs.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'play_wraparound',
 'Flag 4v4 — Play: QB wraparound',
 'In leagues where QB can scramble, QB takes the snap and rolls out to one side, then pulls up and throws back across his body to a crosser on the opposite side. Stresses zone defenses that rotate to the roll. Highest-skill play in the 4v4 book — only install for older / experienced QBs.',
 'flag_4v4', null, 'seed', null, 'tier2_9_11', true, false),

('global', null, 'scheme', 'play_designed_scramble',
 'Flag 4v4 — Play: Designed QB scramble',
 'QB takes the snap, pump-fakes a quick game route, then runs the edge. Receivers act as decoy routes. In leagues where QB can advance the ball, this is the single highest-yardage play in the book. Sets up the QB keeper later in the game.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'play_jet_motion',
 'Flag 4v4 — Play: Jet motion',
 'A receiver motions full speed across the formation pre-snap. Three uses: (1) decoy — defense follows the motion, ball goes to a receiver on the opposite side; (2) handoff — QB hands or shovels to the motion player for an end-around; (3) wheel — motion player turns upfield post-snap. Identifies man vs zone (man follows motion, zone doesn''t).',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'play_quick_screen_motion',
 'Flag 4v4 — Play: Quick screen off motion',
 'Receiver motions toward the QB, who catches him with a quick shovel/screen pass behind the LOS. The two other eligibles release as legal screen blockers (no-contact leverage). Excellent counter to a hard rush in leagues that allow rushers — neutralizes the rush with a fast horizontal throw.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'play_choice_route',
 'Flag 4v4 — Play: Choice route',
 'A single receiver gets a "choice" — read the defender''s leverage and break to the open grass. Outside leverage = slant inside; inside leverage = out; soft cushion = hitch; tight cushion = go. Requires QB + WR to be on the same page. Install AFTER WRs understand defender leverage (week 4+).',
 'flag_4v4', null, 'seed', null, 'tier2_9_11', true, false),

('global', null, 'scheme', 'play_sit_routes',
 'Flag 4v4 — Play: Sit routes (vs zone)',
 'Each receiver runs to their assigned depth and sits in the open hole between defenders. QB scans for the first open sit and delivers. Works ONLY vs zone — vs man this is suicide. Pair with a pre-snap zone read (no movement after motion = zone) before calling.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'play_endzone_fade_special',
 'Flag 4v4 — Play: Goal-line fade special',
 'Inside the 5: tallest WR splits wide and runs a back-pylon fade. QB takes a one-step drop and throws the ball OUT of bounds at the corner — only the WR can catch it. Highest-success goal-line call. Drill the QB''s placement (high, outside, away from the safety) until automatic.',
 'flag_4v4', null, 'seed', null, null, true, false),

-- ─────────────────────────────────────────────────────────────────
-- C. Expanded defenses & coverages
-- ─────────────────────────────────────────────────────────────────

('global', null, 'scheme', 'defense_cover_0',
 'Flag 4v4 — Coverage: Cover 0 (all-out)',
 'No deep safety. Three man defenders + one rusher (in leagues that allow rush). Pure pressure call — the rusher must get home before the QB hits an open WR. Loses ugly if the rush doesn''t arrive. Save for a known critical down where the QB has tendencies to hold the ball.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'defense_cover_1',
 'Flag 4v4 — Coverage: Cover 1 (man-free)',
 'Three defenders play man, fourth defender is a free safety roaming the middle. Strong vs anything except mesh + bracket (the free safety can only help one side). Most-called coverage at the 9-11 tier — combines accountability of man with help over the top.',
 'flag_4v4', null, 'seed', null, 'tier2_9_11', true, false),

('global', null, 'scheme', 'defense_cover_4',
 'Flag 4v4 — Coverage: Cover 4 (quarters)',
 'Four defenders each take a deep quarter — overkill in 4v4 (4 deep defenders, 0 underneath) but used vs a known deep-shot team late in a half. Concedes everything underneath. Cycle out of it after one play; not a base coverage.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'defense_pattern_match',
 'Flag 4v4 — Coverage: Pattern-match',
 'Hybrid man-zone — defenders read the route distribution post-snap and pick up the most-threatening receiver in their area. Sounds advanced; in 4v4 it''s really "play zone until the receiver crosses you, then it''s man." Older youth (12-14) can run it; under 9, stay with pure zone.',
 'flag_4v4', null, 'seed', null, 'tier3_12_14', true, false),

('global', null, 'scheme', 'defense_disguise',
 'Flag 4v4 — Technique: Disguising coverage',
 'Show one alignment pre-snap, rotate to a different one at the snap. Example: line up in a 2-deep shell, then roll one safety down at the snap to become Cover 3. Confuses QB''s pre-snap read. Use AT MOST 1×/game with a young defense — the rotation breakdown rate is high.',
 'flag_4v4', null, 'seed', null, 'tier2_9_11', true, false),

('global', null, 'scheme', 'defense_roll_coverage',
 'Flag 4v4 — Technique: Roll coverage',
 'Two-safety shell pre-snap, then both safeties roll to the same side at the snap (often to the trips side). The away-side defender becomes the lone deep player. Strong vs unbalanced formations; gives up the back-side iso route. High-school technique adapted down — use at the oldest 4v4 tiers only.',
 'flag_4v4', null, 'seed', null, 'tier3_12_14', true, false),

('global', null, 'scheme', 'defense_anti_mesh',
 'Flag 4v4 — Adjustment: Anti-mesh',
 'When the offense runs mesh repeatedly: assign one defender as a "robber" sitting at 4-5 yards in the middle. He doesn''t cover anyone — he just intercepts the mesh crossing through. The other 3 defenders bracket the third receiver. Punishes the QB''s natural read on mesh.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'defense_anti_stack',
 'Flag 4v4 — Adjustment: Anti-stack',
 'Vs a stack formation, the back defender takes the OUTSIDE receiver (regardless of release direction), the front defender takes the INSIDE. Communicated with a pre-snap "stack" call. Prevents the natural rub that stacks generate.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'defense_anti_bunch',
 'Flag 4v4 — Adjustment: Anti-bunch',
 'Vs a bunch (3 receivers tight together), banjo the routes — defenders take the receiver assigned to their landmark (e.g., "I''ve got first out, you have first in, you have point"). Eliminates the bunch confusion. Drill weekly — bunch is the #1 offense ever in 4v4.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'defense_blitz_package',
 'Flag 4v4 — Technique: Blitz packages (rush leagues)',
 'In leagues that allow a rusher, vary who rushes: edge rusher from the open side, delay rusher (waits 1 count then bursts), slot rusher (defender over the slot rushes, safety rotates down). Mix it up — a static rusher is easy for the QB to anticipate.',
 'flag_4v4', null, 'seed', null, 'tier2_9_11', true, false),

-- ─────────────────────────────────────────────────────────────────
-- D. Position fundamentals — deep dive
-- ─────────────────────────────────────────────────────────────────

-- ── QB ──
('global', null, 'scheme', 'qb_footwork_basics',
 'Flag 4v4 — QB: Footwork basics',
 'Stance: feet shoulder width, weight on balls of feet, knees slightly bent. Set: catch the snap (or pick up off the ground in no-center leagues) with both hands at the belt. Step: front foot opens to the target side. Throw: full hip rotation, follow through across the body. Drill 100 reps of stance-set-step-throw per practice.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'qb_drops_in_4v4',
 'Flag 4v4 — QB: Drops',
 'In 4v4 with no rush, the QB''s "drop" is mostly mental — set feet, scan, deliver. With rush leagues, take a 3-step drop (count "1-2-3 throw") to create cushion. Avoid 5-step drops — the rush is too close to the LOS for a deep drop to matter in 4v4''s tight space.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'qb_eyes_discipline',
 'Flag 4v4 — QB: Eye discipline',
 'Look at receiver #1 for one count, then move eyes to #2. Don''t stare your throw — the safety/free defender reads QB eyes in 4v4. "Look-off" the deep route by glancing safety-side, then deliver to the underneath crosser. High-leverage skill once QBs hit ~10 years old.',
 'flag_4v4', null, 'seed', null, 'tier2_9_11', true, false),

('global', null, 'scheme', 'qb_ball_placement',
 'Flag 4v4 — QB: Ball placement',
 'Slant: low and in front, let WR run through it. Out: lead the receiver to the sideline, away from the defender. Hitch: ball at the WR''s upfield shoulder so he can turn upfield post-catch. Fade: high and outside, "back-shoulder if covered." Drill placement on a stationary target before adding routes.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'qb_presnap_recognition',
 'Flag 4v4 — QB: Pre-snap recognition',
 'Three reads BEFORE the snap: (1) Coverage — count safeties (0/1/2/no shell = man, 1-deep = Cover 3, 2-deep = Cover 2); (2) Leverage — which defender plays inside vs outside on which WR; (3) Pressure — any rusher creeping the LOS. Communicate at the line if the read demands an audible. Drill in shadow-tempo each practice.',
 'flag_4v4', null, 'seed', null, 'tier2_9_11', true, false),

('global', null, 'scheme', 'qb_scramble_in_4v4',
 'Flag 4v4 — QB: Scramble protocol',
 'When the called play breaks down (or rush gets home): step UP not back, scan for receivers who break off routes to come back, deliver underneath. WRs are coached to drift to open grass on scramble — they''re looking back. If nothing opens by count "5," dump it out of bounds or run (if QB can advance in your league).',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'qb_audible_rules',
 'Flag 4v4 — QB: Audibles & checks',
 'Keep it minimal: 2-3 max audibles for the season. Suggested: (1) "Tag-X" — switch the play to the same concept on the other side (mesh-tag, smash-tag); (2) "Quick" — kill the call and run all-hitches; (3) "Burst" — kill and run all-go. Audibles done by color/word so kids can remember. Drill weekly.',
 'flag_4v4', null, 'seed', null, 'tier2_9_11', true, false),

-- ── WR ──
('global', null, 'scheme', 'wr_stance_basics',
 'Flag 4v4 — WR: Stance and start',
 'Outside foot back, weight on the front foot, eyes upfield (not at the QB). When the ball moves, drive off the back foot — no false steps. Drill the stance against a wall: if you can''t take a clean first step, the stance is wrong. 50 starts per practice.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'wr_releases_three_types',
 'Flag 4v4 — WR: Three releases',
 'Three release types every 4v4 WR needs: (1) Speed release — sprint straight at the DB to get him backpedaling, then break; (2) Slant release — diagonal first step inside, threatens the slant immediately; (3) Head-fake release — fake the head/shoulders one way, break the other. Drill all three weekly. The defender''s leverage tells you which to use.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'wr_stem',
 'Flag 4v4 — WR: Selling the stem',
 'The "stem" is the part of the route before the break. A good stem makes every route look like a go — DB has to honor the threat of deep. Run vertical for 3-4 steps before any break (even if breaking at 4 yards). Eyes upfield, not at the breakpoint. Drill against air to build the habit.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'wr_breaks',
 'Flag 4v4 — WR: Breaks',
 'Snap-and-replace: at the break point, plant the OUTSIDE foot, snap the head to the QB, replace your weight onto the inside foot moving toward the new direction. Three components — plant, snap, replace — done in one motion. Sloppy breaks = drifted routes and defended balls. Drill on cones daily.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'wr_tracking_deep',
 'Flag 4v4 — WR: Tracking the deep ball',
 'Over-the-shoulder catch: turn your head to find the ball without breaking stride. Track it with eyes only — head turns are a 5% speed loss. Catch with hands at full extension. If you have to wait, slow your stride — never stop and reach back. Drill with QBs throwing deeper than feels comfortable.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'wr_catch_with_hands',
 'Flag 4v4 — WR: Catching with hands',
 'Hands form a diamond (thumbs together for chest-height balls) or pinkies together (above-shoulder balls). Catch out away from the body — body catches drop more often. Look the ball ALL the way into your hands before turning upfield. Drop drill: 50 right-hand-only catches, 50 left-hand-only, per practice.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'wr_yac',
 'Flag 4v4 — WR: After the catch (YAC)',
 'Catch, tuck, turn upfield, GO. The small 4v4 field means a 5-yard catch + 5-yard YAC = first down. Eyes on the closest defender, juke ONE direction only (no dancing). Protect the flag with the off-hand. Drill 1-on-1 in the open field: catch, plant, juke, go.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'wr_screen_leverage',
 'Flag 4v4 — WR: Screen leverage (legal block)',
 'No physical block is allowed in flag, but legal "leverage" — getting your body between defender and ball-carrier without contact — is the WR''s job on screens. Position yourself, force the defender to go around, never extend arms. Drill the angle: defender comes from outside-in, WR shades inside-out.',
 'flag_4v4', null, 'seed', null, null, true, false),

-- ── DB ──
('global', null, 'scheme', 'db_stance_basics',
 'Flag 4v4 — DB: Stance and start',
 'Press: feet shoulder width, weight balanced, eyes on WR''s belt. Off: feet wider, weight on the back foot, eyes on QB and WR splits. From either stance, first move is a clean backpedal — no false steps. Drill stance at every defensive period.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'db_backpedal',
 'Flag 4v4 — DB: Backpedal',
 'Stay low (hips below knees), short steps, arms move naturally (don''t pump). Eyes on the WR''s belt buckle (man) or QB (zone). The backpedal is wasted if the head bobs — stable head = stable eyes. 20 backpedal sets per practice, gradually adding direction changes.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'db_hip_flip',
 'Flag 4v4 — DB: Hip flip',
 'When the WR breaks vertical, open the hip toward the receiver in one motion — DON''T cross over. Hip flip = pivot on the BACK foot, swing the FRONT leg open. Crossover steps are the #1 source of beaten DBs in 4v4. Drill the flip in both directions, 20 reps per side.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'db_plant_break',
 'Flag 4v4 — DB: Plant and break',
 'When the WR breaks short (slant, hitch, out), the DB plants on the foot opposite the break direction and drives. WR goes left → DB plants on the right foot. The plant must be a single hard step, not a stutter. Drill on cones — DB starts backpedal, coach points direction, DB plants and breaks within 2 yards.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'db_reading_hips',
 'Flag 4v4 — DB: Reading hips',
 'A receiver''s hips tell you where they''re breaking. Eyes on the belt, peripheral on the head/shoulders. Hip drop = slant or hitch. Hip turn outside = out or corner. Hip stays square = go or post. Once kids learn this (10+), their reaction time cuts in half. Drill with shadow routes — WR runs without ball, DB calls the break aloud.',
 'flag_4v4', null, 'seed', null, 'tier2_9_11', true, false),

('global', null, 'scheme', 'db_ball_skills',
 'Flag 4v4 — DB: Ball skills',
 'When the ball is in the air, attack it — don''t play receiver. Hands up at the highest point, eyes on the laces. Two strategies: PBU (slap the ball down) or INT (catch it high). Drill 50 high-point catches per week — the same form as a WR''s contested catch.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'db_flag_pull_technique',
 'Flag 4v4 — DB: Flag-pull technique',
 'Break down (small choppy steps) 2 yards from the carrier. Eyes on the flag, not the body. Grab with the hand opposite the runner''s direction (carrier running right → reach with left). Two hands when possible. Never lunge — a missed lunge = 15 free yards.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'db_pursuit_angles',
 'Flag 4v4 — DB: Pursuit angles',
 'When you''re the chaser (not the cover man), take an angle that intersects the runner''s future path, not his current spot. Aim for the point where you and he will meet. Drill the angle: coach releases a ball-carrier, DB starts 10 yards behind and to the side, must catch by the goal line.',
 'flag_4v4', null, 'seed', null, null, true, false),

-- ── Center (variants with center) ──
('global', null, 'scheme', 'center_snap_eligible',
 'Flag 4v4 — Center: Snap and eligibility',
 'In rosters with a center: snap the ball between the legs to the QB (1-3 yards back, shotgun). Maintain ball control through the snap — no fumbles. Immediately after the snap, the center is an ELIGIBLE receiver and can run a route. Most common center route: 3-yd flat or quick hitch as a safety valve.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'scheme', 'center_motion_check',
 'Flag 4v4 — Center: Motion and check rules',
 'Center cannot motion in most rule sets (must remain set at the snap). At rec levels, center is often the youngest player on the field — keep responsibilities minimal. Drill the snap with QB until automatic; only then add routes.',
 'flag_4v4', null, 'seed', null, null, true, false),

-- ─────────────────────────────────────────────────────────────────
-- E. Drills by category
-- ─────────────────────────────────────────────────────────────────

-- ── Catching ──
('global', null, 'drill', 'catch_form',
 'Flag 4v4 — Catching drill: Form catch',
 'Setup: receiver 5 yds from coach. Coach throws a soft ball at chest, then at head, then at hip, then over-shoulder. 10 reps each location.
Reps: 40 catches per player per practice.
Coaching points: form thumbs together (chest), pinkies together (high), eyes track the ball into the hands. Build muscle memory before adding routes. Single best skill driver at the 4v4 level.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'drill', 'catch_distraction',
 'Flag 4v4 — Catching drill: Distraction',
 'Setup: receiver catches passes while a second coach waves a foam noodle near his face / yells / claps. 10 reps.
Coaching points: focus on the ball, ignore the distraction. Translates directly to in-game DB-in-face contested catches. Best done after 2-3 weeks of basic catching is solid.',
 'flag_4v4', null, 'seed', null, 'tier2_9_11', true, false),

('global', null, 'drill', 'catch_tip_drill',
 'Flag 4v4 — Catching drill: Tip drill',
 'Setup: receiver lined up at 5 yds. Coach throws a high ball; receiver tips it up to himself and completes the catch. 10 reps.
Coaching points: never give up on a bobbled ball — most 4v4 INTs come from defenders tip-drilling the offense. Build the instinct to keep the ball alive.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'drill', 'catch_over_shoulder',
 'Flag 4v4 — Catching drill: Over-the-shoulder',
 'Setup: receiver runs vertically away from coach, who throws a soft deep ball. 10 reps each side (left shoulder, right shoulder).
Coaching points: turn the head WITHOUT slowing — most deep balls in 4v4 are missed because the WR slowed at the wrong moment. Hands at full extension, eyes track the ball all the way in.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'drill', 'catch_high_point',
 'Flag 4v4 — Catching drill: High-point',
 'Setup: receiver lined up under a coach holding a ball overhead. Coach drops or lobs the ball. Receiver jumps and catches at the highest point reachable. 10 reps.
Coaching points: best ball wins — go GET it, don''t wait for it. Same form for contested catches and goal-line fades.',
 'flag_4v4', null, 'seed', null, null, true, false),

-- ── Footwork ──
('global', null, 'drill', 'footwork_5_10_5',
 'Flag 4v4 — Footwork drill: 5-10-5 shuttle',
 'Setup: three cones in a line, 5 yds apart. Athlete starts at center cone, sprints 5 yds right, touches the cone, sprints 10 yds left, touches, sprints 5 yds back to center.
Reps: 4 sets per practice, alternating start side.
Coaching points: low athletic stance, full body turn at each cone (no shuffle-around). Universal football conditioning drill — improves change of direction.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'drill', 'footwork_l_drill',
 'Flag 4v4 — Footwork drill: L-drill (3 cones)',
 'Setup: three cones forming an L (5 yds apart). Athlete sprints from cone 1 to 2, around cone 2 toward cone 3, around cone 3 back to cone 1.
Reps: 3 sets per practice, both directions.
Coaching points: lean hard into the turns (low center of gravity). Translates to in-and-out cuts on routes.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'drill', 'footwork_w_drill',
 'Flag 4v4 — Footwork drill: W-drill',
 'Setup: 5 cones in a W shape. Athlete shuffles forward to the first peak, backpedals to the next dip, shuffles to next peak, etc.
Reps: 3 sets per practice.
Coaching points: footwork that builds DB hip-flip and WR break footwork. Hips stay low throughout — no straight-up postures.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'drill', 'footwork_ladder',
 'Flag 4v4 — Footwork drill: Agility ladder',
 'Setup: rope ladder on the ground. Athlete moves through it with various step patterns: 1-foot-per-square, 2-feet-per-square, in-and-out, lateral.
Reps: 4 patterns × 2 sets per practice.
Coaching points: light on the feet, eyes up. Universal warm-up drill — kids love it, every position benefits.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'drill', 'footwork_lateral_shuffle',
 'Flag 4v4 — Footwork drill: Lateral shuffle',
 'Setup: two cones 10 yds apart. Athlete shuffles between them, touching ground at each.
Reps: 4 sets, alternating start direction.
Coaching points: stay low, no crossover. Hands ready to catch (for receivers) or pull a flag (for DBs).',
 'flag_4v4', null, 'seed', null, null, true, false),

-- ── Flag-pull ──
('global', null, 'drill', 'flag_pull_1on1_mirror',
 'Flag 4v4 — Flag-pull drill: 1-on-1 mirror-pull',
 'Setup: ball carrier vs defender, 10 yds apart in a 10×10 box. Carrier tries to cross the box without losing flag.
Reps: 5 reps per pairing.
Coaching points: defender mirrors the carrier''s hips, breaks down before contact, both hands at the flag. Single best defensive teaching drill.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'drill', 'flag_pull_pursuit_gauntlet',
 'Flag 4v4 — Flag-pull drill: Pursuit gauntlet',
 'Setup: ball carrier runs through a line of 4 defenders spread 5 yds apart. Each defender attempts a flag pull as the carrier passes.
Reps: 3 sets per carrier.
Coaching points: defenders take pursuit angles, not straight-on shots. Carrier protects flag with off-hand.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'drill', 'flag_pull_funnel',
 'Flag 4v4 — Flag-pull drill: Sideline funnel',
 'Setup: ball carrier 10 yds from sideline, defender 5 yds away with sideline help.
Reps: 4 reps per pairing.
Coaching points: defender uses the sideline as an extra defender — forces carrier toward the boundary, then pulls. Teaches angle-based defense not chase-based.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'drill', 'flag_pull_pivot',
 'Flag 4v4 — Flag-pull drill: Pull-and-pivot',
 'Setup: defender lined up 3 yds from a stationary carrier. On whistle, defender executes a pull, then sprints 5 yds to a second stationary "carrier" and pulls again.
Reps: 6 reps per defender.
Coaching points: pulling a flag is not the end of the play in practice — pursuit continues until the whistle.',
 'flag_4v4', null, 'seed', null, null, true, false),

-- ── Route running ──
('global', null, 'drill', 'route_cone_routes',
 'Flag 4v4 — Route drill: Cone routes',
 'Setup: cones placed at break points for each of the 5 core routes (hitch 4y, slant 3y inside, out 4y, corner 6y, go vertical). Receiver runs the called route through the cone.
Reps: 2 reps of each route per practice.
Coaching points: depth precision is everything in 4v4. A 3-yd slant at 4 yds = blown route. Cones train the body to feel the depth.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'drill', 'route_2_step_plant',
 'Flag 4v4 — Route drill: 2-step plant',
 'Setup: receiver lines up, takes 2 hard vertical steps, then plants and breaks on the called direction (in/out/back).
Reps: 12 reps, mixing directions.
Coaching points: the plant must be ONE hard step, not a stutter. Plant foot is opposite the break direction. Snap head to QB on the plant.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'drill', 'route_sell_stem',
 'Flag 4v4 — Route drill: Sell the stem',
 'Setup: receiver runs all routes with a vertical stem identical to a go route, until the break point. Coach watches DB''s posture.
Reps: 10 reps per route.
Coaching points: if the DB starts to backpedal hard on the stem, the route''s set up. If he stays flat, you need a faster stem. Sell every route the same way to keep DBs honest.',
 'flag_4v4', null, 'seed', null, null, true, false),

-- ── Football IQ ──
('global', null, 'drill', 'iq_look_and_call',
 'Flag 4v4 — IQ drill: Look-and-call',
 'Setup: coach sets up a defense (man / Cover 2 / Cover 3 / blitz). QB and WRs identify it aloud — "Man!" or "Two-shell!" — before the snap.
Reps: 10 alignments per practice.
Coaching points: identifies the QB''s pre-snap recognition speed. Build the habit early — the QB''s eyes are the team''s eyes.',
 'flag_4v4', null, 'seed', null, 'tier2_9_11', true, false),

('global', null, 'drill', 'iq_presnap_read',
 'Flag 4v4 — IQ drill: Pre-snap leverage read',
 'Setup: WR lines up vs DB. WR reads DB''s leverage (inside/outside, soft/press) and CALLS the read aloud. Coach confirms.
Reps: 8 reps per WR.
Coaching points: leverage tells the WR what route is open. Inside leverage = out / corner are open. Outside = slant / drag are open. Soft cushion = hitch is free.',
 'flag_4v4', null, 'seed', null, 'tier2_9_11', true, false),

('global', null, 'drill', 'iq_coverage_recognition',
 'Flag 4v4 — IQ drill: Coverage recognition tempo',
 'Setup: coach sets up 4 defenders in a coverage. On "Hike!" players freeze and the QB calls the coverage. Then coach changes the coverage; repeat.
Reps: 12 setups per practice.
Coaching points: speed matters — in 4v4 there''s often only one pre-snap glance. Train recognition to be reflex-fast. Cycle through Cover 0 / Cover 1 / Cover 2 / Cover 3 / Man / Blitz.',
 'flag_4v4', null, 'seed', null, 'tier3_12_14', true, false),

-- ─────────────────────────────────────────────────────────────────
-- F. Game management & sideline
-- ─────────────────────────────────────────────────────────────────

('global', null, 'tactics', 'pregame_warmup_4v4',
 'Flag 4v4 — Game mgmt: Pre-game warm-up',
 '20-min warmup template: 5 min jog + dynamic stretch, 5 min position drills (QB throws, WR catches, DB backpedal), 5 min team install (last week''s adds), 5 min walkthrough of the opener and red zone call. Sweat without exhausting — youth kids burn out fast.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'tactics', 'captain_selection_4v4',
 'Flag 4v4 — Game mgmt: Captain selection',
 'Rotate captains weekly so every kid gets the experience. Captain attends the coin toss, makes the deferral / receive call (default: defer if won), and represents the team at handshakes. Educational value > tactical value in 4v4.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'tactics', 'coin_toss_4v4',
 'Flag 4v4 — Game mgmt: Coin toss',
 'Default: defer kickoff to get the ball at the start of the 2nd half. Exception: if your defense is significantly weaker than your offense, take the ball first to bank early points. In leagues with no kickoff (most 4v4), the deferral choice is "ball first or possession to start 2nd half."',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'tactics', 'sideline_organization_4v4',
 'Flag 4v4 — Game mgmt: Sideline organization',
 'Designate roles: head coach calls plays, assistant tracks downs + score, parent volunteer handles substitutions, team mom handles water/snacks. Sideline arranged by position group (QB+WRs one side, DBs other). Reduces chaos — every kid knows where to stand.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'tactics', 'substitution_4v4',
 'Flag 4v4 — Game mgmt: Substitution patterns',
 'Rotate every series in rec leagues — most leagues require equal playing time. Track touches: every kid should have at least one offensive touch per game. Tournament/competitive: rotate by drive but keep the QB constant (consistency is the QB''s biggest skill).',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'tactics', 'halftime_4v4',
 'Flag 4v4 — Game mgmt: Halftime structure',
 'Most 4v4 halftimes are 3-5 minutes. Use it for ONE adjustment + ONE positive. Adjustment example: "They''re sitting on the slant — we''re running out-and-up next drive." Positive example: "Great flag pulling in the second quarter, keep that energy." Don''t lecture.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'tactics', 'four_minute_4v4',
 'Flag 4v4 — Game mgmt: 4-minute drill (winning, end of half/game)',
 'With a lead and 4 min left, milk the clock. Play calls that stay in bounds: hitches, drags, sit routes, runs (where allowed). Take all available time pre-snap. If you must throw, throw IN-bounds — incompletes stop the clock. Goal: bleed the clock to zero with the ball.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'tactics', 'last_minute_4v4',
 'Flag 4v4 — Game mgmt: Last minute (losing, need to score)',
 'Down by a TD, 1 min left: sideline routes (outs, comebacks) to stop the clock. Spike to reset down/distance when needed. Save your one timeout for a critical 4th down. Don''t throw deep across the field — INTs end games.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'tactics', 'fourth_down_4v4',
 'Flag 4v4 — Game mgmt: 4th down decisions',
 'In 4v4 with no punts, every 4th down is a decision: go or turn over on downs. Defaults: own side of field = go (turnover deep is no worse than punting); opponent side = always go. Use your most reliable concept — not the trickiest. Stick is the standard 4th-and-short call.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'tactics', 'two_point_decision_4v4',
 'Flag 4v4 — Game mgmt: 2-point vs 1-point decision',
 'PAT 1pt is from 5y (or wherever your league spots it), 2pt is from 10y. Default: take the 1pt. Exception: 2pt when down 2 (force OT) or to extend a lead beyond a 1-score window. Quick math card on the sideline beats coach intuition.',
 'flag_4v4', null, 'seed', null, null, true, false),

-- ─────────────────────────────────────────────────────────────────
-- G. Age-tier specifics
-- ─────────────────────────────────────────────────────────────────

('global', null, 'tactics', 'tier_4u_5u_4v4',
 'Flag 4v4 — Age tier: 4U / 5U pre-K (rare)',
 'Pre-K flag is sometimes 4v4 but more often skills-only (no scrimmage). Focus: running with the ball, pulling a flag, catching a 1-yard pass. Practices are 30-40 min, attention span ~5 min per activity. Skip plays entirely — work fundamentals.',
 'flag_4v4', null, 'seed', null, 'tier1_5_8', true, false),

('global', null, 'tactics', 'tier_6u_7u_4v4',
 'Flag 4v4 — Age tier: 6U / 7U',
 'Peak 4v4 demographic. Install: 3-4 plays + 1 defense (Cover 2 or man). Practices 45 min. Every play has 1 read for the QB. Coach on the field is common — use it. End every practice with a 4-on-4 mini-game. Wins/losses don''t matter — touches and excitement do.',
 'flag_4v4', null, 'seed', null, 'tier1_5_8', true, false),

('global', null, 'tactics', 'tier_8u_4v4',
 'Flag 4v4 — Age tier: 8U',
 'Last year of "kid flag" before competitive bands. Install: 6-8 plays + 2 defenses (man + zone). Practices 60 min. QBs start running 2-read progressions. Coach off the field at this age. Introduce the concept of "matchup" — who do we want to attack vs that defense?',
 'flag_4v4', null, 'seed', null, 'tier1_5_8', true, false),

('global', null, 'tactics', 'tier_9u_10u_4v4',
 'Flag 4v4 — Age tier: 9U / 10U (transition to 5v5)',
 'Most 4v4 leagues bridge to 5v5 by 9U or 10U. Use the season to teach the snap exchange (center under-center or shotgun) before kids hit 5v5. Introduce the run game (if your 4v4 league allows it) so the transition isn''t blind. Add a 4th coverage (Cover 3) so kids see a 3-deep look.',
 'flag_4v4', null, 'seed', null, 'tier2_9_11', true, false),

('global', null, 'tactics', 'mixed_age_4v4',
 'Flag 4v4 — Age tier: Mixed-age teams',
 'Rec leagues sometimes mix 5-8 year olds on one team. Pair an older kid with a younger one in each position group — the older becomes a mentor. Simplify the playbook to the lowest-skill kid''s level. Older kids get bored fast if not challenged separately — give them on-field "captain" roles to keep them engaged.',
 'flag_4v4', null, 'seed', null, null, true, false),

-- ─────────────────────────────────────────────────────────────────
-- H. Safety & equipment
-- ─────────────────────────────────────────────────────────────────

('global', null, 'rules', 'equipment_flag_belt',
 'Flag 4v4 — Equipment: Flag belt fit',
 'Belt sits at the natural waist (above the hip bone), not on the hips. Flags hang free on both sides — no tucking, no taping. League rule: any modification (tucking, shortening, twisting) is a "flag guarding" penalty and a 5-10 yd loss. Check belt tightness before every kickoff.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'rules', 'equipment_mouth_guard',
 'Flag 4v4 — Equipment: Mouth guards',
 'Most rec leagues do NOT require mouth guards (no contact). Tournament / competitive 4v4 (older youth + adult) often does. Always provide for kids playing QB or center (snap exchange can cause incidental contact). Inexpensive, recommended regardless.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'rules', 'equipment_cleats',
 'Flag 4v4 — Equipment: Cleats vs turf shoes',
 'Grass field: rubber cleats (no metal cleats — banned in youth flag). Turf field: turf shoes. Rec leagues with field-day setups: tennis shoes are fine. Cleats matter more at 9U+ when speed picks up — at 5-8, sneakers are fine.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'rules', 'safety_heat',
 'Flag 4v4 — Safety: Hot weather',
 'Above 85°F: hydration breaks every 10 minutes, shade for the sideline, ice towels available. Above 95°F or with humidity warnings: consider postponement. Heat exhaustion symptoms: red face, dizziness, no sweating. Pull a kid showing any of these immediately, get them to shade and water.',
 'flag_4v4', null, 'seed', null, null, true, false),

('global', null, 'rules', 'safety_concussion',
 'Flag 4v4 — Safety: Concussion awareness',
 '4v4 flag is low-risk but not zero-risk for concussions — incidental head-to-head on collisions, head-to-ground on falls. Symptoms: headache, dizziness, confusion, vomiting, slurred speech. If suspected, remove the player immediately and notify the parent. Follow the league''s return-to-play protocol (typically 5-7 days symptom-free + clearance).',
 'flag_4v4', null, 'seed', null, null, true, false);

-- Revisions
insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Flag 4v4 KB expansion — sanctioning bodies, concepts, defenses, fundamentals, drills, game mgmt, age tiers, safety', null
from public.rag_documents d
where d.sport_variant = 'flag_4v4'
  and d.source = 'seed'
  and d.retired_at is null
  and d.subtopic in (
    -- Section A
    'sanctioning_i9_sports','sanctioning_nfl_flag_youth','sanctioning_upward','sanctioning_iflag',
    'sanctioning_ymca','sanctioning_differences_summary','field_variants','rush_variants',
    'scoring_variants','roster_variants',
    -- Section B
    'play_fade','play_out_and_up','play_wheel','play_pick','play_drag_only','play_hitch_flat',
    'play_slant_out','play_spot','play_wraparound','play_designed_scramble','play_jet_motion',
    'play_quick_screen_motion','play_choice_route','play_sit_routes','play_endzone_fade_special',
    -- Section C
    'defense_cover_0','defense_cover_1','defense_cover_4','defense_pattern_match','defense_disguise',
    'defense_roll_coverage','defense_anti_mesh','defense_anti_stack','defense_anti_bunch',
    'defense_blitz_package',
    -- Section D
    'qb_footwork_basics','qb_drops_in_4v4','qb_eyes_discipline','qb_ball_placement',
    'qb_presnap_recognition','qb_scramble_in_4v4','qb_audible_rules',
    'wr_stance_basics','wr_releases_three_types','wr_stem','wr_breaks','wr_tracking_deep',
    'wr_catch_with_hands','wr_yac','wr_screen_leverage',
    'db_stance_basics','db_backpedal','db_hip_flip','db_plant_break','db_reading_hips',
    'db_ball_skills','db_flag_pull_technique','db_pursuit_angles',
    'center_snap_eligible','center_motion_check',
    -- Section E
    'catch_form','catch_distraction','catch_tip_drill','catch_over_shoulder','catch_high_point',
    'footwork_5_10_5','footwork_l_drill','footwork_w_drill','footwork_ladder','footwork_lateral_shuffle',
    'flag_pull_1on1_mirror','flag_pull_pursuit_gauntlet','flag_pull_funnel','flag_pull_pivot',
    'route_cone_routes','route_2_step_plant','route_sell_stem',
    'iq_look_and_call','iq_presnap_read','iq_coverage_recognition',
    -- Section F
    'pregame_warmup_4v4','captain_selection_4v4','coin_toss_4v4','sideline_organization_4v4',
    'substitution_4v4','halftime_4v4','four_minute_4v4','last_minute_4v4','fourth_down_4v4',
    'two_point_decision_4v4',
    -- Section G
    'tier_4u_5u_4v4','tier_6u_7u_4v4','tier_8u_4v4','tier_9u_10u_4v4','mixed_age_4v4',
    -- Section H
    'equipment_flag_belt','equipment_mouth_guard','equipment_cleats','safety_heat','safety_concussion'
  )
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);

-- ─────────────────────────────────────────────────────────────────
-- Tail: promote 0103 core rules from needs_review=true → authoritative=true.
-- These 15 chunks have been in production since migration 0103, are the
-- foundational 4v4 rules, and Cal needs them authoritative to cite confidently.
-- ─────────────────────────────────────────────────────────────────

update public.rag_documents
set authoritative = true,
    needs_review = false,
    updated_at = now()
where sport_variant = 'flag_4v4'
  and topic = 'rules'
  and source = 'seed'
  and retired_at is null
  and authoritative = false
  and needs_review = true
  and subtopic in (
    'overview','field','players','no_rush','pass_clock','no_run_zones','snap',
    'downs','scoring','flag_pull','blocking','coach_on_field','penalties',
    'overtime','prohibited'
  );

-- Promote 0174 drill seeds similarly (also currently needs_review=true).
update public.rag_documents
set authoritative = true,
    needs_review = false,
    updated_at = now()
where sport_variant = 'flag_4v4'
  and topic = 'drill'
  and source = 'seed'
  and retired_at is null
  and authoritative = false
  and needs_review = true
  and subtopic like 'flag_4v4_%';
