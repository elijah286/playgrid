-- Coach AI KB — Drills for NFL Flag 5v5.
-- 5-on-5 flag with no rushing the QB (or 1-rusher rule depending on division),
-- no contact, no blocking, 7-second pass clock common.
-- Emphasis: route running, leverage, flag pulling, ball security, QB decisions.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  age_tier, authoritative, needs_review
) values

-- ============ FLAG-PULLING DRILLS ============

('global', null, 'drill', 'flag_pull_form',
 'Flag-pulling form drill',
 'Setup: 2 lines of players 10 yards apart. Player A jogs through a 5-yard channel, Player B is the puller. Cones 5 yds apart bound the channel.
Reps: B pulls A''s flag with the technique: knees bent, square hips, FACE the ballcarrier (don''t spin), grab and YANK (don''t pinch). Switch every 3 reps. 5 min total.
Coaching points: pull the flag DOWN and AWAY (don''t tackle). Square hips so you can react to a cut. Eyes on hips, not the flag — flags swing, hips don''t lie.
Common errors: leaping, spinning, going low like a tackle. None of those work — flags are mid-thigh, you need to be square.',
 'flag_5v5', null, 'seed', 'NFL FLAG coaching curriculum',
 null, false, true),

('global', null, 'drill', 'flag_pull_angle',
 'Pursuit angle flag-pull drill',
 'Setup: ball-carrier starts on a hash, defender starts 10 yards behind and 5 yards lateral. Cones mark a 30-yard sideline.
Reps: ball-carrier runs sideline at 3/4 speed; defender takes the angle to the ball-carrier''s near hip and pulls the flag before the goal line. 8 reps.
Coaching points: angle to the HIP, not where the runner is now. If you''re too steep, he runs past you; too shallow, he reaches the corner. Pursuit angle = where he WILL be.
Variation: add a second defender from a different spot — practice tagging him out instead of all running to the same spot.',
 'flag_5v5', null, 'seed', null,
 null, false, true),

('global', null, 'drill', 'flag_pull_open_field',
 'Open-field flag-pull (1v1)',
 'Setup: 10x10 yard box. Ball-carrier in middle, defender 5 yards away. Goal: ball-carrier escapes through any sideline; defender pulls flag before he does.
Reps: 6 reps each role. Make it competitive — score points for offense (escape) vs defense (pull).
Coaching points: defender breaks down at 3 yards, mirror hips, force the runner to commit. Don''t lunge. Most missed flag pulls in games come from over-committing on a head fake. Train patience.',
 'flag_5v5', null, 'seed', null,
 'tier2_9_11', false, true),

-- ============ QB DRILLS (FLAG-SPECIFIC) ============

('global', null, 'drill', 'qb_flag_pocket_clock',
 'QB pocket clock vs 7-second rule',
 'Setup: QB in shotgun, WR runs a 5-yard hitch. Coach holds a stopwatch and counts down audibly: "7, 6, 5, 4..."
Reps: 10 throws. QB must release ball before "1" or it''s a turnover (sack in NFL Flag rules). Coaches gradually introduce false pressure (a coach with a hand shield rushing).
Coaching points: most flag QBs hold the ball too long. Trust the route. By 4-3-2 the throw must be in the air. Drill until anxiety to release is muscle memory.',
 'flag_5v5', 'nfl_flag', 'seed', 'NFL FLAG 7-second rule training',
 null, false, true),

('global', null, 'drill', 'qb_flag_no_huddle',
 'No-huddle QB cadence drill',
 'Setup: 5 receivers spread, QB in shotgun. Coach signals plays from sideline (hand signals or wristband).
Reps: 12 plays in 3 minutes — players hustle to LOS, QB barks cadence, ball is snapped. Shorter huddle = more reps in a flag game where total plays per game is low.
Coaching points: NFL Flag games have ~30-40 offensive plays total. Tempo wins. Train QB to decode the signal, scan defense, and snap in <10 sec.',
 'flag_5v5', 'nfl_flag', 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'qb_flag_scramble_throw',
 'QB scramble-and-throw',
 'Setup: QB in shotgun, 3 WRs running curls at 8 yards. Coach stands at QB''s feet with a hand shield.
Reps: at the snap, coach steps left or right; QB scrambles the OPPOSITE way and resets feet to throw. 10 reps each direction.
Coaching points: flag QBs must throw on the run cleanly — there''s no pocket. Resetting feet (even briefly) before throwing improves accuracy 30%. Sliding throw without resetting feet = inaccurate.',
 'flag_5v5', null, 'seed', null,
 'tier3_12_14', false, true),

-- ============ WR / RECEIVER DRILLS ============

('global', null, 'drill', 'wr_flag_release_vs_cushion',
 'WR release vs cushion (off coverage)',
 'Setup: WR on the LOS, DB 5-7 yards off in cover-3 leverage.
Reps: WR runs a route from the route tree (vary). Coach grades: did WR attack the cushion (close the gap to the DB before breaking)? Did he sell a vertical stem before the break?
Coaching points: in flag, DBs are usually in off coverage (no press allowed in most leagues for younger divisions). The release becomes the FIRST 3 STEPS — attack the cushion at full speed, sink hips, break. Casual release = easy coverage.',
 'flag_5v5', null, 'seed', null,
 'tier2_9_11', false, true),

('global', null, 'drill', 'wr_flag_route_tree',
 'Flag receiver route tree',
 'Setup: cone at LOS, cones at 5/8/12/15 yards.
Reps: WR runs each route in sequence: hitch (5), out (5), slant (3-step in), curl (8 sit), comeback (12 break to 8), in/dig (12), corner (12 break to corner cone), post (12 break to opposite hash), go (15+ vertical).
Coaching points: SAME stem on every route until the break — defenders can''t guess. Hit the depth EXACTLY. In flag, route precision is more important than tackle (no contested catches with safeties).',
 'flag_5v5', null, 'seed', null,
 null, false, true),

('global', null, 'drill', 'wr_flag_double_move',
 'Double-move (sluggo) drill',
 'Setup: WR vs single DB in off coverage.
Reps: WR runs slant fake (3 steps inside, head turn, plant) then breaks vertical (sluggo = slant-and-go). Or hitch-and-go: hitch fake at 5, push vertical.
Coaching points: SELL the first move (head and shoulders, not just feet). DB has to bite. Most missed sluggos come from a soft first move. Drill the sell first, the second move second.',
 'flag_5v5', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'wr_flag_yac_juke',
 'YAC juke drill',
 'Setup: WR catches a 5-yard hitch from a coach (QB sub). Two defenders in mirror coverage 3 yds away.
Reps: catch and make ONE move to escape. Goal: gain 5 more yards after catch. 8 reps.
Coaching points: in flag, YAC > raw catch yards. Shoulder fake + plant cut beats all defenders. NEVER try to outrun two defenders to the same side; cut against the grain.',
 'flag_5v5', null, 'seed', null,
 'tier2_9_11', false, true),

-- ============ DEFENSE / DB DRILLS (FLAG) ============

('global', null, 'drill', 'db_flag_zone_drop',
 'DB zone-drop and break drill',
 'Setup: DB in off coverage, coach stands at LOS as QB with ball.
Reps: at snap, DB drops to assigned zone (deep 1/3 in cover-3, e.g.). Coach pumps and points to a spot — DB breaks on the throw. 8 reps.
Coaching points: in flag, deep balls win games. Get DEPTH first, then react. Eyes on QB''s shoulders. NEVER bite on a pump fake to underneath when you have the deep zone.',
 'flag_5v5', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'db_flag_man_mirror',
 'DB man-coverage mirror drill',
 'Setup: WR vs DB in 1-on-1. QB throws routes by call.
Reps: 8 reps per DB. WR runs a random route from the tree.
Coaching points: stay with INSIDE leverage in flag (no safety help most plays). Don''t look back for the ball until WR''s eyes turn — turning early = dropping coverage. When the ball arrives, play through the WR''s hands (no contact = play the ball).',
 'flag_5v5', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'def_flag_rusher_count',
 'Rusher count drill (NFL Flag)',
 'Setup: 5 defenders (corners, safety, rusher off the rush line), QB with ball. NFL Flag rules: rusher must be 7 yards back of LOS.
Reps: Coach calls a rush plan ("rusher hits, corners drop, S spies"). Rusher counts "7-Mississippi" then sprints at QB. QB throws a route.
Coaching points: in NFL Flag the 7-yard rule is the defense''s only pressure tool. Rusher must be at FULL SPEED off the line — late rush = QB throws over the top. Drill the angle: don''t rush flat; angle TOWARD the throwing arm.',
 'flag_5v5', 'nfl_flag', 'seed', 'NFL FLAG official rules / coaching guide',
 'tier3_12_14', false, true),

-- ============ RB / BALL CARRIER DRILLS ============

('global', null, 'drill', 'rb_flag_option_pitch',
 'QB-RB pitch option drill',
 'Setup: QB and RB in shotgun, defender (coach) on the edge, ball-carrier marker 5 yds outside.
Reps: QB takes snap, attacks the edge, reads the defender. If defender attacks QB → pitch. If defender plays pitch → keep. 6 reps each direction.
Coaching points: the eye-discipline read happens at 4 yds depth — by then the defender has committed. PITCH IS A SOFT TOSS, NOT A THROW (chest-high, leading the RB). RB runs a parallel track 4-5 yds outside QB.',
 'flag_5v5', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'rb_flag_sweep_blocking',
 'RB sweep with WR perimeter "blocking"',
 'Setup: 2 WRs out wide, RB taking sweep. Defender on each WR, "rush" defender in middle.
Reps: WR''s "block" by getting BETWEEN the defender and the ball — no contact, just leverage. RB runs sweep. 6 reps each direction.
Coaching points: in flag, blocking = LEVERAGE (no contact). WRs must keep their body between defender and runner without grabbing. Train it so officials don''t flag for incidental contact. Most-effective youth play in flag = sweep with great perimeter leverage.',
 'flag_5v5', null, 'seed', 'NFL FLAG no-blocking rule interpretation',
 null, false, true),

-- ============ TEAM DRILLS ============

('global', null, 'drill', 'team_flag_5on5_air',
 '5-on-5 vs air',
 'Setup: full offense + scout cards. No defense.
Reps: 10-12 plays from script. QB calls cadence, all 5 players execute assignment, run completes, hustle back to LOS.
Coaching points: in flag, this is your foundational team drill. Every player learns ALL plays — flag rosters are small. Run it daily for 5 min in pre-season. Don''t add a play to the playbook until vs-air looks crisp.',
 'flag_5v5', null, 'seed', null,
 null, false, true),

('global', null, 'drill', 'team_flag_5on5_live',
 '5-on-5 live periods',
 'Setup: full offense vs full defense, 40-yard field, refs (or coaches calling rules).
Reps: 8-10 plays per period, 2-3 periods per practice.
Coaching points: track conversion rate (% of 1st downs reached). Focus on 3rd-down execution — hardest to install in scrimmage. Reset on mistakes; talk through each play before next snap.',
 'flag_5v5', null, 'seed', null,
 null, false, true),

('global', null, 'drill', 'team_flag_red_zone',
 'Red zone (10-yard line in)',
 'Setup: ball at the 10. Offense gets 4 plays to score. Defense aligned in cover-2 or cover-0.
Reps: 4 series per side, swap. Track TD rate.
Coaching points: in flag, red zone is hardest because the field shortens — fewer routes are alive. Best calls: slant-flat, fade to the corner, QB sneak (where allowed), sweep with leverage. Practice these in the red zone weekly.',
 'flag_5v5', null, 'seed', null,
 'tier2_9_11', false, true),

-- ============ TIER-1 (5-8) FLAG DRILLS ============

('global', null, 'drill', 'flag_tier1_relay_race',
 'Relay race fundamentals (tier 1)',
 'Setup: 4 cones in a line, 2 teams. Each kid runs to cone 1 (catch a tossed ball from coach), cone 2 (pull a flag from a hanging belt), cone 3 (handoff to next kid via belly press), cone 4 (finish line).
Reps: 3-5 races, swap teams.
Coaching points: hits all 4 fundamentals (catch, flag pull, hand off, run hard) and feels like a game. Tier-1 attention spans demand competition. End every drill with a winner.',
 'flag_5v5', null, 'seed', null,
 'tier1_5_8', false, true),

('global', null, 'drill', 'flag_tier1_freeze_tag',
 'Freeze tag flag-pull (tier 1)',
 'Setup: 30x30 yard box. Half the kids are runners (with flags), half are taggers (no flags).
Reps: 60-second rounds. Tagger pulls a runner''s flag = runner is "frozen" until a teammate tags them back. Switch sides.
Coaching points: stealth conditioning + flag-pull reps disguised as a game. Kids beg to play it. End on a clear winner. Bonus: it teaches taggers to break down in the open field without thinking about it.',
 'flag_5v5', null, 'seed', null,
 'tier1_5_8', false, true),

('global', null, 'drill', 'flag_tier1_qb_target',
 'QB target throwing (tier 1)',
 'Setup: 3 hula hoops on the ground, 8/12/15 yards away. QB throws to each.
Reps: 6 throws per hoop. Score 1 pt for hitting hoop, 0 for miss. Each kid takes a turn.
Coaching points: target practice, not technique perfection. Praise EVERY throw that gets close — confidence is the fragile thing here. Don''t coach grip yet — let them figure it out for 2-3 practices, then introduce.',
 'flag_5v5', null, 'seed', null,
 'tier1_5_8', false, true),

-- ============ TIER-3 (12-14) FLAG DRILLS ============

('global', null, 'drill', 'flag_tier3_choice_routes',
 'Choice routes vs leverage',
 'Setup: WR vs DB. Coach calls "choice" route (not a fixed route — read leverage).
Reps: 8 reps. WR runs the route based on DB position: inside leverage = run vertical or out; outside leverage = slant or in; even leverage = curl/comeback.
Coaching points: tier-3 is when WRs can handle reads. QB is reading the SAME way (mirror read). Both must agree on what they see. This is the foundation for HS-level passing games.',
 'flag_5v5', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'flag_tier3_pattern_match',
 'Pattern-match coverage drill (tier 3)',
 'Setup: 3 receivers run a flood concept (vertical, intermediate, flat). 3 defenders.
Reps: defenders pattern-match: deepest takes deepest, intermediate takes intermediate, etc. 6 reps with varied concepts.
Coaching points: zone bust = TD in flag. Pattern matching is a tier-3 concept (younger kids can''t track 3 routes). Drill hand-offs: who does the safety follow if WR2 runs vertical past WR1?',
 'flag_5v5', null, 'seed', null,
 'tier3_12_14', false, true),

-- ============ FLAG-SPECIFIC SAFETY ============

('global', null, 'drill', 'flag_safety_no_contact_culture',
 'No-contact culture in practice',
 'Flag football is a NO-CONTACT sport. Train it from day 1:
- No diving for flags (head-down spear risk).
- No pushing or shielding off the ball.
- No hand-fighting at the LOS.
Rep penalty calls: pulling a flag with shoulder contact, blocking with hands extended, running through a defender.
The most common youth flag injury is collision in open space. Coach SQUARING UP (don''t spin past) and BREAKING DOWN to prevent it.',
 'flag_5v5', null, 'seed', 'NFL FLAG safety guidelines',
 null, false, true);
