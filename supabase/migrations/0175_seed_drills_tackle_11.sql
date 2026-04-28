-- Coach AI KB — Drills for Tackle 11-man.
-- Standard 11-on-11 American football. Covers Pop Warner, AYF, NFHS,
-- middle school, HS varsity. Largest drill catalog of any variant.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  age_tier, authoritative, needs_review
) values

-- ============ STANCE & START ============

('global', null, 'drill', 'tackle_stance_start',
 'Stance and start drill',
 'Setup: full position group in stance, coach with whistle/cadence.
Reps: 10 stance-and-start reps. Coach calls cadence ("Set... HUT"), players fire out 5 yards.
Coaching points: low pad level, first step quick (6 inches), full extension on the 5th step. Filming this from the side weekly is the highest-leverage 5 min in OL/DL coaching. Bad first steps = bad everything else.',
 'tackle_11', null, 'seed', 'AFCA OL/DL fundamentals',
 null, false, true),

-- ============ OL DRILLS ============

('global', null, 'drill', 'tackle_ol_chute_drill',
 'OL chute drill',
 'Setup: low chute (PVC frame, ~4 ft tall). OL fires out under the chute on cadence.
Reps: 10 reps.
Coaching points: forces low pad level. If a player stands up under the chute, he gets clobbered (gently — pad on PVC). Trains the body to play low. Run weekly.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'tackle_ol_run_block_progression',
 'OL drive block progression',
 'Setup: OL pair against a hand shield held by a coach or partner.
Reps: 5 each — drive block straight ahead, drive block at 45°, double-team combo (2 OL on 1 shield).
Coaching points: fit (hand placement on chest plate, thumbs up) → drive (short steps, hips low) → finish (through the whistle). Common error: rising up on the drive — once you''re upright, you''re losing.',
 'tackle_11', null, 'seed', null,
 null, false, true),

('global', null, 'drill', 'tackle_ol_pass_pro_kick_slide',
 'OL pass-pro kick slide drill',
 'Setup: cones at 1, 3, 5 yards behind LOS marking the pocket. OL in pass set.
Reps: coach simulates rusher (jog or move with hand shield). OL kick-slides to maintain leverage, punches on contact.
Coaching points: stay square, eyes on hip/numbers, hands inside. 50 sets per week minimum for HS OL. Reset feet between reps — late hands = sack.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'tackle_ol_pulls_traps',
 'OL pull and trap drill',
 'Setup: 3 cones marking the pull path. OL in stance, coach calls "Power" or "Counter" or "Trap".
Reps: 8 reps each direction.
Coaching points: open step at 45°, gain ground laterally, square shoulders to LOS to find target. Pulls are timed — pull too slow = blown play. Stopwatch the pull from snap to first contact; goal is <1.2 sec.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'tackle_ol_combo_block',
 'OL combo (double-team) block',
 'Setup: 2 OL vs 1 DL + 1 LB.
Reps: 6 reps. OL combo on DL, then post-OL climbs to LB at the right moment.
Coaching points: combo is staying together until the second-level defender commits. The "release" timing is a feel — practice it. Most-busted block in run game is the combo release.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

-- ============ DL DRILLS ============

('global', null, 'drill', 'tackle_dl_get_off',
 'DL get-off + first-step drill',
 'Setup: DL in stance, coach with hand-on-ball cue.
Reps: 10 first-step reps. Coach moves hand, DL fires.
Coaching points: react on the BALL, not the OL. First step low and short (6 inches). Daily drill — 5 min. Single highest-leverage DL fundamental.',
 'tackle_11', null, 'seed', null,
 null, false, true),

('global', null, 'drill', 'tackle_dl_pass_rush_moves',
 'DL pass-rush move circuit',
 'Setup: 4 stations (rip, swim, bull, long-arm). OL partner with hand shield at each.
Reps: 5 reps per move, rotate.
Coaching points: pick the right move per OL set: high punch = rip/swim; soft set = bull; jump set = inside counter. Players need 2 go-to moves and 1 counter. Don''t teach 5 moves equally — teach 2 well.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'tackle_dl_block_destruction',
 'DL block destruction (escape blocks)',
 'Setup: DL vs OL with hand shield. OL fires out to drive block.
Reps: 6 reps. DL must stack the block (hands inside, lock out arms), shed to one side, find ball.
Coaching points: hands FIRST, eyes SECOND. Common error: trying to look around the OL before controlling him. You can''t shed what you haven''t stacked.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'tackle_dl_inside_run_drill',
 'Inside run drill (DL vs OL live)',
 'Setup: 5 OL + RB + QB vs 4 DL + 2 LBs. RB takes inside zone or power.
Reps: 8-10 plays.
Coaching points: live tempo, full pads. DL maintains gap discipline, LBs read keys, OL works combos and climbs. The most important practice period for tackle football. Run 2x/week minimum.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

-- ============ TACKLING DRILLS ============

('global', null, 'drill', 'tackle_form_tackling',
 'Form tackling progression (Heads Up)',
 'Setup: tackler vs ballcarrier holding a hand shield. Cone marks the tackle target.
Reps: 6 reps. Phases: (1) breakdown, (2) buzz feet, (3) hit (near shoulder, head across), (4) wrap, (5) drive 5 steps.
Coaching points: USA Football Heads Up technique. NEVER lead with the head. Daily during install, weekly minimum in-season. Most kids ''know'' how to tackle but their technique drifts under fatigue — drill it tired.',
 'tackle_11', null, 'seed', 'USA Football Heads Up Tackling',
 null, true, false),

('global', null, 'drill', 'tackle_angle_tackle',
 'Angle tackle drill',
 'Setup: tackler 5 yds inside the ballcarrier''s path. Ballcarrier runs 30 yds at 3/4 speed.
Reps: 6 reps each side.
Coaching points: take an angle to the ballcarrier''s near hip. Don''t over-pursue (he cuts back) or under-pursue (he runs by). Same Heads Up form on contact: near shoulder, head across, wrap, drive. Most missed tackles in games are angle tackles.',
 'tackle_11', null, 'seed', 'USA Football Heads Up Tackling',
 null, true, false),

('global', null, 'drill', 'tackle_open_field_1v1',
 'Open-field 1v1 tackle drill',
 'Setup: 5x10 yard box. Ballcarrier vs tackler, ballcarrier picks any direction to escape.
Reps: 6 reps.
Coaching points: in space, the tackler MUST break down to react to the cut. Lower body, eyes on hips, force the runner to commit. Tier-3+ drill — younger kids practice form first, then graduate to open field.',
 'tackle_11', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'tackle_pursuit_drill',
 'Pursuit drill (every-defender-touches)',
 'Setup: full defense aligned, RB takes a pitch sideline.
Reps: 6 reps. Every defender must touch ballcarrier or pursue to within 6 yds.
Coaching points: no defender takes a wrong angle (over-pursue = cutback lane). Conditioning + angles + full-team effort in one drill. Use as a finisher 1-2x/week.',
 'tackle_11', null, 'seed', null,
 null, false, true),

-- ============ QB DRILLS ============

('global', null, 'drill', 'tackle_qb_drop_progression',
 'QB drop + read progression',
 'Setup: QB under center or shotgun, 3 WRs running a 3-receiver concept.
Reps: 8-10 plays. Each rep, QB drops, scans 1→2→3, throws to the open WR or check-down.
Coaching points: discipline of progression. Most HS QBs lock onto #1. Drill the eye scan. Coaches grade with cards: which read did the QB take vs which was actually open.',
 'tackle_11', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'tackle_qb_play_action',
 'QB play-action mechanics',
 'Setup: QB + RB + WRs. QB executes the run fake (handoff motion, ball squeezed against RB''s belly), then drops back and reads.
Reps: 8 reps.
Coaching points: SELL THE FAKE — body, ball, eyes all on the run for 1 full second. Defense has to bite. Lazy fakes = covered receivers. Most missed PA throws come from a soft fake.',
 'tackle_11', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'tackle_qb_pocket_movement',
 'QB pocket movement drill',
 'Setup: QB in pocket. 4 cones around QB at 4-yd radius. 2 coaches with hand shields simulate edge rush from each side.
Reps: 8 reps. QB must throw without crossing the cones — slide to escape pressure laterally.
Coaching points: NEVER drift back. Slide to space inside the cones, eyes downfield, throw. Tier-4+ drill — younger QBs are too inconsistent.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

-- ============ RB DRILLS ============

('global', null, 'drill', 'tackle_rb_ball_security_gauntlet',
 'RB ball-security gauntlet',
 'Setup: 6 hand shields/bags lined up 2 yards apart. RB runs through, defenders punch at ball.
Reps: 5 trips through gauntlet, switch ball-arm each trip.
Coaching points: high-and-tight, 5 points of contact. After every trip coach checks: did the ball move? If yes, that''s a fumble. Drill weekly minimum, daily during fumble-prone seasons.',
 'tackle_11', null, 'seed', 'USA Football ball security curriculum',
 null, false, true),

('global', null, 'drill', 'tackle_rb_vision_track',
 'RB vision drill (3-track)',
 'Setup: 3 cones marking 3 holes (A-gap, B-gap, C-gap). Coach signals which hole opens just after RB takes handoff.
Reps: 8 reps.
Coaching points: press the original hole at full speed, react to the signal. No dancing. Decision in 0.3 sec. Builds the press-and-cut reflex that elite RBs use on inside zone.',
 'tackle_11', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'tackle_rb_pass_pro_1v1',
 'RB pass pro 1v1',
 'Setup: RB vs LB or DE simulating blitz, hand shield.
Reps: 6 reps. RB punches, drops hips, drives feet.
Coaching points: aim point near number, NEVER duck head. Most common error: getting low on a SS blitz and getting bowled over. Stay tall, lock out, drive feet.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

-- ============ WR DRILLS ============

('global', null, 'drill', 'tackle_wr_release_press',
 'WR release vs press (tackle football)',
 'Setup: WR vs DB in press alignment, hand shield optional.
Reps: 6 reps each — outside release, inside release, stack/swim.
Coaching points: footwork beats hands. Outside foot back in stance, hard 1st step inside or out, swat the DB''s near hand with the off-hand. Drill against jam aggression — DBs in tackle play press much more than flag.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'tackle_wr_blocking_circuit',
 'WR perimeter block circuit',
 'Setup: WR vs DB. WR engages on a stalk block; coach holds shield as DB.
Reps: 6 reps.
Coaching points: in tackle football, WR blocking on the perimeter unlocks 30+ yard runs. Approach (1-2 yds), break down, square hips, hands inside, drive feet. Effort matters more than technique here.',
 'tackle_11', null, 'seed', null,
 'tier3_12_14', false, true),

-- ============ DB DRILLS ============

('global', null, 'drill', 'tackle_db_backpedal_break',
 'DB backpedal-and-break drill',
 'Setup: DB starts in off coverage, cone 8 yds in front.
Reps: 10 reps. DB backpedals to cone, plants on whistle, drives forward (or breaks 45° on a coach''s call).
Coaching points: short choppy backpedal steps, knees bent, hips low. Plant foot OUTSIDE the body line. Drives are explosive; DBs lose tackles when their plant foot is inside their hips.',
 'tackle_11', null, 'seed', null,
 null, false, true),

('global', null, 'drill', 'tackle_db_hip_flip',
 'DB hip-flip and run drill',
 'Setup: DB in cover-2, WR runs vertical past 12 yds.
Reps: 8 reps.
Coaching points: open hips on the WR''s side at 10-12 yds, run with him, head turn AT 15 yds to find the ball. Common error: not turning the head — running blind = PI flag. Drill the head turn separately first.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'tackle_db_press_jam',
 'DB press jam drill',
 'Setup: DB in press, WR on LOS.
Reps: 6 reps. DB jam with inside hand to chest, transition to trail.
Coaching points: short kick-step (don''t commit), then jam. Eyes on WR''s numbers/waist. A successful jam disrupts the route timing by 0.5 sec — that''s a sack on a quick game pass.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

-- ============ LB DRILLS ============

('global', null, 'drill', 'tackle_lb_keys_read',
 'LB keys read drill',
 'Setup: 5 OL + RB + QB. LB reads guard.
Reps: 8 reps with mix of run plays + pass.
Coaching points: eyes on the guard for 0.5 sec. Step DOWN = run your way (fill); PULL = run away (pursuit angle); PASS SET = drop. Overcommit = blown play either way. Drill the discipline.',
 'tackle_11', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'tackle_lb_shed_pursue',
 'LB shed-and-pursue drill',
 'Setup: LB vs OL on a hand shield. Ballcarrier runs sideline behind.
Reps: 6 reps.
Coaching points: lock out OL with hands, separate, take pursuit angle to ballcarrier. Don''t go around — stack-and-shed first. Tier-3+ drill.',
 'tackle_11', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'drill', 'tackle_lb_zone_drop',
 'LB zone-drop drill',
 'Setup: LB at LOS, drop spots marked at 10-12 yds.
Reps: 6 drops. Coach throws to receiver running through zone; LB breaks on the ball.
Coaching points: get to spot first, then react. Eyes on QB''s shoulders. Don''t open hips and run with vertical receivers — pass off to safety. Tier-4 drill.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

-- ============ SPECIAL TEAMS DRILLS ============

('global', null, 'drill', 'tackle_st_punt_protection',
 'Punt protection drill',
 'Setup: full punt unit aligned vs scout return team.
Reps: 6 punts. Every player has a block-then-cover assignment.
Coaching points: protect for 1.5 sec, then cover lanes. The most-overlooked area in HS football. Bad punt teams lose 8-10 hidden yards every game. Drill weekly minimum.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'tackle_st_kickoff_lanes',
 'Kickoff coverage lane drill',
 'Setup: 10-man kickoff team in lanes (L5, L4, L3, L2, L1, R1, R2, R3, R4, R5).
Reps: 6 kickoffs. Each player stays in his lane to the ballcarrier.
Coaching points: stay in lane until 15 yds beyond ball. Don''t bunch (returner cuts through the gap). Force the return to the sideline. Tackling form is identical to defensive form — daily Heads Up reps cover both.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'tackle_st_field_goal_block',
 'FG block drill',
 'Setup: FG protection unit vs FG block unit.
Reps: 6 attempts.
Coaching points: rusher times the snap (count snapper''s rhythm), aims for the block point above the holder''s head. Most blocks come from the edge — train edge rushers'' get-off and bend.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

-- ============ TEAM DRILLS ============

('global', null, 'drill', 'tackle_team_inside_run',
 'Inside run team period',
 'Setup: full O vs full D, focus on inside zone, power, counter.
Reps: 12 plays per period.
Coaching points: full pads, full speed (HS) or 3/4 speed (youth). Most-important team period in tackle football. Linemen earn their reps here.',
 'tackle_11', null, 'seed', null,
 null, false, true),

('global', null, 'drill', 'tackle_team_7on7',
 '7-on-7 (skeleton pass)',
 'Setup: QB + 2 RBs + 2 WRs vs 7 defenders (no OL/DL).
Reps: 12-15 plays per period.
Coaching points: practice pass concepts at full speed without protection. Defense practices coverage. Daily in-season.',
 'tackle_11', null, 'seed', null,
 null, false, true),

('global', null, 'drill', 'tackle_team_full_team',
 'Full-team period',
 'Setup: 11-on-11, scripted plays, full pads.
Reps: 15-20 plays per period.
Coaching points: most-realistic rep available. Run scripted scout-card looks for both offense and defense. Track stats: TDs, INTs, sacks, completion %. Diagnose from stats, not from feel.',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

-- ============ TIER-1 (5-8) TACKLE NOTE ============

('global', null, 'drill', 'tackle_tier1_warning',
 'Tier-1 (5-8) tackle football: scope',
 'Most leagues do NOT allow full-contact tackle football for ages 5-7 (flag is the Pop Warner / NFHS / state recommendation). When tier-1 tackle is allowed (8U), simplify dramatically:
- Heads Up tackling form drills only — NO live tackling for first 2 weeks.
- 4 plays in playbook (sweep, dive, off-tackle, simple pass).
- Defense: 1 front (5-2 or 6-1), no blitzes.
- Practice limited to 60-75 min.
Talk to parents about contact philosophy in pre-season meeting.',
 'tackle_11', null, 'seed', 'Pop Warner / USA Football age-appropriate guidelines',
 'tier1_5_8', false, true);
