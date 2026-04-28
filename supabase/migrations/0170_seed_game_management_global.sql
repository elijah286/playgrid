-- Coach AI KB — Universal game management coaching.
-- Clock management, situational football, sideline behavior, halftime,
-- challenge/timeout decisions, in-game adjustments.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  age_tier, authoritative, needs_review
) values

-- ============ CLOCK MANAGEMENT ============

('global', null, 'game_management', 'clock_two_minute_offense',
 'Two-minute offense: clock principles',
 'Inside 2:00 of a half, every snap is a clock decision. Rules to teach:
- INCOMPLETE pass stops the clock; COMPLETE pass + in-bounds runs the clock until the ball is set.
- Spike clocks the ball at ~3 sec elapsed (cheaper than a TO).
- A timeout is worth ~30-40 sec of clock if used right after a clock-running play.
- Out-of-bounds is the highest-leverage outcome — train WRs to fight for sideline.
Default rule: if you have any timeouts and need 50+ yards, run a no-huddle tempo offense without spiking. Spike only if you''re out of TOs OR confused.',
 null, null, 'seed', 'Belichick / Walsh end-of-half doctrine',
 'tier4_hs', false, true),

('global', null, 'game_management', 'clock_four_minute_offense',
 'Four-minute offense: bleed clock',
 'Up by 1-8 with 4:00 left, your job is to END THE GAME. Run plays only (defense knows it; doesn''t matter). Stay in-bounds at all costs — coach RBs to FALL DOWN in-bounds rather than fight for an extra yard near the sideline. First downs are worth more than yards: a 2-yard run on 3rd-and-1 ends the game; a 30-yard TD often gives the ball back. Take a knee with the lead AND first-down clock running. Don''t over-call — most 4-min losses come from getting cute.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'game_management', 'clock_kneel_math',
 'Victory formation kneel math',
 'Game-clock math (HS, NFHS rules — clock keeps running on first down):
- 3 kneels burn 3:00 of clock if opponent has no timeouts.
- Each opponent timeout removes ~40 sec.
- Opponent with 3 TOs and 1:30 left CAN get the ball back if you take 3 kneels (use 1:30, gain 0 yards, punt).
- Rule: if 3 kneels can run out the clock, kneel. Otherwise run the ball INSIDE for safe 1-2 yard gains, stay in-bounds, force them to use TOs.
Always rep victory formation in pre-season. The most expensive turnovers in coaching history have happened on kneel-downs run sloppily.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'game_management', 'clock_end_of_half_offense',
 'End-of-half offense (defending team)',
 'When you''re on offense and need to bleed clock to halftime: run the ball, stay in-bounds, take your time at the LOS (use the play clock). When you''re behind and want to score: tempo without spike if possible. Default to scoring before halftime when you have the ball — momentum from a 2-min TD is worth more than the 30 sec you might risk. The exception: if you''d give the ball back to a high-tempo opponent with 30+ seconds, run the clock out instead.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'game_management', 'clock_end_of_half_defense',
 'End-of-half defense',
 'Inside 2:00 with the ball coming to you: prevent the big play. Soft 2-deep zone, 3-man rush, force them to dink and dunk. Tackle in-bounds — wrap up and HOLD instead of going for a strip (drives them out is worse than letting them get tackled in-bounds). Don''t blitz unless desperate — a busted blitz = 70-yard TD. Force them to march the field.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

-- ============ TIMEOUT MANAGEMENT ============

('global', null, 'game_management', 'timeout_doctrine',
 'Timeout doctrine',
 'You have 3 TOs per half. Treat them like ammunition — a TO used in the 1st quarter to fix confusion is a TO you don''t have at 2:00. Acceptable uses, in order:
1. End-of-half clock save (1st priority)
2. Avoid a delay-of-game when in scoring range or 4th down
3. Make a substitution when defense has a clear matchup advantage
4. Stop a momentum run after 2-3 quick scores
5. Reset confused players on a critical down
NOT acceptable: ''we have extras left, let''s use one.'' Hoard TOs.',
 null, null, 'seed', 'Football Outsiders / Belichick TO doctrine',
 'tier4_hs', false, true),

('global', null, 'game_management', 'timeout_ice_kicker',
 'Icing the kicker: when',
 'Calling a TO right before the snap on a FG attempt is "icing." Research shows it has near-zero effect on long FG (40+) and modest effect on short FG (under 35). Only ice when: (1) FG is in the 35-45 range AND (2) you have 2+ TOs left. Don''t ice with under :30 left if it costs your last TO — you might need it for the ensuing kickoff. Many coaches ice reflexively; don''t.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

-- ============ FOURTH DOWN DECISIONS ============

('global', null, 'game_management', 'fourth_down_general',
 'Fourth down: when to go',
 'Default rules (HS+):
- 4th-and-1, anywhere: GO. (HS conversion rate ~75%.)
- 4th-and-2 to 4 in opponent territory: GO unless inside FG range and trailing.
- 4th-and-5+ inside opp 35: kick FG.
- 4th-and-anything inside your own 30: punt.
- Up by 8-16 in 4th quarter: GO on 4th-and-short to ice the game (don''t give them the ball).
- Trailing in 4th quarter: aggressive — GO on most 4th-and-medium.
At youth, weight ''GO'' even harder — kicking is unreliable, defenses tire late, your offense is more variance-friendly. Punting on 4th-and-2 in youth is often the wrong call.',
 null, null, 'seed', 'NYT 4th-down bot / Romer / advanced analytics',
 'tier4_hs', false, true),

('global', null, 'game_management', 'fourth_down_youth',
 'Fourth down: youth philosophy',
 'For ages 8-13, GO on most 4th downs in opponent territory. Why: (a) most youth punts are short and terrible; (b) defenses get tired; (c) your offense gets reps. Practice 4th-and-short calls weekly so kids are ready. The exception: when your defense is shutting them down and field position is the game (e.g., they keep starting at their own 5), then punt to flip the field.',
 null, null, 'seed', null,
 'tier2_9_11', false, true),

-- ============ SITUATIONAL FOOTBALL ============

('global', null, 'game_management', 'situational_red_zone_offense',
 'Red zone offense: principles',
 'Inside the 20: the defense has less field to defend, so coverage tightens and routes shorten. Best calls:
- Inside the 10: TE/WR fade (single-coverage corner can''t recover), slant-flat combo, naked boot, QB sneak on 4th-and-1.
- Inside the 5: power run, sneak, fade. Avoid drop-back passes (no room).
- 11-20 yard line: still have room — quick game or play-action.
NEVER hold the ball longer than 2 seconds in the red zone — sacks here = 3 lost points instead of 7. Average-or-better red zone teams convert 60-65%; elite are 70%+.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'game_management', 'situational_red_zone_defense',
 'Red zone defense: principles',
 'Tighten coverage, blitz more often, force the offense to throw. Common calls: cover 0 man (with safety blitz), cover 2 man, double-A blitz, fire-zone with the corner blitz. The end zone caps the deepest route — leverage to the inside on every coverage. Force them to settle for FGs. Goal: hold them to 50% TD rate or lower in red zone trips.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'game_management', 'situational_third_down_offense',
 'Third down offense',
 'Run distance-based concepts:
- 3rd-and-short (1-3): power, sneak, slant, quick out.
- 3rd-and-medium (4-6): stick concept, mesh, scat protection with quick game.
- 3rd-and-long (7+): drop-back protection with deep crossers, post-curl, dig concept.
Convert 40% on 3rd down = good HS offense, 45%+ = great. Track conversion by distance bucket weekly. Most 3rd-down failures come from calling a 6-yard route on 3rd-and-7.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'game_management', 'situational_third_down_defense',
 'Third down defense',
 'Match coverage to distance:
- 3rd-and-short: 8-man box, fit the run, expect a hard count or quick pass.
- 3rd-and-medium: blitz a LB, mix coverage, force a quick decision.
- 3rd-and-long: rush 4, drop 7, take away the sticks. Most-common error: blitzing on 3rd-and-12 — gives up explosive plays.
Goal: hold opponents under 35% on 3rd down. Get them off the field; defense rests; offense gets the ball.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'game_management', 'situational_two_point_chart',
 'Two-point conversion chart',
 'Standard analytics-driven 2-pt chart (HS adapt — 2-pt success rate ~50% at HS, ~46% NFL):
GO FOR 2 when down by:
2 (need to tie? kick. need to go up? n/a)
5 (down 5 → up 5 only matters with the right multi-score adjustment, but 2-pt makes lead margin one possession)
10 (down 10 → 8 = one-score game)
12 (down 12 → 10 = 2-score game still, kick is fine)
13 (down 13 → 11 = need TD+FG, same as 13. Kick.)
15 (down 15 → 13)
16 (down 16 → 14, 2-FG-down)
18 (down 18 → 16)
21 → kick
Earlier: kick the XP. Late game: chart it carefully. Print the chart and tape it to your sideline.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

-- ============ SIDELINE BEHAVIOR ============

('global', null, 'game_management', 'sideline_organization',
 'Sideline organization',
 'Three zones on the sideline:
1. ACTIVE — players in the game, coaches calling plays (closest to LOS)
2. ON-DECK — next series players, position coaches teaching off film/Polaroids
3. INFO — head coach, OC/DC with headsets, clock manager, statistician
Rules: no players in the active zone unless going IN. No parents/guests on the sideline. One whistle = come to the bench, one cue = run a play. Disorganized sidelines = late substitutions = 12-men penalties. Practice the sideline weekly in pre-season.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'game_management', 'sideline_communication',
 'Sideline communication',
 'Communication has 3 channels in modern football:
1. HEADSETS — between booth (eye-in-the-sky) and field coaches. Booth has best view of coverage and OL.
2. SIGNALS — coach to players (visual; cards or hand signals).
3. WRISTBANDS — players read play call from a laminated wristband ("32 → power right").
For youth: skip headsets; use a clear vocal play-call relay (coach to QB, QB to huddle). Standardize: ONE coach calls plays. Multiple voices = chaos.',
 null, null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'game_management', 'sideline_emotion',
 'Sideline emotion management',
 'Emotion is contagious. After a TD allowed: head coach''s body language must be calm — "next play, next play." After your TD: celebrate briefly, then refocus immediately on the kickoff. NEVER yell at players for mistakes during the game; teach in the moment without raising voice. Players play for coaches who are steady. Most-watched moment: the first turnover or first big penalty. If you lose composure there, the team will lose for the next 4 series.',
 null, null, 'seed', null,
 null, false, true),

-- ============ HALFTIME ============

('global', null, 'game_management', 'halftime_structure',
 'Halftime structure (HS, 20 min)',
 'Standard 20-min halftime breakdown:
- 0:00-0:05 — Players hydrate, coaches meet privately to compare notes (offense + defense + ST coordinators)
- 0:05-0:10 — Position coaches with their groups: technique fixes from the half
- 0:10-0:15 — Coordinators with their full units: what''s working, what''s changing, 2-3 adjustments max
- 0:15-0:18 — Head coach addresses the team: keep it short, theme + 1-2 strategic notes + emotional message
- 0:18-0:20 — Out for warm-up
Rules: NO long lectures. NO yelling at players (especially when losing). Adjustments must be small — the team can absorb 2-3 changes max in 20 min.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'game_management', 'halftime_adjustments',
 'Halftime adjustments: what to actually change',
 'Top 3 adjustments by frequency:
1. PROTECTION — if QB is getting hit, slide protection or keep RB in to chip.
2. COVERAGE — if a WR is killing you, double him (bracket or cloud) or roll the safety.
3. TEMPO — if you''re behind, go no-huddle to shorten the game.
Bad adjustments: completely new schemes (not enough reps); bench your worst player (kills culture).
Don''t panic. Most teams are within 7 points at halftime; the 4th quarter decides games.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

-- ============ PRE-GAME ============

('global', null, 'game_management', 'pregame_routine',
 'Pre-game routine',
 'Standard 90-min pre-game (kickoff at T):
- T-90: Arrival, taping, mental prep
- T-60: Position-group walkthrough (5-10 plays each, no defense)
- T-45: Specialists (kicker, snapper, holder) on the field for FGs/punts
- T-30: Team takes the field — light dynamic warm-up
- T-20: Position-group fundamentals (5 min) → unit period (offense vs scout D, etc.)
- T-10: Team install reminder (one-script of openers)
- T-5: Captains to midfield, rest of team in tunnel/sideline
- T-0: Kickoff
Last meal 3 hours before kickoff. Hydration starts 24 hours before — not in pre-game.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'game_management', 'pregame_openers',
 'Scripted opening drives',
 'Most successful HS/college teams script their first 12-15 offensive plays. Why: (1) lets you see how the defense is aligning; (2) avoids in-game decision fatigue early; (3) gives QB/RB confidence — they know what''s coming. Build the script as a mix of run/pass/play-action that probes the defense. Adjust based on what you see, but rarely abandon the script in the first 2 series. Bill Walsh popularized this — still standard.',
 null, null, 'seed', 'Bill Walsh / 49ers offensive scripting tradition',
 'tier4_hs', false, true),

-- ============ POST-GAME ============

('global', null, 'game_management', 'postgame_team_address',
 'Post-game team address',
 'Win or lose, address the team within 10 min of the final whistle:
- WIN: brief celebration, name 2-3 specific players who exemplified the team standard, transition to next opponent (don''t let them celebrate too hard — Monday is film day).
- LOSS: NEVER blow up. Acknowledge effort, name 1-2 things that went well, lay out what film-week will fix. Players take their cues from the head coach''s response — model resilience.
End with a team breakdown chant. Then players to parents — not the other way around. Coaches stay last.',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'game_management', 'postgame_film_grade',
 'Post-game film grade',
 'Grade film within 24-36 hours so it''s fresh. Standard grade: each player gets a + (assignment + technique correct), - (assignment correct, technique busted), 0 (assignment busted), and an effort grade (1-5). Goal: 70%+ + grade and 4.0+ effort grade. Show kids their grade in 1-on-1 weekly meetings — concrete numbers > vague feedback. For youth, simplify to thumbs-up/thumbs-down per play; grade the team, not individuals.',
 null, null, 'seed', 'AFCA film grading standards',
 'tier4_hs', false, true),

-- ============ WEATHER + ENVIRONMENT ============

('global', null, 'game_management', 'weather_rain_cold',
 'Weather: rain + cold',
 'Rain: shorten ball-handling — fewer hand-offs, fewer pitches, more inside runs and short passes. Tell QB to grip ball with TOWEL between snaps. Defense plays for the fumble — gang tackle, strip late. WR routes simplified (no double-moves on wet turf).
Cold: warm-up takes 50% longer. Hands get hard — reps catching warm balls (under jacket between plays). Cleats: longer studs for grass, regular for turf. Hand-warmers in muffs for QB. Avoid plays requiring fine motor skill on tier-1/2 youth — fingers don''t work below 40°F.',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'game_management', 'weather_heat',
 'Weather: heat & hydration',
 'Above 85°F: water every 15 min minimum, salt-replenishment drinks (not pure water — hyponatremia risk). Above 95°F or heat index above 105°F: NFHS guidelines mandate breaks every 12 min and shortened practices. Watch for signs of heat illness: cramps, confusion, no sweating, vomiting — pull immediately and ice.
NEVER use water as conditioning withholding/punishment. Heat-stroke deaths are the #1 preventable cause of football deaths.',
 null, null, 'seed', 'NFHS heat acclimatization guidelines',
 null, false, true),

('global', null, 'game_management', 'weather_wind',
 'Weather: wind',
 'Wind 15+ mph affects deep passes and FGs. Coach decisions:
- KICKOFF: kick INTO the wind in the 1st/3rd quarters so wind helps you in 2nd/4th.
- FG: shorter range into the wind — don''t attempt 40-yarders into 20mph wind. Punt and play field position.
- DEEP BALL: throw with the wind, run with it against. Underthrown deep balls into the wind = INTs.
- SCREEN/QUICK GAME: wind doesn''t affect — call more of these into the wind.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

-- ============ OPPONENT SCOUTING ============

('global', null, 'game_management', 'scouting_priorities',
 'Opponent scouting priorities',
 'When breaking down opponent film, prioritize in order:
1. TENDENCIES — what do they run on 1st-and-10 vs 3rd-and-3? What formations? What blitzes by down/distance?
2. PERSONNEL — best 3 players (offense and defense). Plan to neutralize.
3. STRUCTURE — base front, base coverage, where do they put their best CB? Their best DL?
4. SCRIPT — first 5-8 offensive plays they''ve run in past games (often a script).
5. SPECIAL TEAMS — fakes, returns, kicker''s leg.
Goal: a 1-page scouting report that fits on the wristband or play sheet. Anything more = noise.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'game_management', 'scouting_tendencies_chart',
 'Tendency chart format',
 'Standard tendency chart breaks plays by:
- Down (1st, 2nd, 3rd, 4th)
- Distance (short 1-3, medium 4-7, long 8+)
- Field position (own 1-20, 21-50, opp 49-21, opp red zone)
- Personnel (11, 12, 21, 10 — based on RB/TE counts)
For each cell: % run vs pass, top 2 plays. Look for over-90% tendencies — those are exploits. Build your defensive call sheet around forcing them OUT of their tendencies.',
 null, null, 'seed', null,
 'tier4_hs', false, true);
