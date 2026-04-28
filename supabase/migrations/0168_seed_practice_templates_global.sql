-- Coach AI KB — Universal practice plan templates and structural patterns.
-- These are markdown-shaped templates Cal retrieves and adapts when generating
-- practice plans. They include block timing, parallel-station patterns
-- (skill-vs-line splits), and seasonal arcs.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  age_tier, authoritative, needs_review
) values

-- ============ STRUCTURAL PRINCIPLES ============

('global', null, 'practice_template', 'block_structure_principles',
 'Practice block structure: universal principles',
 'Every effective practice has the same skeleton: WARM-UP (8-15 min) → INDIVIDUAL/POSITION (15-25 min) → GROUP (15-25 min, e.g. 7-on-7, OL/DL, inside run) → TEAM (15-25 min) → CONDITIONING/FINISHER (5-10 min). Never skip individual — fundamentals decay weekly. Team period is the smallest portion of practice for youth (more reps for fewer kids in smaller groups), the largest portion at HS (install volume). Total time: 60 min for ages 5-8, 75-90 min for 9-13, 2-2.5 hours for HS.',
 null, null, 'seed', 'USA Football, AFCA practice planning materials',
 null, false, true),

('global', null, 'practice_template', 'parallel_stations_pattern',
 'Parallel stations: skill vs line split',
 'Default split for tackle football: SKILL group (QBs, RBs, WRs, DBs, LBs) and LINE group (OL, DL) work in parallel during individual + group periods. Example 20-min block: Skill runs 3 rotating stations (release/catching, route tree, ball security) at 6 min each; Line runs 3 stations (stance/start, hand fight, pulls/traps) at 6 min each. Coaches own one station and stay; players rotate. Switch sides for the second 20-min block so position coaches eventually see every drill cycle. For flag, replace LINE with rushers/blitzers and add a separate ball-carrier station.',
 null, null, 'seed', 'AFCA clinic notes (parallel rotation pattern)',
 null, false, true),

('global', null, 'practice_template', 'station_rotation_logistics',
 'Station rotation logistics',
 'Use a horn/whistle on a fixed interval. Players rotate, coaches stay. Station signs (cones with letters or numbers) mark the spots. Pre-assign rotation order at the start of practice — ''Group A starts at station 1, B at 2, C at 3, rotate clockwise on the horn''. This eliminates 3-5 minutes of ''where do I go?'' per period. For groups of 4+ kids per station, pair them so one runs and one resets equipment — keeps tempo high. Never put your weakest coach on your most important fundamental.',
 null, null, 'seed', null,
 null, false, true),

-- ============ TIME BUDGETS ============

('global', null, 'practice_template', 'time_budget_youth_60',
 '60-minute youth practice (ages 5-8)',
 'Sample structure for tier-1 youth (60 min, twice/week):
- 0:00-0:08 — Dynamic warm-up game (sharks-and-minnows, freeze tag)
- 0:08-0:23 — Individual fundamentals (3 stations, 5 min each: ball carry, catching, flag pulling/form tackle)
- 0:23-0:38 — Group (offense walk-through one new play OR 5-on-5 partial team)
- 0:38-0:53 — Team scrimmage / situational (1st-and-goal, 4th-and-2, etc.)
- 0:53-1:00 — Cool-down + team talk (one teaching point, one piece of praise, parent reminders)
Hard rules: every kid touches the ball every individual block, no kid stands still more than 30 sec, end on time so parents trust you.',
 null, null, 'seed', 'USA Football Heads Up youth practice templates',
 'tier1_5_8', false, true),

('global', null, 'practice_template', 'time_budget_youth_90',
 '90-minute youth practice (ages 9-13)',
 'Sample structure for tier-2 / tier-3 youth (90 min, 2-3x/week):
- 0:00-0:12 — Warm-up: jog + dynamic series (8 movements) + 2 min sport-specific
- 0:12-0:30 — Individual (position-specific, 18 min total, parallel stations)
- 0:30-0:50 — Group periods (offense: 7-on-7 or pass skel for skill; OL vs LB inside drill for line — 10 min each, swap)
- 0:50-1:15 — Team install / scrimmage (run install script, 12-15 plays, both sides of ball)
- 1:15-1:25 — Conditioning (6-8 sprints OR pursuit drill — make it competitive)
- 1:25-1:30 — Team talk: one teach, one praise, scouting reminder for next opponent',
 null, null, 'seed', null,
 'tier2_9_11', false, true),

('global', null, 'practice_template', 'time_budget_hs_120',
 '2-hour HS practice (in-season Tuesday/Wednesday)',
 'Sample HS in-season midweek (120 min):
- 0:00-0:15 — Warm-up + dynamic + position-specific movement prep
- 0:15-0:35 — Individual (position groups, 20 min, drills tied to this week''s game plan)
- 0:35-0:55 — Group (Inside Run / 7-on-7 / Pass Pro — split offense and defense across 3 stations on different fields, rotate)
- 0:55-1:30 — Team (Tuesday: offense install + 3rd down vs scout D. Wednesday: defense install + red zone vs scout O. 25-30 plays scripted.)
- 1:30-1:45 — Special teams (one phase per day — never skip; STs decide ~15% of games)
- 1:45-1:55 — Conditioning (position-specific, see conditioning_hs)
- 1:55-2:00 — Team meeting + scouting card hand-off',
 null, null, 'seed', 'AFCA in-season practice planning',
 'tier4_hs', false, true),

('global', null, 'practice_template', 'time_budget_hs_walkthrough',
 'HS Thursday walkthrough (60-75 min)',
 'Day before game. Pads off, helmets optional. Goal: mental reps, not physical work. Structure:
- 0:00-0:10 — Warm-up (light, no dynamic series — save the legs)
- 0:10-0:25 — Offense walkthrough vs scout cards: every formation + every play vs the looks scouting expects
- 0:25-0:40 — Defense walkthrough: every front + every coverage vs scout offense
- 0:40-0:55 — Special teams: every phase, every alignment
- 0:55-1:05 — Two-minute, four-minute, end-of-half situations (mental reps)
- 1:05-1:15 — Team talk, captains, travel logistics
NO live tempo. NO conditioning. Goal is fresh legs Friday and a clean mental picture.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

-- ============ WEEKLY ARCS ============

('global', null, 'practice_template', 'weekly_arc_in_season',
 'In-season weekly practice arc',
 'Standard high-school week (Friday game):
- SAT — Off or film (coaches grade game)
- SUN — Off (NFHS rule in most states; if allowed, captains-only film)
- MON — Recovery/lift + opponent install meeting (45 min). No pads or shells.
- TUE — Hardest practice. Full pads. Offense day (heavy install + 3rd down + 2-min).
- WED — Heavy. Full pads. Defense day (heavy install + red zone + situations).
- THU — Walkthrough (see hs_walkthrough). Helmets, no pads.
- FRI — Game.
Youth (Saturday game): MON skipped, TUE + THU practice, WED off, FRI walkthrough or off. 2-3 sessions/week max for youth.',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'practice_template', 'weekly_arc_preseason',
 'Pre-season weekly arc (HS, install camp)',
 '2-week install camp before first game. Phase 1 (week 1): teach. Phase 2 (week 2): rep + situational.
Phase 1 daily structure: 2-a-days where allowed (NFHS heat-acclim rules: helmets-only days 1-2, shells days 3-5, full pads day 6+). AM = install + walkthrough (90 min). PM = conditioning + skills (60 min).
Phase 2: single 2.5-hour session/day. Tuesday/Wednesday like in-season. Friday = scrimmage vs another school.
Critical: front-load install. Anything not installed by end of week 1 won''t be game-ready in week 3. Save situational depth (2-min, 4-min, hands-team) for week 2.',
 null, null, 'seed', 'NFHS heat acclimatization guidelines',
 'tier4_hs', false, true),

('global', null, 'practice_template', 'weekly_arc_youth',
 'Youth weekly practice arc',
 'Most youth leagues = 2 practices + 1 game per week. Don''t add a 3rd practice unless you have committed volunteers and the kids have stamina; 3rd practice usually hurts retention more than it helps performance.
Sample (Saturday game): TUE + THU practice (75-90 min each), no helmets day 1 of camp, ramp from there. Off-week 1 of season = teach the install (5-7 plays each side). Off-week 2 = situational. Mid-season = polish + scout-team work for next opponent.
Cap each kid at 4 hours of football per week (practice + game + film). Kids burn out and quit at higher volumes.',
 null, null, 'seed', null,
 'tier2_9_11', false, true),

-- ============ INSTALL SCRIPTS ============

('global', null, 'practice_template', 'install_first_week',
 'First-week install script',
 'Week 1 of season install (universal). Don''t exceed this menu — install <= ability to rep.
Day 1: Stance & start, cadence, 2 base run plays (inside zone or power + counter), 1 base pass concept (mesh or stick), base front (4-3 or 4-2-5 depending on level), base coverage (cover 3 most common). Kids leave knowing how to line up.
Day 2: Add 2nd formation (trips), 2 more concepts (a perimeter run + a vertical pass), introduce 2nd coverage (cover 2 or man-free). Walkthrough first hour, half-speed second.
Day 3: First scrimmage tempo. Reps over install. Add only 1 new piece (motion or RPO).
Coaches'' rule: a player must execute a play at full speed without thinking before adding another play.',
 null, null, 'seed', 'AFCA install philosophy (Saban, Belichick, Harbaugh derivatives)',
 null, false, true),

('global', null, 'practice_template', 'install_youth_minimum',
 'Youth minimum viable install',
 'For ages 8-13 with limited practice time, the entire season can run on:
OFFENSE: 1 base formation + 1 trips/empty look. 4 runs (inside, outside, power, counter or sweep). 4 passes (1 quick screen, 1 stick/spacing, 1 vertical, 1 boot). 1 jet motion.
DEFENSE: 1 front (4-3 or 5-2 in youth, or 6-1 for 6-man). 2 coverages (cover 3 + man, or cover 2 + cover 3). 1 blitz (LB green dog or A-gap).
SPECIAL TEAMS: Punt safe, kickoff safe, PAT, 1 onside.
That''s 14 offensive plays + 4 defensive looks + 4 ST = 22 things to know cold. Add more only after these are flawless. Most youth teams lose because they install 40 plays and run none of them well.',
 null, null, 'seed', null,
 'tier2_9_11', false, true),

('global', null, 'practice_template', 'install_hs_progression',
 'HS install progression (4-week pre-season)',
 'Week 1: Base run game (3-4 concepts), base pass game (4-5 concepts), base front + 2 coverages, base ST (kickoff, punt, PAT). Reps every day.
Week 2: Add tempo, add motion variations, add 2nd-front looks (over/under/odd), add cover 2 + man-free, add red-zone packages (off and def).
Week 3: 3rd-down menu, 4-min, 2-min, hands-team, fake punt, fake FG. Game-plan-style scrimmage.
Week 4: Polish. Cut anything not run cleanly in scrimmage. ''If we can''t rep it, we don''t run it.''
A useful ratio: install : rep = 1 : 5. For every minute teaching a new play, plan 5 minutes of repping it before game day.',
 null, null, 'seed', 'AFCA pre-season install (Bill Walsh / Mike Leach derivatives)',
 'tier4_hs', false, true),

-- ============ PARALLEL ACTIVITIES PATTERNS ============

('global', null, 'practice_template', 'parallel_qb_wr_ol',
 'Parallel pattern: QB+WR / RB / OL+DL splits',
 'For 3-coach minimum staff, run parallel as: (1) QB+WR — pass routes vs air or against LB drops; (2) RB — ball security circuit + pass protection vs hand shields; (3) OL+DL — 1-on-1 pass pro / run block. 15 min, swap 2 of the 3 groups: now QB+RB run play-action, WR runs blocking on perimeter screens, OL+DL repeat pulls/traps. By end of period every position has touched the ball, run a route, made contact, and rep''d a base block.',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'practice_template', 'parallel_offense_defense_split',
 'Parallel pattern: full offense / full defense field split',
 'For larger squads + 6+ coaches: split fields. Half the staff runs offense (QB+WR+RB on field A: 7-on-air or 7-on-7 vs scout D), other half runs defense (DL+LB+DB on field B: pursuit + tackling circuit + coverage drops). 20 min per side, then merge for team period. Critical: pre-script what scout team will do for each side so the live group always sees realistic looks.',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'practice_template', 'parallel_youth_rotation',
 'Parallel pattern: 3-station youth rotation',
 'For youth with 1-2 coaches: 3 stations, rotate every 5-7 min. Station 1 (head coach): the day''s teaching point — new play, key fundamental. Station 2 (asst coach): conditioning-disguised-as-fun (relays, tag, agility ladder). Station 3 (parent helper or self-running): ball security gauntlet, catching wall, tire run. Kids never stand still, every kid gets head-coach time, conditioning is built in.',
 null, null, 'seed', null,
 'tier1_5_8', false, true),

-- ============ SCOUT TEAM OPERATIONS ============

('global', null, 'practice_template', 'scout_team_principles',
 'Scout team principles',
 'Scout team simulates the upcoming opponent. Run by a coach with cards (printed plays + alignments) or a script. Two rules: (1) Scout team runs the OPPONENT''s plays, not ours. (2) Scout team runs 100% effort or you''re wasting your starters'' reps. If your scout team is bad, your defense looks great in practice and gets shocked Friday. Reward scout-team award (helmet sticker, Player of the Week, etc.) — it matters and most programs ignore it.',
 null, null, 'seed', 'AFCA / Saban scout team philosophy',
 'tier4_hs', false, true),

('global', null, 'practice_template', 'scout_cards_format',
 'Scout cards format',
 'A scout card shows: (1) formation (X = WR, slash = RB, etc.); (2) play call name (opponent''s — "26 Power", "Stick"); (3) snap count; (4) any motion. Card holders show the card to scout players, players line up and run it. Use 5x7 index cards or print on cardstock — laminate for reuse. Color code: red = base run, blue = base pass, green = pressure/blitz, yellow = special. Most teams need 30-40 cards/week for offense + defense scout.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

-- ============ SITUATIONAL PRACTICE ============

('global', null, 'practice_template', 'situational_two_minute',
 'Two-minute drill practice',
 'Run 2-min weekly minimum once you have an offense installed. Setup: ball at own 25, 2:00 on clock, 2 timeouts, down by 4. Coach script: every 3rd play change the situation (sack, incomplete, completion + run for clock). Players manage the clock — stop it if they want timeouts conserved. Defense plays prevent (2-deep zone, rush 4). End-state: TD or game-clinching FG. Run it 2-3 times per session, change starting field position.',
 null, null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'practice_template', 'situational_red_zone',
 'Red zone practice block',
 'Once a week. 15-min block. 3 sets:
1. 1st-and-goal at 5 — high-percentage call (boundary fade, slant-flat, sneak)
2. 3rd-and-goal at 8 — pick concept or quick out
3. 4th-and-2 from 10 — 4-minute mode call, must convert
Defense pre-script: cover 0, cover 2 man-under, cover 3 (vary). Track conversion rate weekly — best red-zone teams convert 65%+. Talk through misses immediately, don''t save it for film.',
 null, null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'practice_template', 'situational_4th_short',
 '4th-and-short practice',
 'Once a week. 10-min block. Set ball at midfield, 4th-and-1. Run your top 3 short-yardage calls (sneak, dive, power). Defense aligns goal-line front. Track conversion %. Most teams have a 70-80% conversion rate on 4th-and-1 — if you''re below 70% you have a fundamental problem (alignment, snap, leverage), not a play-calling problem. Practice the snap-to-go-time (cadence + jump for sneaks) at full speed.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'practice_template', 'situational_backed_up',
 'Backed-up offense practice',
 'Ball at own 1-3 yard line. Goal: get to the 10 with possession. Practice your safest run + safest pass. Most-common error: a sack here = safety (2 points + ball back to opponent). QB MUST know: if pressured, throw it away or take the loss in-bounds. Run weekly for HS, monthly for youth. 5-10 min block.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

-- ============ CONDITIONING-AS-PRACTICE ============

('global', null, 'practice_template', 'finisher_pursuit_drill',
 'Pursuit drill finisher (works any level)',
 'Defense lines up base front + coverage. Ball carrier (RB or coach) takes a snap and runs sideline-to-sideline at 3/4 speed. Every defender must touch the ballcarrier or pursue to the sideline within 6 yards of ball — measure with cones. Reset, repeat the other direction. 6-10 reps. This is conditioning, fundamental, AND pursuit angles in one drill. Use as a finisher 1-2x/week. Players tend to like it because it''s competitive (last man to make contact = 5 push-ups).',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'practice_template', 'finisher_perfect_play',
 '"Perfect play" finisher',
 'Run the same play 5 times in a row at 100% tempo. If anyone busts (wrong assignment, wrong alignment, missed block, dropped ball), the count resets. Goal: 5 perfect reps. Builds tempo + assignment focus + low-grade conditioning. End practice on this — it forces players to focus when tired, which is the goal. Pick a play they should already know cold. Don''t use this on a new install (frustrating).',
 null, null, 'seed', null,
 null, false, true);
