-- Coach AI KB — Universal coaching methodology (sport_variant=NULL).
-- Practice design, fundamentals teaching, age-appropriate progressions, common mistakes.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ============ AGE / EXPERIENCE FRAMEWORK ============

('global', null, 'coaching', 'age_tier_framework',
 'Coaching age & experience tiers',
 'Use four tiers when scaling instruction: TIER 1 (ages 5-8 / first-year): one cue at a time, 5-min drill blocks, every kid touches the ball every drill, no conditioning for conditioning''s sake. TIER 2 (9-11 / 1-2 yrs exp): introduce assignment football, 8-10 min blocks, basic conditioning embedded in drills. TIER 3 (12-14 / 2-4 yrs exp): full assignment + reads, 10-15 min blocks, position-specific work, real conditioning. TIER 4 (HS+/varsity): scheme literacy, film, formal S&C, install depth.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'attention_span_by_age',
 'Attention span by age',
 'Hard cap on any single instruction block: ages 5-7 = 4-5 min, ages 8-10 = 7-8 min, ages 11-13 = 10-12 min, 14+ = 15-20 min. After the cap, retention drops sharply and behavior degrades. Rotate stations rather than extending. If you must teach a complex concept, break it into 3 short blocks across the practice, not one long one.',
 null, null, 'seed', null, true, false),

-- ============ WARM-UPS ============

('global', null, 'coaching', 'warmup_general_principles',
 'Warm-up principles',
 'Goals: raise core temp, prep joints/muscles for sport-specific motion, focus the team. Order: light jog → dynamic stretch → movement prep → sport-specific. Avoid static stretching pre-practice (reduces power output for ~30 min). Total time: 8-10 min for youth, 12-15 min HS+. Skip nothing — most non-contact injuries trace to skipped warm-ups.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'warmup_youth_5_10',
 'Warm-up: ages 5-10',
 'Make it a game. 3 min of tag, freeze tag, or "sharks and minnows." Then 4 min of animal walks (bear crawl, crab walk, frog hop) — builds athleticism without feeling like work. Skip formal dynamic stretches — kids this age have plenty of mobility. Finish with 2 min of sport-specific (form running, light catching).',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'warmup_middle_11_13',
 'Warm-up: ages 11-13',
 '5 min jog/skip warm-up, then dynamic series: high knees, butt kicks, A-skips, B-skips, carioca, lateral shuffle, walking lunges, walking knee-hugs, walking quad pulls, leg swings, arm circles. 8-10 min total. Add 2-3 min of sport-specific movement (backpedal, plant-and-drive) before drills.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'warmup_hs_varsity',
 'Warm-up: HS / varsity',
 'Standard NFL/college dynamic warm-up: 5 min of position groups jogging through dynamic series (every movement above) + sport-specific at the end. Add band work for shoulders (QBs, WRs) and hips (everyone). Reads: pre-snap recognition drills can replace the last 3 min of warm-up to start mental engagement. 12-15 min total.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'warmup_pregame',
 'Pre-game warm-up',
 'Same structure as practice but compressed and intensified. 20 min total: 5 min jog + dynamic, 5 min position-specific, 5 min team install (script, tempo), 5 min last-minute walkthrough. End 5-7 min before kickoff so heart rate settles. Don''t install anything new pre-game — only rep what they already own.',
 null, null, 'seed', null, true, false),

-- ============ CONDITIONING ============

('global', null, 'coaching', 'conditioning_principles',
 'Conditioning principles',
 'Football is repeated 4-7 second bursts with 25-40 sec recovery. Train that energy system. Long-distance running has near-zero transfer to football performance and increases injury risk. Best conditioning = play football at game pace with full effort. Add formal conditioning only if practice intensity is too low to drive adaptation.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'conditioning_youth',
 'Conditioning: youth (5-10)',
 'NO formal conditioning. Kids this age don''t need it and lose interest fast. Build conditioning by running tempo team periods at the end of practice — chase them with the play, make it competitive. If a kid is gassed in a game, the answer is more reps at game speed in practice, not gassers.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'conditioning_middle',
 'Conditioning: middle school (11-13)',
 'End-of-practice conditioning: 6-10 sprints of 20-40 yards on :30 rest. Or competitive team relays. Pursuit drills (defense chases ballcarrier sideline-to-sideline) double as conditioning AND skill work — preferred. Skip gassers as punishment; kids learn to dread practice.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'conditioning_hs',
 'Conditioning: HS / varsity',
 'Position-specific. Linemen: 10x 10-yard sprints + agility ladder, rest :20-:30. Skill: 8-12x 40-yards + change-of-direction work, rest :30-:45. Team finisher: 4-6 perfect-tempo plays with full effort, no walking back to huddle. Avoid 1-mile timed runs — non-specific and demoralizing for linemen who can''t win them.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'conditioning_in_season',
 'Conditioning: in-season',
 'In-season, practice IS conditioning if tempo is right. Add only enough formal work to maintain — 1-2 short conditioning blocks per week max. Over-conditioning in-season causes leg fatigue, slower film-week recovery, and injuries. Save volume for the off-season.',
 null, null, 'seed', null, true, false),

-- ============ TEACHING PLAYS ============

('global', null, 'coaching', 'teach_plays_progression',
 'Teaching a play: progression',
 'Standard install: (1) Walk-through at half speed, no defense — every player knows their assignment. (2) Walk-through vs air with cards. (3) Half-speed vs scout defense. (4) Full-speed vs scout. (5) Full-speed vs varied looks. Don''t skip steps. New install needs ~20-30 reps before it''s game-ready.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'teach_plays_youth',
 'Teaching plays: youth (5-10)',
 'Limit playbook to 6-10 plays total for first-year teams; 10-15 for experienced youth. Use simple names ("Blue Right 22"). Draw on whiteboard or sand, then walk it. Have them call out their assignment before snap. If a play isn''t cleanly executed in week-1 install, cut it — don''t double down. Rep your best 4-5 plays 80% of practice.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'teach_plays_middle',
 'Teaching plays: middle school',
 'Playbook can grow to 20-30 plays with formation tags. Introduce concept-based naming (e.g., "Mesh Right" runs from any formation). Use card scout teams to show different defensive looks. Quiz players verbally before reps: "What''s your assignment vs Cover 2?" Reward correct calls in front of the team.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'teach_plays_hs',
 'Teaching plays: HS / varsity',
 'Install in concept buckets (4-6 base concepts × multiple formations/tags). Use film of yesterday''s install before today''s practice. Players should be able to draw their assignment vs any front. Add audibles/checks in week 3+ once base is owned. Test weekly with written or whiteboard quizzes.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'install_pacing',
 'Install pacing',
 'Don''t install more than 3-4 new plays per practice (youth) or 5-6 (HS). Day 1 install is muscle memory; day 2 is recall under fatigue; day 3 is execution vs varied looks. A play needs 3 days minimum before it''s callable in a game. Anything installed Friday for Saturday is a coin flip.',
 null, null, 'seed', null, true, false),

-- ============ TEACHING DEFENSE ============

('global', null, 'coaching', 'teach_defense_progression',
 'Teaching defense: progression',
 'Teach in this order: (1) Stance and alignment (where to line up). (2) Key (eyes — where to look). (3) Read (what triggers your reaction). (4) Responsibility (gap, zone, or man). (5) Pursuit angle. Most youth defensive errors are stance/alignment, not effort. Fix the floor before adding ceiling.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'teach_defense_youth',
 'Teaching defense: youth',
 'Keep it gap-based, not read-based. Each defender owns one gap. "Your gap is between you and the player to your right — nothing crosses your face." Skip coverage concepts beyond zone-thirds. No pre-snap motion adjustments. Reward swarming to the ball — first two tacklers get a sticker.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'teach_defense_middle',
 'Teaching defense: middle school',
 'Introduce simple reads: LBs read the guard (high hat = pass drop, low hat = run fit). DBs read #2 then #1. Teach Cover 3 and Cover 1 as base coverages. Keep blitzes simple — one extra rusher, predictable lane. Players must know assignment vs run AND pass on every call.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'teach_defense_hs',
 'Teaching defense: HS',
 'Install front + coverage as a system. Players learn: their alignment vs each formation, run fit, pass drop, vs RPO, vs play-action. Use film cut-ups by play type (inside zone, power, mesh, smash). Build a vs-everything mental rolodex. Add 2-3 pressures per week, repping vs scout.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'teach_pursuit',
 'Teaching pursuit angles',
 'Critical and undertaught. Drill: ballcarrier runs sideline; defenders sprint to a spot ~5 yards in front of ballcarrier (not at him). Wrong angle = touchdown. Run pursuit drills 2-3x per week, every level. Most long touchdowns trace to one defender taking a flat angle.',
 null, null, 'seed', null, true, false),

-- ============ TEACHING OFFENSE TO READ DEFENSE ============

('global', null, 'coaching', 'teach_qb_reads_progression',
 'Teaching QB to read defense: progression',
 'Stage 1 (youth): "Look at the safety. One = run. Two = throw." Pre-snap only. Stage 2 (MS): pre-snap + identify man vs zone. Stage 3 (HS): full progression — pre-snap leverage, post-snap rotation, read keys (e.g., flat defender on smash). Stage 4 (varsity): full-field reads, hot/sight adjustments, RPO conflict reads.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'teach_safety_count',
 'Teaching the safety count',
 'Most fundamental pre-snap read. 1-high (one deep safety) = likely Cover 1 or 3, expect run support and tighter coverage. 2-high (two deep safeties) = likely Cover 2, 4, or 6, expect lighter box. Teach QBs and WRs to call it out together pre-snap. Even 8-year-olds can learn safety count.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'teach_man_vs_zone',
 'Teaching man vs zone identification',
 'Indicators of man: DBs face WRs, follow motion across formation, press alignment, no LBs in the middle of the field. Indicators of zone: DBs face QB, eyes in backfield, don''t follow motion (bump only), LBs at depth. Drill it pre-snap with cards every day for a week before testing in 7-on-7.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'teach_leverage_reading',
 'Teaching WRs to read leverage',
 'Inside leverage on DB = throw outside (out, fade, comeback). Outside leverage = throw inside (slant, dig, post). Even leverage = use release to win one side. WRs should call out leverage pre-snap so QB knows the answer before the snap. Drill in individual period 3-4x per week.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'teach_box_count',
 'Teaching box count for run game',
 '+1 box (defenders ≥ blockers + 1) = throw. Even or -1 box = run. Teach OL and RBs to count along with QB. In RPO offenses, this read happens every snap. Drill with cards: show defense, players call "run" or "pass" in unison.',
 null, null, 'seed', null, true, false),

-- ============ FUNDAMENTALS: THROWING ============

('global', null, 'coaching', 'fund_throwing_grip',
 'Throwing fundamentals: grip',
 'Pinky and ring finger on the laces, index finger toward the tip, thumb under. Small gap between palm and ball — finger pads control the throw, not the palm. For small hands, slide grip back closer to point. The ball should rotate tight and end nose-down on catch — that''s a clean release.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'fund_throwing_motion',
 'Throwing fundamentals: motion',
 'Feet shoulder-width, ball at chest. Step toward target with front foot. Hip and shoulder rotate together — power comes from the ground up, not the arm. Elbow above shoulder at release. Follow through with throwing hand finishing across opposite hip ("reach for your back pocket"). Most bad throws are from leaving feet flat.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'fund_throwing_youth_drill',
 'Throwing drills: youth',
 'Knee throw (both knees, focus on torso rotation), then one-knee throw (front knee up to add hip), then full standing. 5-yard partner spacing. Don''t worry about distance — focus on tight spiral and finishing motion. 50 reps per practice in week 1.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'fund_throwing_progressions',
 'Throwing drills: progressions',
 'Daily QB warm-up: 5 yds → 10 → 15 → 20 → 25 yds, 3 throws each, then back down. Adds: throwing on the run (left and right), throwing off back foot under pressure (HS only — youth should never), throwing to spots vs receivers. Keep volume manageable — arm care matters even at age 12.',
 null, null, 'seed', null, true, false),

-- ============ FUNDAMENTALS: HANDOFFS ============

('global', null, 'coaching', 'fund_handoff_mechanics',
 'Handoff fundamentals',
 'QB: present the ball to RB''s near hip with both hands, eyes downfield (not on the mesh). RB: near elbow up, far elbow down to form a pocket — ball goes IN, RB clamps. QB rides the mesh point one step, then pulls or releases. Most fumbles = RB looking for the ball instead of trusting the pocket.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'fund_handoff_drill',
 'Handoff drill',
 'Two-line drill: QB and RB face each other 3 yards apart. RB jogs through, QB hands off, RB sprints 5 yards. 20 reps each side, every practice for first 2 weeks of season. Add a defender slap at the mesh point in week 3 to teach ball security under contact.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'fund_carry_position',
 'Ball carry position (5 points of pressure)',
 'Five points of pressure: (1) fingertips over the tip, (2) ball point in palm, (3) ball pressed against forearm, (4) tucked against ribs, (5) bicep clamped over the top. Carry on the sideline arm (away from defenders). Switch hands when changing direction. Drill the "high and tight" position daily — gangs of fumbles trace to lazy carry.',
 null, null, 'seed', null, true, false),

-- ============ FUNDAMENTALS: CATCHING ============

('global', null, 'coaching', 'fund_catching_hands',
 'Catching fundamentals: hand position',
 'Above the waist: thumbs together, fingers up, form a diamond — catch with hands not body. Below the waist: pinkies together, fingers down. Look the ball into the hands ("see it tip to tuck"). Squeeze on contact, then immediately tuck to carry position. Drops at any level usually = eyes leaving ball before catch.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'fund_catching_drills',
 'Catching drills',
 'Daily: (1) Soft hands — partner tosses 10 yds, focus on hand position and tuck. (2) Eye discipline — number the ball with a marker, receiver calls out the number on catch (forces eyes-on-ball). (3) Concentration — catch through a light defender slap. (4) Body position — over-the-shoulder, low, behind, above. 50-100 catches per practice for skill positions.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'fund_catching_youth',
 'Catching: youth',
 'Use a smaller / softer ball if possible (Pee Wee size). Most youth drops are fear of the ball — kids close their eyes. Drill: receiver lies on back, partner drops ball into hands from 3 ft. Then sit, kneel, stand. Build trust with the ball before adding speed. Praise effort more than result.',
 null, null, 'seed', null, true, false),

-- ============ FUNDAMENTALS: BLOCKING ============

('global', null, 'coaching', 'fund_blocking_stance',
 'Blocking fundamentals: stance',
 '3-point stance: feet shoulder-width, toes-to-instep stagger, weight on balls of feet, fingertip down hand light (no weight forward — opponent reads it). Back flat, head up, eyes on assigned defender. Hips below shoulders. A bad stance loses the rep before the snap.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'fund_blocking_first_step',
 'Blocking: first step',
 'Direction of the first step is the play. Inside zone = playside foot 6 inches at 45°. Power = pull foot drops first. Pass set = kick slide back foot. The first step decides the rep — drill it in isolation 50 reps per practice. "Don''t guess; know your first step every play."',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'fund_blocking_hand_strike',
 'Blocking: hand placement',
 'Strike with thumbs up, hands inside the defender''s frame (chest plate, between the numbers). Hands outside = holding call. Lock out elbows to extend, then re-fit on contact. Keep eyes up — head goes where you''re looking. Finish through the whistle. Most pancakes start with hand placement.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'fund_blocking_youth',
 'Blocking: youth',
 'Don''t teach 3-point stance until age 9-10 — most younger kids can''t hold it. Use a 2-point athletic stance. Rule: "Get in the way" — body between defender and ballcarrier, hands to the chest. Skip combo blocks and pulls until they own one-on-one fits. Praise effort and finish, not technique perfection.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'fund_blocking_drills',
 'Blocking drills',
 'Daily: (1) Chute work — stay low under a chute. (2) Sled or board fits — strike, lift, drive. (3) Mirror drill — stay in front of a moving defender. (4) Fit-and-drive on partner. (5) 1-on-1 vs DL in inside-run period. Volume matters — OL needs 100+ contact reps per week to develop.',
 null, null, 'seed', null, true, false),

-- ============ FUNDAMENTALS: TACKLING ============

('global', null, 'coaching', 'fund_tackling_safety_first',
 'Tackling: head-out, head-up',
 'NEVER lead with the crown of the helmet. Modern technique: "Hawk tackle" or "Heads-Up" — eyes up, face across the ballcarrier''s chest, near shoulder strikes the thigh, wrap with both arms, drive the legs. Head goes to the side (cheek on chest), not into the contact. Drill EVERY practice — tackling form is the #1 youth/HS safety issue.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'fund_tackling_5_steps',
 'Tackling: 5 steps',
 '(1) Tracking — break down 3 yards from ballcarrier, feet under shoulders, hips low. (2) Near foot, near shoulder — same-side foot/shoulder hits. (3) Eyes up, head out — face across chest. (4) Wrap and roll hips — both arms wrap, hips snap up and through. (5) Drive feet — accelerate THROUGH the tackle, not to it. Drill all 5 in isolation, then chain.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'fund_tackling_drills',
 'Tackling drills',
 'Progression: (1) Form fits on knee — partner stands, tackler on knees, focus on shoulder/wrap. (2) Standing fits — slow, no drive. (3) Angle tackle — ballcarrier walks, tackler tracks and form-tackles. (4) Open-field drill — 5-yd box, ballcarrier vs tackler. (5) Live in team period. Reps before live: at least 100/week. USA Football "Heads Up" or Seahawks "Hawk Tackling" are good standardized programs.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'fund_tackling_youth',
 'Tackling: youth',
 'Spend MORE time on tackling form than on schemes — at every level, but especially youth. Use a tackling dummy or hold pads, not live contact, for 80% of reps. Live tackling drills should be controlled (thud, no take-down) until form is bulletproof. A poorly taught tackler is a future concussion.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'fund_flag_pulling',
 'Flag-pulling fundamentals (flag football)',
 'Flag-pull replaces tackling but the body mechanics rhyme. Same break-down posture: feet under shoulders, hips low, hands at flag belt height. Pull with one hand, swipe down (not across — across causes belt holding penalty). Track the hip, not the head — ballcarriers fake with their head. Drill: 1-on-1 in 5×5 grid 50 reps/week.',
 null, null, 'seed', null, true, false),

-- ============ GAME FEEDBACK INTO PRACTICE ============

('global', null, 'coaching', 'feedback_postgame_review',
 'Post-game review (coach)',
 'Within 24 hours: watch film once for emotional reactions, then again with notepad. Tag every play with: (1) call, (2) result, (3) reason for result (assignment, technique, athlete, scheme matchup). Build 3 lists: STOP doing (calls that lost), KEEP doing (calls that won), TEACH (where execution failed but the call was right).',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'feedback_team_review',
 'Team film/whiteboard review',
 'Sunday or Monday: 20-30 min total with team. Show 8-12 clips max — mix of good and bad. Focus on TEACHABLE moments (correctable technique, recognizable read), not blame. Skip plays that were just an opponent making a great play. Younger teams: skip film entirely; use whiteboard recap.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'feedback_practice_plan_loop',
 'Game → practice plan loop',
 'Every Monday practice plan should include: (1) 1-2 fundamentals where the team failed Saturday, (2) 1-2 plays that didn''t execute, run vs the look that beat them, (3) Add 1-2 new wrinkles for next opponent. Don''t install everything at once. The practice IS the response to the game — make it visible to the team ("we''re repping Y because of Saturday").',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'feedback_individual',
 'Individual player feedback',
 'Praise publicly, correct privately. After film: pull the player aside, show 1-2 clips, give ONE coaching point per session. More than one and nothing sticks. End every individual review with what they did WELL, not just corrections. Adolescents especially need to leave the conversation feeling capable.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'feedback_self_scout',
 'Self-scouting tendencies',
 'Every 3 games, chart your own tendencies: down/distance, formation, personnel, motion → play type. If you''re 80% run from a formation, opponents will key it. Mix calls from each look enough to keep them honest. Self-scout exposes what film opponents will see before they see it.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'feedback_practice_tempo',
 'Practice tempo as feedback',
 'If a play failed Saturday because of speed/effort (not scheme), the practice fix is TEMPO, not new install. Run the same play 10 times at game speed with 25-sec play clock. If kids can execute at game tempo, they''ll execute on Saturday. New plays don''t fix slow practices.',
 null, null, 'seed', null, true, false),

-- ============ COMMON MISTAKES NEW PLAYERS MAKE ============

('global', null, 'coaching', 'mistakes_new_general',
 'Common mistakes: new players (general)',
 '(1) Eyes on the ball/QB instead of their assignment. (2) Standing straight up — losing the leverage battle. (3) Stopping their feet on contact. (4) Listening to the crowd, not the QB cadence — false starts. (5) Quitting on the play after the ball is past them. (6) Not knowing pre-snap where they line up. Fix the floor before the ceiling.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'mistakes_new_qb',
 'Common mistakes: new QBs',
 '(1) Locking onto first read — telegraphs throw. (2) Throwing flat-footed — kills accuracy and power. (3) Patting the ball before throw — tips defense. (4) Looking at the mesh point on handoff. (5) Bailing the pocket too early. (6) Holding ball too low — strip risk. (7) Not setting feet on rollouts. Fix: rep footwork in every warm-up.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'mistakes_new_rb',
 'Common mistakes: new RBs',
 '(1) Looking at the ball during the handoff instead of the hole. (2) Carrying low/loose ball — fumbles. (3) Dancing in the backfield — hit the hole NOW. (4) Cutting too soon (before the hole opens). (5) Lowering the head into contact instead of running through. (6) Not finishing — falling on first contact. (7) No stiff arm or jump cut in their toolkit.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'mistakes_new_wr',
 'Common mistakes: new WRs',
 '(1) Looking back too early — slows route. (2) Rounding cuts instead of planting. (3) Catching with body (trapping) instead of hands. (4) Eyes off ball before secured. (5) Lining up offsides or wrong split. (6) Not running through the catch — slowing to catch, easy hit. (7) Loafing on plays where they''re not the primary.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'mistakes_new_ol',
 'Common mistakes: new offensive linemen',
 '(1) Standing up out of stance (high pads lose). (2) Hands outside the frame (holding). (3) Lunging on first step — off-balance, gets discarded. (4) Watching the ballcarrier instead of finishing block. (5) Stopping feet at contact. (6) Not communicating calls with neighbor lineman. (7) Whiffing when defender stunts/loops — stay on level.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'mistakes_new_dl',
 'Common mistakes: new defensive linemen',
 '(1) Standing up at snap — lost leverage. (2) Reading the backfield instead of the lineman in front of them. (3) Running around blocks instead of through them — gives up the gap. (4) No hand usage — letting OL into their chest. (5) Quitting when the ball goes the other way. (6) Jumping the snap chasing offsides. (7) Not finishing through the QB on pass rush.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'mistakes_new_lb',
 'Common mistakes: new linebackers',
 '(1) Reading the backfield instead of the OL (high hat / low hat). (2) Stepping up before reading — hit by play-action. (3) Over-pursuing — losing backside gap. (4) Tackling with eyes down. (5) Poor pass drop (drifting instead of getting to landmark). (6) Not communicating with secondary on motion. (7) Standing tall in coverage — slow break on the throw.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'mistakes_new_db',
 'Common mistakes: new defensive backs',
 '(1) Eyes in backfield in man coverage — receiver runs by them. (2) Backpedal too tall — can''t break. (3) Chopping feet at the top of route instead of driving. (4) Grabbing receiver early (PI). (5) Over-running plays in run support — bad angle. (6) Biting on double moves (committing on first move). (7) Catching with body on INT.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'mistakes_new_flag',
 'Common mistakes: new flag players',
 '(1) Trying to tackle instead of pulling flag. (2) Reaching across body for flag — penalty. (3) Stiff arm or guarding flag — penalty. (4) QB taking off too soon (in no-rush rules, must wait for count). (5) Ineligible lineman downfield. (6) Stepping out of bounds and trying to come back in. (7) Forgetting first-down line position.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'mistakes_parents_pressure',
 'Common mistake: parents/coaches creating pressure',
 'Yelling instructions from sideline (especially from parents) freezes young players. Players hear conflicting voices and stop processing. Solution: pre-game tell parents "cheer effort, leave the coaching to us." Coaches: ONE voice during plays — usually OC for offense, DC for defense. Quiet sidelines = better play.',
 null, null, 'seed', null, true, false),

-- ============ PRACTICE STRUCTURE ============

('global', null, 'coaching', 'practice_blueprint_youth',
 'Practice blueprint: youth (5-10), 60-75 min',
 '0-10 min: warm-up + form running. 10-20 min: fundamentals (handoff, catch, block) — rotate stations. 20-35 min: individual position work + small-group install. 35-50 min: team install (offense or defense). 50-60 min: scrimmage / situations. End on a win — last play should be a touchdown or stop.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'practice_blueprint_middle',
 'Practice blueprint: middle school (11-13), 90 min',
 '0-15 min: warm-up + dynamic. 15-30 min: individual / position group. 30-45 min: small-side competitive (1v1, 7-on-7). 45-65 min: team offense + team defense. 65-80 min: situational (2-min, red zone, 3rd-and-long). 80-90 min: special teams + finish on a win.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'practice_blueprint_hs',
 'Practice blueprint: HS, 2 hours',
 '0-15 min: warm-up. 15-35 min: individual/position. 35-50 min: 1-on-1, 7-on-7, inside run. 50-80 min: team offense + team defense (scripted). 80-100 min: situations (red zone, 2-min, 3rd down, 4th down). 100-110 min: special teams. 110-120 min: conditioning + team meeting. Script every minute.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'practice_script_plays',
 'Scripting team period plays',
 'Pre-write every play in team period — don''t freelance. Script forces you to (1) cover every install, (2) practice situations you''ll face, (3) get reps for every player. Hand the script to scout team so they know the look to give. Unscripted team periods devolve into "run your favorite plays" — same gaps every week.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'practice_competitive_periods',
 'Competitive periods',
 'End every practice with a competitive period — 1-on-1s, situational scrimmage, or "win-the-day" drill. Keep score. Adolescents need wins and losses to engage. Reward winning side (water break first, no conditioning) — losing side runs lightly. Builds compete habit that shows up Saturday.',
 null, null, 'seed', null, true, false),

-- ============ PSYCHOLOGY / CULTURE ============

('global', null, 'coaching', 'culture_praise_ratio',
 'Praise-to-correction ratio',
 'Research-backed: 5:1 praise to correction is the sweet spot for youth/adolescent learning. Below 3:1, kids tune out. Above 8:1, praise loses value. Specific praise ("good leverage on that block") beats generic ("good job"). Catch them doing it right.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'culture_one_voice',
 'One voice per play',
 'During a play, only ONE coach talks. Multiple voices = paralysis. Decide pre-practice: OC owns offensive calls, DC owns defensive calls, position coaches teach BETWEEN plays not during. Same rule on game day. The loudest sideline is rarely the best.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'culture_first_year_kids',
 'First-year players',
 'A first-year player is more likely to QUIT the sport than a returning player by a wide margin. Priorities for first-year kids: (1) safety, (2) fun, (3) friendships, (4) basic competence. Wins are last. If you optimize for wins at cost of fun, you''ll lose half the roster next year and the wins go with them.',
 null, null, 'seed', null, true, false),

('global', null, 'coaching', 'culture_playing_time',
 'Playing time philosophy (youth)',
 'Most youth leagues mandate minimum plays (often 8-10 per game). Hit it for every player or risk losing kids and parents. Beyond the minimum: rotate within positions, not just garbage time. A kid who only plays in blowouts learns "I''m not good enough" — and quits. Develop everyone.',
 null, null, 'seed', null, true, false);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — universal coaching methodology', null
from public.rag_documents d
where d.sport_variant is null and d.topic = 'coaching'
  and d.source = 'seed' and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
