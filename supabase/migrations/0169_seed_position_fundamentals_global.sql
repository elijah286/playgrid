-- Coach AI KB — Universal position fundamentals.
-- Mechanics + coaching points + age-tier progressions for every position.
-- Variant-specific overrides (e.g. flag-specific releases, no-blocking
-- adjustments) live in the variant drill seeds.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  age_tier, authoritative, needs_review
) values

-- ============ QUARTERBACK ============

('global', null, 'position_fundamentals', 'qb_stance_under_center',
 'QB stance: under center',
 'Feet shoulder-width, slight stagger (throwing-side foot 2-3 inches back), knees soft, hips slightly bent, hands seated firmly under center with top hand pressing up and bottom hand catching the laces. Eyes up, head over the center, weight balanced. Bad habits to coach out: looking at the center, leaning, locked knees. The snap should slap into the top hand — if it''s slow, the QB is too high.',
 null, null, 'seed', 'AFCA QB clinic standards (Walsh / Manning passing academy)',
 null, false, true),

('global', null, 'position_fundamentals', 'qb_stance_shotgun',
 'QB stance: shotgun',
 'Feet shoulder-width, square or slight stagger, weight on balls of feet, hands relaxed at chest height with fingers spread. Eyes scan the defense pre-snap — never lock on a single read. Knees bent enough to react quickly but not so deep that you can''t step into a throw. Common error in youth: standing straight up. Cue: ''athletic position, like you''re about to catch a basketball.''',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'position_fundamentals', 'qb_grip',
 'QB grip',
 'Fingers spread along the laces, NOT bunched. Index finger near the back point of the ball, pinky and ring finger on the laces, thumb wrapped around. Small gap (½ inch) between palm and ball — hold the ball with fingertips, not the palm. For small hands (youth), grip can shift forward slightly. Common error: gripping too tight (kills follow-through). Cue: ''hold it like a hot pan handle — firm enough not to drop, loose enough not to burn.''',
 null, null, 'seed', 'Manning passing academy',
 null, false, true),

('global', null, 'position_fundamentals', 'qb_throwing_motion',
 'QB throwing motion',
 'Five-phase motion: (1) load — ball at chest, weight on back foot, hips/shoulders square to target; (2) stride — front foot opens to target, lands toe-pointed at receiver; (3) hip rotation — back hip drives through, shoulders follow; (4) release — elbow leads, wrist snaps, ball off fingertips with thumb-down at finish; (5) follow-through — throwing hand finishes across body to opposite hip. Power comes from hips and legs, not the arm. Common error: throwing all-arm — looks accurate but velocity drops in the 4th quarter when arm fatigues.',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'position_fundamentals', 'qb_footwork_3step',
 'QB footwork: 3-step drop',
 'Used for quick game (slants, hitches, quick outs). From under center: open step with throwing-side foot at 45°, crossover step, plant on third step. From shotgun: catch and rock-step (1), gather (2), set (3). Total drop depth: 5 yards. Throw should be on time with the receiver''s break — late = sack or interception. Drill: ghost-drops vs air, 10 reps, foot-position graded by coach.',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'position_fundamentals', 'qb_footwork_5step',
 'QB footwork: 5-step drop',
 'Used for intermediate concepts (curls, comebacks, in-routes). From under center: 1 (open) + 2 + 3 + 4 + plant on 5. Depth: 7 yards. Last 2 steps shorter than first 3 — "big-big-big-small-small" — to allow weight transfer into throw. Common error: drifting back on the plant (kills timing). Cue: ''step off the spot, but throw from the spot.''',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'position_fundamentals', 'qb_progression_read',
 'QB progression read',
 'Most concepts have a 3-receiver progression (1, 2, 3 in priority order based on the call). Discipline: scan in order, don''t lock on. Eyes manipulate the defense — looking at #1 holds the safety so #2 opens up. Time budget per read: ~0.3-0.4 seconds. If #1 isn''t open by your plant foot landing, snap to #2. If #3 isn''t open, check down or scramble. NEVER stare down a receiver — defenses read your eyes.',
 null, null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'position_fundamentals', 'qb_pocket_presence',
 'QB pocket presence',
 'Stay tall in the pocket (don''t crouch or duck — kills throwing window). Slide laterally to escape interior pressure, never backward (creates more depth for edge rushers to close). Eyes downfield always — never on the rush. Pocket clock: 2.5-3.0 seconds is the realistic time before pressure arrives at HS. If you''re at 3.0 and no one is open, check down or throw away. Drill: phone-booth drill (4 cones around QB, must throw without crossing them while OL works pass pro).',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'position_fundamentals', 'qb_youth_simplifications',
 'QB fundamentals: youth (ages 8-12)',
 'For youth QBs, simplify dramatically: (1) two-step shotgun drop — ball-snap-catch, two-step gather, throw. (2) ONE read at a time, not progression. Coach dictates pre-snap: "if linebacker stays inside, throw the slant. If he widens, throw the flat." (3) No play-action faking until throwing motion is solid. (4) Footwork and grip first — accuracy comes from repetition, not coaching. Most youth INTs come from sidearm throws on the run; coach overhead release, even if it slows them down at first.',
 null, null, 'seed', null,
 'tier2_9_11', false, true),

-- ============ RUNNING BACK ============

('global', null, 'position_fundamentals', 'rb_stance',
 'RB stance',
 'Two-point stance for shotgun/pistol offenses, three-point under center. Two-point: feet shoulder-width, slight stagger, hands on knees or pads, weight on balls of feet, eyes on the LB level (not the QB''s feet). Three-point: down hand opposite the lead foot, weight forward, ready to take a handoff or fire out. Key cue: ''stance is where the play starts — bad stance, late hit, late hole.''',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'position_fundamentals', 'rb_ball_security',
 'RB ball security: 5 points of contact',
 'Every time the ball is in your hands: (1) FINGERTIPS over the front point of the ball; (2) FOREARM along the side of the ball; (3) BICEP pressing the back; (4) RIBCAGE squeezing it tight to the body; (5) OPPOSITE HAND covers when entering traffic ("high and tight"). Switch arms when changing direction so the ball is always on the sideline-side. Drill it daily — fumbles are the single highest-leverage thing youth can fix. 5-min ball gauntlet at every practice.',
 null, null, 'seed', 'USA Football ball security curriculum',
 null, false, true),

('global', null, 'position_fundamentals', 'rb_vision_progression',
 'RB vision: read progression',
 'On any run, RB has 3 reads in order: PRIMARY hole (the design), CUTBACK lane, BOUNCE outside. Don''t dance — pick one decisively by the time you cross the LOS. Speed of decision matters more than picking the perfect lane. Cue: ''press the hole, then react.'' Press = run AT the design hole at full speed; reaction = once the front-side blocks declare, cut or stay. Indecisive RBs get tackled in the backfield.',
 null, null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'position_fundamentals', 'rb_cut_technique',
 'RB cut technique',
 'Plant foot OUTSIDE the body line (e.g., to cut left, plant the right foot to the right of the right shoulder). Drop the hips. Drive off the plant foot, don''t round the cut. Two cuts max in the backfield — anything more = TFL. In the open field, jab steps and head fakes work because defenders also have to react. In traffic, just GO — angle of attack beats fakes when there are 5 defenders within 3 yards.',
 null, null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'position_fundamentals', 'rb_pass_pro',
 'RB pass protection basics',
 'When kept in: scan for blitzers from inside out (A-gap, B-gap, edge). On contact: punch the rusher''s chest plate with both hands, drop hips, drive feet. Aim for the rusher''s near number. Common error: ducking the head (loses the block + concussion risk). Cue: ''eyes in the chest, head up, arms locked.'' In youth, RBs miss blocks because they look at the QB — train them to commit to the rusher fully.',
 null, null, 'seed', null,
 'tier3_12_14', false, true),

-- ============ WIDE RECEIVER ============

('global', null, 'position_fundamentals', 'wr_stance',
 'WR stance',
 'Outside foot back (e.g., right WR has right foot back), weight 60% on the back foot, knees bent, shoulders forward, eyes on the ball (use peripheral for the snap). Hands relaxed near hips. Why outside foot back: lets you sell either an inside or outside release. Common error: standing too tall (can''t explode off the line). Cue: ''sprinter''s stance, but balanced.''',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'position_fundamentals', 'wr_release_off_press',
 'WR release vs press coverage',
 'Three primary releases: (1) OUTSIDE — hard step inside to freeze the corner, then explode outside, swiping his inside hand down with your outside arm. (2) INSIDE — hard step outside, swat-and-slip inside. (3) STACK — split him with a chop-rip move, run through his outside shoulder. Pick the release that the play dictates (e.g., go-route = outside release; slant = inside). Footwork beats hand-fight — the first move IS the release. Drill: 1-on-1 release vs partner with hand shield, 5 reps each release.',
 null, null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'position_fundamentals', 'wr_route_running',
 'WR route running fundamentals',
 'Three universal rules: (1) RUN AT FULL SPEED until the break. Defenders read body language; gearing down telegraphs the route. (2) SINK YOUR HIPS at the break — the lower the hips, the sharper the cut. (3) ATTACK THE LEVERAGE — if the corner is outside, run AT his outside shoulder before breaking inside. Route depths must be exact: a 12-yard curl at 10 yards is an interception. Use cones in practice; coaches measure depth.',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'position_fundamentals', 'wr_catching',
 'WR catching technique',
 'Hands form a diamond (thumbs together for above-shoulder, pinkies together for below-shoulder). Eyes track the ball all the way to the hands ("look it in"). Soft hands: give with the catch, don''t fight the ball. Tuck the ball IMMEDIATELY after the catch — five points of contact. Drill: tennis-ball drill (smaller target, forces clean catches), eye-tracking drill (catch and call out a number on the ball). Drops are 90% concentration, 10% hand technique — coach the eyes first.',
 null, null, 'seed', 'Larry Fitzgerald / Jerry Rice catching fundamentals',
 null, false, true),

('global', null, 'position_fundamentals', 'wr_blocking_perimeter',
 'WR blocking on perimeter',
 'WRs block on every run play — non-negotiable. Stalk block: get to within 1-2 yards of the DB, break down, mirror his hips, stay between him and the ballcarrier. Hands inside the frame, never below the waist. Don''t lunge — the DB will run past you. Effort matters more than technique here; lazy WR blocks cost more big runs than missed routes cost completions. Cue: ''you don''t need to pancake him, just delay him 2 seconds.''',
 null, null, 'seed', null,
 'tier3_12_14', false, true),

-- ============ OFFENSIVE LINE ============

('global', null, 'position_fundamentals', 'ol_stance_3point',
 'OL three-point stance',
 'Feet shoulder-width, slight toe-to-heel stagger (right hand down = right foot back about 2 inches). Down hand under shoulder, fingertips on grass, weight 60% in the hand. Off hand on the same-side knee. Eyes up, head neutral. Hips slightly higher than shoulders for run-heavy stance, level for balanced stance. Bad habits: butt too high (telegraphs run), butt too low (telegraphs pass), staggered too far (limits movement options).',
 null, null, 'seed', 'AFCA OL clinic standards',
 null, false, true),

('global', null, 'position_fundamentals', 'ol_drive_block',
 'OL drive block',
 'Used on inside/outside zone, power, dive. Aim point: opponent''s near number (the side you want to drive him from). First step: 6 inches with the play-side foot, low and hard. Hands fire from the holster (hip area) into the chest plate, thumbs up. Drive feet on contact — short choppy steps, never crossover. Finish: through the whistle. Cue: ''low man wins'' is true and worth repeating until annoying.',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'position_fundamentals', 'ol_reach_block',
 'OL reach block',
 'Used to seal a defender to one side (outside zone). Play-side foot bucket-steps laterally and slightly back, second foot crosses over and gains ground. Aim point: defender''s play-side hip/armpit. If you can''t reach him, ride him outside until your body is between him and the play. Common error: turning shoulders perpendicular to the LOS too early (defender slips inside). Cue: ''run his hip, then turn him.''',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'position_fundamentals', 'ol_pass_set',
 'OL pass set (kick slide)',
 'Vertical-set kick slide for an edge rusher: outside foot slides back 12-18 inches, inside foot follows to maintain shoulder width. Stay square. Hands inside, ready to punch. Eyes on rusher''s hip/numbers (hips don''t lie, numbers tell you which way he''s going). Punch: thumbs up, INSIDE the rusher''s frame, lock out arms. Reset hands on every pass play — late hands = false start = sack. Practice 50 sets per week minimum.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'position_fundamentals', 'ol_pull_technique',
 'OL pull technique',
 'Pull (used on power, counter, sweep): first step OPEN at 45° toward the play-side, second step gains ground laterally, third step squares to the LOS. Keep shoulders parallel to the LOS until you find your target. Common error: pulling flat then trying to climb — gets caught up in trash. Cue: ''pull deep, then attack.'' Most-pulled position: backside guard (guard pull on power) or play-side guard (G-counter).',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'position_fundamentals', 'ol_youth_simplifications',
 'OL fundamentals: youth (ages 8-12)',
 'For youth OL: forget multi-block schemes. Teach 2 things: (1) FIRE OUT block — drive block straight ahead, low and hard, drive your guy OFF the ball. (2) PASS BLOCK STAY-AT-HOME — keep your butt to the QB, hands inside, don''t chase. That''s it. Reach blocks, pulls, combo blocks — all wait until tier 3. The biggest gains in youth OL are stance + first-step quickness, not technique variety. Drill: stance-and-start every practice for 5 minutes.',
 null, null, 'seed', null,
 'tier2_9_11', false, true),

-- ============ DEFENSIVE LINE ============

('global', null, 'position_fundamentals', 'dl_stance_3point',
 'DL three-point stance',
 'Like OL stance but with weight farther forward (70-80% on the down hand) — DL fires out, OL has to react. Inside foot up (heel-to-toe stagger), outside foot back. Eyes on the OL''s near hand (first movement tells you the snap). Bad habit: false-stepping (tipping backward at the snap). Cue: ''leave nothing in the stance — explode through the OL''s chest.''',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'position_fundamentals', 'dl_get_off',
 'DL get-off',
 'First step: 6 inches, low and hard, on the snap. Get-off is the single highest-leverage DL skill — beat the OL off the ball and his block fundamentals don''t matter. Train with stance-and-start drills daily, 10 reps. Reaction off the ball, not the OL. ''I move on the ball, you move on me'' — coach repeats until it sticks. Common error: rising up on first step (loses leverage). Cue: ''first step, low step.''',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'position_fundamentals', 'dl_hand_fight',
 'DL hand fight + block destruction',
 'Three primary techniques on the OL''s punch: (1) RIP — drive the near arm up through the OL''s armpit, low club with the off-hand. (2) SWIM — over-the-top arm-over move, off-hand controls his far shoulder. (3) BULL — both hands to the chest plate, drive him back. (4) LONG-ARM — extend near arm to OL''s sternum, lock out, control with off-hand. Pick based on OL''s set: high punch = rip/swim, soft set = bull. Hand fight is a daily drill — minimum 15 reps per practice.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'position_fundamentals', 'dl_gap_responsibility',
 'DL gap responsibility',
 'Every DL has a gap — A (between center/guard), B (guard/tackle), C (tackle/TE), D (outside TE). Your first job is to keep your gap. Pass-rush AFTER the run threat clears. Common error: rushing upfield and creating a cutback lane. Discipline > splash plays. Coach: ''gap first, ball second.''',
 null, null, 'seed', null,
 null, false, true),

-- ============ LINEBACKER ============

('global', null, 'position_fundamentals', 'lb_stance',
 'LB stance',
 'Feet shoulder-width, slight stagger, hips/knees bent (athletic position), hands relaxed, eyes through the OL to the backfield (read your key — usually a guard or the backfield). Depth: 4-5 yards off the ball for ILB, 3-4 for OLB. Get into stance EARLY — don''t be late getting set or you''re flat-footed at the snap. Cue: ''ready position — like a SS waiting for a ground ball.''',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'position_fundamentals', 'lb_run_pass_keys',
 'LB run/pass key reads',
 'Most defenses key the offensive guard: (1) GUARD STEPS DOWN/ANGLES = run play your direction, fill the gap. (2) GUARD PULLS = run AWAY from your gap, take the proper pursuit angle (don''t chase flat). (3) GUARD SETS PASS-PRO = pass, drop to your zone or pick up your man. Read the guard for 0.5 seconds, THEN react. Common error: peeking at the QB pre-snap (loses the read). Cue: ''eyes on your key, feet on the ball.''',
 null, null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'position_fundamentals', 'lb_shed_block',
 'LB block destruction (shed)',
 'When a blocker arrives, two options: (1) STACK-AND-SHED — square up, hands to the chest plate, lock out arms, then disengage to the ball side. (2) RIP — keep the play-side shoulder free, rip the play-side arm through to maintain leverage on the ballcarrier. Never go around a blocker without controlling him first; you''ll be sealed out. Cue: ''take on, separate, make the play.''',
 null, null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'position_fundamentals', 'lb_zone_drops',
 'LB zone drops',
 'Hook-curl zones: drop at 45° to the curl (hook outside, curl inside) at 10-12 yards depth. Eyes on the QB''s shoulders, head on a swivel for crossers. Don''t backpedal — open hips and run to the spot, then settle. Hand off vertical receivers to safeties; jump anything in your zone. Common error: dropping to a spot then losing eyes (gets crossed up). Cue: ''get to your spot, then play football.''',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'position_fundamentals', 'lb_tackling_form',
 'LB form tackling',
 'Approach: chop the steps as you close, hips down ("buzz the feet"). Strike: hit on the rise with the near shoulder, head ACROSS the ballcarrier (never head-down — neck injury risk + you miss tackles). Wrap with both arms, drive the legs through. Finish: roll him to the ground, your numbers driving through his numbers. USA Football Heads Up technique is the standard for youth. Drill daily — bad tackling is the #1 cause of long runs.',
 null, null, 'seed', 'USA Football Heads Up Tackling',
 null, false, true),

-- ============ DEFENSIVE BACK ============

('global', null, 'position_fundamentals', 'db_stance',
 'DB stance',
 'Off coverage (5-7 yards): feet shoulder-width, square or slight outside-foot back, knees bent, hips down, weight on balls of feet, hands relaxed at hip level. Press coverage (1 yard): inside foot up, outside foot back, hand near WR''s outside shoulder pre-snap. Eyes on the WR''s waist (not feet, not eyes — waist tells you direction). Cue: ''mirror the receiver, don''t chase him.''',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'position_fundamentals', 'db_backpedal',
 'DB backpedal',
 'Push off front foot, reach back with back foot — short, choppy steps, NOT long strides. Stay LOW (hips bent at 90°). Arms swing naturally, mirror sprint mechanics. Pace matches the receiver — don''t outrun yourself. When the WR breaks, the backpedal turns into a turn-and-run or a plant-and-drive. Drill: 5-yard backpedal, plant on whistle, drive forward — 10 reps daily.',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'position_fundamentals', 'db_hip_flip',
 'DB hip flip (turn and run)',
 'When the receiver gets vertical (past 12-15 yards), open hips toward the receiver and run. Open the hips by snapping the head and shoulders to the receiver''s side; the hips follow. CRITICAL: snap head AROUND to find the ball as you run — many DBs run hip-to-hip with WR but never look back, resulting in a PI flag or an easy catch. Practice the head-turn separately: run, count to 3, snap head and look. Cue: ''run his route, find the ball.''',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'position_fundamentals', 'db_press_jam',
 'DB press technique',
 'On the snap: short kick-step (don''t commit), eyes on WR''s waist, jam with the inside hand to the chest plate or outside shoulder depending on the call. Don''t lunge. Most press losses come from over-committing on the first step. After the jam, transition to trail technique (inside leverage on the WR''s back hip). Press is a HS+ skill — youth DBs play almost exclusively off coverage.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'position_fundamentals', 'db_zone_drops',
 'DB zone drops',
 'Cover 3 corner: bail at the snap, get to 12-15 yards depth on the deep third, eyes on the QB. Cover 2 corner: jam the #1 WR for 1-2 yards, then sink to the flat. Safety in cover 3: middle 1/3, eyes on the QB''s eyes — jump the deep middle if QB looks. Safety in cover 2: deep half, take the deepest threat. Discipline > rangy plays — abandoning your zone for an interception you don''t get is the #1 way coverage breaks.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'position_fundamentals', 'db_ball_skills',
 'DB ball skills',
 'Catching the ball is the highest-value DB skill outside of leverage. Drill it weekly: high-point drill (jump and catch over the WR''s head), turn-and-find drill (run with WR, on whistle find the ball, catch it), tipped-ball drill (reach and tip then track and catch). DBs who catch turn 50% of their PBUs into INTs. Drop everything else if hands are weak — hands are coachable.',
 null, null, 'seed', null,
 null, false, true),

-- ============ UNIVERSAL TACKLING ============

('global', null, 'position_fundamentals', 'tackling_form_universal',
 'Form tackling: universal',
 'USA Football Heads Up technique (5 phases): (1) BREAKDOWN — chop feet into the ballcarrier; (2) BUZZ — feet under the body, hips low; (3) HIT — strike with near shoulder, head ACROSS (Hawk position — same shoulder strikes the same hip on the ballcarrier); (4) WRAP — both arms wrap, lock hands; (5) DRIVE — five steps through contact, ballcarrier on his back. NEVER lead with the head. Coach this every week minimum, daily during install camp. Bad tackling > bad anything else.',
 null, null, 'seed', 'USA Football Heads Up Tackling certification',
 null, false, true),

('global', null, 'position_fundamentals', 'tackling_angles',
 'Tackling angles & pursuit',
 'Take an angle that gets you to the ballcarrier''s near hip, not his current spot — he''ll be 2-3 yards downfield by the time you arrive. Speed of pursuit > speed of athlete; everyone runs to the ball. Sideline is your friend — push the ballcarrier OUT or to a teammate. Inside-out pursuit on edge runs (don''t let the ball break back inside). Drill: pursuit drill weekly (every defender touches ballcarrier within 6 yards of ball or pushes him out).',
 null, null, 'seed', null,
 null, false, true);
