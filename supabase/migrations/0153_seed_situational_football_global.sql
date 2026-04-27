-- Coach AI KB — Universal situational football (sport_variant=NULL).
-- Red zone, 2-min, 4-min, 3rd down, 4th down decisions, 2-pt chart, clock mgmt, hash strategy.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ============ RED ZONE ============

('global', null, 'situation', 'rz_principles',
 'Red zone: principles',
 'Red zone = inside opponent''s 20 (or "scoring zone" inside the 30 for some staffs). Field shrinks vertically — no deep balls, defenders compress. TD% is the only stat that matters. Plan: own 3-4 calls per area (high red 20-11, low red 10-1, goal line). Tendency: defenses go to man + pressure in red zone — beat man with rubs, picks (where legal), and option routes.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'rz_high_red',
 'Red zone: high red (20-11)',
 'Still room for vertical concepts. Best calls: smash (corner + hitch), fade-out, slant-flat (rub), 4 verts seam, dagger, post-corner. Run game: zone with PA, jet sweep, QB power. Avoid checkdowns under the sticks — high red INT inside the 20 = lost 3 points.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'rz_low_red',
 'Red zone: low red (10-3)',
 'No room for posts/digs. Best calls: fade, back-shoulder fade, slant, slant-flat, smash with low-corner, mesh, snag (corner-flat-snag triangle). Run: power, counter, QB sneak, jet, sprint-out boot. Use motion to ID man (safety follows = man → call rubs).',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'rz_goal_line',
 'Red zone: goal line (3 and in)',
 'Score-or-bust window. Best plays: QB sneak (highest success rate at any level), power, counter, dive. Pass: fade, slant, pick play, sprint-out boot, bootleg-throwback to TE. Goal-line defense usually 6-1 or 6-2 stack — get a hat on a hat and let your back fall forward.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'rz_call_sheet',
 'Red zone: call sheet construction',
 'Build 3 buckets: 1st down, 2nd-and-medium, 3rd-and-short, plus a "must-have-it" call. Each bucket needs a run AND a pass option. Print on call sheet by yard line (20-11, 10-4, 3-in). Rep all of them weekly. If you can''t recall the call by Saturday without looking, the kids can''t run it.',
 null, null, 'seed', null, true, false),

-- ============ 2-MIN OFFENSE ============

('global', null, 'situation', 'two_min_principles',
 'Two-minute offense: principles',
 'Goal: maximize plays + clock efficiency. Use no-huddle. Throw to the sideline (stops clock on OB) or get OB after a catch. Avoid runs unless very short yardage. Use spike strategically — only when the alternative is a worse call. Always know how many timeouts you have AND the opponent''s remaining timeouts.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'two_min_route_concepts',
 'Two-minute: best route concepts',
 'Sideline routes: out, comeback, sail, fade-out, hitch (vs off coverage). Field-stretch on 1st down: dagger, post-wheel, deep cross. Avoid shallow crossers and slants in the middle — clock keeps running. Quick game on the boundary, shot plays vs single-high looks.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'two_min_clock_math',
 'Two-minute: clock math',
 'Inbounds incomplete = clock stops only on incomplete pass (resumes on snap of next play in some leagues; HS varies). OB catch = clock stops until next snap. Sack inbounds = clock runs. Spike = uses a down but stops clock instantly. Rough rule: 5 sec/play in no-huddle field-stretch, 8-10 sec/play with reset. With 1:30 + 1 TO from your 25, ~6-8 plays available.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'two_min_spike_decision',
 'Two-minute: when to spike',
 'Spike is a wasted down — only use when (a) >10 sec on play clock and you need to set up the next play, OR (b) clearly inside FG range and burning clock isn''t the alternative. NEVER spike on 4th down. NEVER spike if you have a timeout left and a real play ready. Many youth teams over-spike — train QB on the rule.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'two_min_hurry_up_install',
 'Two-minute: install',
 'Pre-script 6-8 plays the whole team knows by name without a huddle. Use a sideline signal or wristband. Practice 3x per week — one rep at the end of every team period. The installed package is more valuable than freelance audibles in the moment.',
 null, null, 'seed', null, true, false),

-- ============ 4-MIN OFFENSE ============

('global', null, 'situation', 'four_min_principles',
 'Four-minute (kill) offense: principles',
 'Up by a score or two with ~4 min left. Goal: bleed clock and get 1st downs to end the game. Run on 1st and 2nd down, even short pass on 3rd. Stay inbounds. Take a knee or burn full play clock between snaps. Get to 4th down with the clock under :40 and opponent out of timeouts before punting.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'four_min_play_calls',
 'Four-minute: best calls',
 'Inside zone, power, dive, QB sneak on 3rd-and-short. Avoid plays that risk going OB or losing yards (sweeps, fumble-prone misdirection, deep drop passes). On 3rd-and-medium, throw a high-percentage in-breaker that won''t go OB. Take the sack over an OB throw.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'four_min_kneel_math',
 'Four-minute: kneel-down math',
 'In most rules, you can run ~40 sec off the play clock between snaps. With opponent at 0 TO, 3 kneels = ~120 sec burned + 3 plays (can be more with 4th down before punt). Math: if clock < (opponent_TOs × 40 sec) + 120 sec when you take possession, you can kneel out. Otherwise need at least one 1st down.',
 null, null, 'seed', null, true, false),

-- ============ 3RD DOWN ============

('global', null, 'situation', 'third_short',
 '3rd down: short (1-3 yards)',
 'Run play conversion rate ~65-70% across HS/college on 3rd-and-short. Best calls: QB sneak (highest %), inside zone, power, dive, FB iso. PA pass off the same look — defenses sell out vs run. Short pass: slant, fade, snag, quick out. Worst call: deep drop pass — sack risk + loss of FG range.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'third_medium',
 '3rd down: medium (4-7 yards)',
 'Mixed run/pass call, slight pass lean. Best concepts: stick (snag), hitch + seam, drive, smash, mesh-bender, slant-flat. Run game: counter, jet, draw vs known pass rush. Read the box — 7+ in box → throw, 6 or less → counter/draw works. Convert ~50% league average.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'third_long',
 '3rd down: long (8-15 yards)',
 'Pass-heavy down. Best concepts: dagger, deep crosser, levels, sail, all curls (vs zone), choice (vs man). Use empty or trips to spread. Draw and screen as change-up to slow rush. Read pre-snap leverage and get the ball to space. Convert ~30-35% league average — a 50% conversion rate is elite.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'third_extra_long',
 '3rd down: extra long (16+ yards)',
 'Rarely converts (~15% league average). Don''t force a hero ball. Best plan: draw or screen to set up makeable 4th, OR a 12-15 yd in-breaker that gets enough to punt with field position. Avoid sacks at all costs — a sack on 3rd-and-20 is worse than a 5-yard checkdown.',
 null, null, 'seed', null, true, false),

-- ============ 4TH DOWN DECISIONS ============

('global', null, 'situation', 'fourth_down_chart_basics',
 '4th down: when to go for it (general chart)',
 'Modern analytics-informed defaults (HS/college; pros are more aggressive): GO on 4th-and-1 from anywhere past your own 30. GO on 4th-and-2-3 past midfield. GO on 4th-and-anything past opponent 40 if FG is unlikely. PUNT inside your own 30 unless 4th-and-1. KICK FG inside opponent 25 if your kicker is reliable; otherwise GO.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'fourth_down_youth',
 '4th down: youth/HS context',
 'Youth conversion rates are higher than HS/college because punting is often weaker. GO defaults skew aggressive: own 40+, almost always GO on 4th-and-3 or less. Many youth leagues outlaw punts entirely — turnover-on-downs is the norm. Build playbook for 4th-and-short conversions every week.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'fourth_down_situational',
 '4th down: situational overrides',
 'Trailing late: GO becomes mandatory once math says you need both possession AND points. Up by 2 scores: PUNT/FG to play field position. Wind/weather: shorten the FG range, longer punt territory. Opponent TOs: more TOs left = lean toward going (they get the ball back regardless). Build a simple decision tree the HC owns BEFORE the situation arrives.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'fourth_down_call_selection',
 '4th down: play selection',
 'Best 4th-and-1: QB sneak (75%+ at all levels). 4th-and-2-3: power, counter, slant-flat, mesh, RPO. 4th-and-medium (4-7): your most-repped pass concept that beats both man and zone — NOT a trick play. 4th-and-long: draw or screen to set up FG, OR your highest-confidence shot if down a score. Trick plays only if scouted from opponent vulnerability.',
 null, null, 'seed', null, true, false),

-- ============ 2-POINT CONVERSION ============

('global', null, 'situation', 'two_pt_chart',
 'Two-point conversion chart',
 'Modern chart (when trailing): down 1 → kick (tie). Down 2 → GO 2 (tie game). Down 4 → kick (down 3 = FG ties). Down 5 → GO 2 (down 3). Down 8 → kick (down 7, then 8 next score = GO 2). Down 9 → GO 2 (down 7 = TD ties). Down 10 → kick. Down 11 → GO 2 (down 9 = TD+2 ties). Down 12 → GO 2. Down 15 → GO 2. Print and laminate.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'two_pt_play_call',
 'Two-point conversion: play calls',
 'Top calls (HS/college): power (highest success), QB sneak, sprint-out boot, fade, slant, rub/pick (where legal), arrow-flat triangle, RPO glance. Don''t over-design — your best inside zone or your QB''s best fade is better than a never-repped trick play. Have 3 in the call sheet, called by situation.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'two_pt_when_first_score',
 'Two-point chart: when leading early',
 'Old school: kick every PAT and figure it out late. Modern: if up 12, GO for 2 to push to 14 (two-score lead). If up 19, GO for 2 to push to 21 (three-score). Otherwise default to kick when leading early. Never give up a sure 1 for a coin-flip 2 unless math demands it.',
 null, null, 'seed', null, true, false),

-- ============ FIELD POSITION ============

('global', null, 'situation', 'field_pos_backed_up',
 'Field position: backed up (own 1-10)',
 'Goal: get out without disaster. Calls: inside zone, dive, power, short PA, quick game (slant, hitch). NEVER call deep drop in own 5 — sack = safety. NEVER call sprint-out toward your own end zone. If 4th-and-long, take the safety over a snap from your own 1 (live to fight; 2 pts < 7 pts).',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'field_pos_backed_up_4th',
 'Field position: backed up 4th down',
 'Inside own 5 on 4th: take the intentional safety (12-yard punt from end zone is risky and yields ~15 yds; safety is 2 pts but you get a free kick from the 20). Inside own 10-30: punt unless 4th-and-1. The free kick after safety is often worth more than a punt from the 1.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'field_pos_plus_territory',
 'Field position: plus territory (opp 49 to 30)',
 'Sometimes called "4-down territory." Conversion math says GO on most 4th-and-3 or less here. Don''t leave drives on the table by punting from the +40. Calls: keep aggressive — chunk plays still in play. FG range starts opening at +30 depending on leg.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'field_pos_fringe_fg',
 'Field position: FG fringe',
 'The yard line where FG is 50/50 for your kicker is your "decision line." Past it = 4-down territory (any 4th-and-medium → GO). Inside it = play for FG (don''t take losses, don''t throw into the end zone with no time-clock pressure). Know your kicker''s real range, not the optimistic one.',
 null, null, 'seed', null, true, false),

-- ============ HASH MARK STRATEGY ============

('global', null, 'situation', 'hash_field_boundary',
 'Hash strategy: field vs boundary',
 'On a hash, "field" = wide side, "boundary" = short side. Field side has more grass for routes; boundary side compresses defenders. Default: run to boundary (defense can''t flow as wide), throw to field (more grass). Trips into boundary forces defense to declare. Trips to field stretches horizontally.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'hash_pass_concept',
 'Hash strategy: pass concept selection',
 'Boundary throws: fade, hitch, slant, quick out (less ground for DB to cover means tighter windows but quicker timing). Field throws: smash, dig, deep crosser, sail (grass for the route to develop). On bottom hash, an "out" to the bottom is shorter and quicker; an "out" to the field is harder. Build call sheet with hash in mind.',
 null, null, 'seed', null, true, false),

-- ============ CLOCK / GAME-FLOW ============

('global', null, 'situation', 'clock_three_speeds',
 'Clock management: three speeds',
 'Coaches should call practice with three explicit tempos: NORMAL (huddle, ~25 sec/play), FAST (no-huddle, ~15 sec/play), FREEZE (kill the clock, ~38-40 sec/play). Players know each by call ("regular," "go," "kill"). Practice transitions weekly.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'clock_end_of_half',
 'End of 1st half: clock decisions',
 'Receiving 2nd-half kickoff? Be more aggressive at end of 1st half — you can swap a punt for a possession. Kicking off in 2nd half? Be more conservative — opponent will get the ball back. Time + score + possession = the equation. Common error: punting with 1:30 + 2 TOs left when math favors going.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'clock_timeout_usage',
 'Timeout usage discipline',
 'Save TOs for end of half/game. Never burn one to "calm the team" — bench job. Only burn early to (a) avoid a burned down to substitute, (b) avoid a delay penalty in plus territory, (c) ice a kicker (debated value). Two TOs at end of game is worth more than 4 TOs of "calmness."',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'clock_runoff_situations',
 'Clock: runoff and 10-second runoff rule',
 'In some HS rules and college: certain penalties inside the last minute trigger a 10-second runoff (offense can take it or pay TO). Coaches should know the rule pre-game. Common trigger: offensive penalty when clock would have stopped. Runoffs can end games — don''t commit silly penalties in 2-min.',
 null, null, 'seed', null, true, false),

-- ============ SITUATIONAL PRACTICE ============

('global', null, 'situation', 'sit_practice_rep',
 'Situational practice: rep every situation weekly',
 'Sunday script: 4-min offense, 2-min offense, red zone (high+low), goal line, backed-up, 3rd-and-(short/med/long), 4th-and-1, 2-pt conversion, hands-team, victory formation. Each gets 3-5 reps per week. The team that wins close games is the team that''s repped close-game situations.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'sit_practice_signals',
 'Situational practice: include signals & substitutions',
 'Don''t just rep the play — rep the WHOLE situation. Substitution package on, no-huddle signal in, defensive call from the OC, communication with sideline. Live game has 11 things going at once; practice has to mirror that to transfer.',
 null, null, 'seed', null, true, false),

('global', null, 'situation', 'sit_decision_card',
 'Situational decision card (HC)',
 'HC carries a laminated card with: 4th-down go/no-go by yard line, 2-pt chart, FG range, end-of-half rules, end-of-game scenarios. Removes "what should I do?" panic. Print before each game; review pregame. Most blown game-end decisions come from no card and trying to do math under stress.',
 null, null, 'seed', null, true, false);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — situational football', null
from public.rag_documents d
where d.sport_variant is null and d.topic = 'situation'
  and d.source = 'seed' and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
