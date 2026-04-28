-- Coach AI KB — Universal coaching soft skills, culture, parent management,
-- discipline, playing-time decisions, mental skills.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  age_tier, authoritative, needs_review
) values

-- ============ TEAM CULTURE ============

('global', null, 'culture', 'culture_definition',
 'Culture: what it actually is',
 'Culture is what your team does when no coach is watching. It''s not a slogan or a t-shirt — it''s the consistent behavior of players in unstructured moments: how they treat the equipment manager, whether they pick up trash, how they speak to a substitute teacher, whether they help up an opponent.
Build it three ways: (1) MODEL it (head coach behavior is the ceiling); (2) NAME it (call out specific behaviors weekly — "the way Jaylen helped that freshman find the locker room is what we''re about"); (3) RECRUIT to it (cut for character before talent). Most teams have culture by default; great teams have culture by design.',
 null, null, 'seed', 'Pete Carroll / Urban Meyer culture frameworks',
 null, false, true),

('global', null, 'culture', 'culture_standards_vs_rules',
 'Standards over rules',
 'Rules tell players what NOT to do. Standards tell them WHO they are.
Rule: "Don''t be late." Standard: "We''re a team that respects each other''s time."
The difference matters because rules can be lawyered ("the sign said 4:00 PM, I was here at 4:00 PM"). Standards demand internalization.
Have 3-5 team standards, max. Print them in the locker room. Refer to them in every team meeting. Tie behavior corrections back to them: "that wasn''t the standard." Examples: be on time, finish strong, take care of teammates, no excuses, do the unsexy work.',
 null, null, 'seed', 'Tony Dungy / Mike Krzyzewski standards philosophy',
 null, false, true),

('global', null, 'culture', 'culture_captains',
 'Captains: selecting + using',
 'Pick 3-5 captains by player vote (with veto rights for the head coach). Don''t default to "best player" — pick the player who embodies the standard. Captains'' roles:
- Pre-game: lead warm-up, address the team before kickoff
- In-game: extra communication channel coach → team
- Practice: hold teammates accountable BEFORE coaches do
- Off-field: model behavior, mediate small conflicts
Meet with captains weekly for 15 min — get their pulse on the team. Ask: "what do I need to know that I can''t see?"',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'culture', 'culture_first_meeting',
 'Season-opening team meeting',
 'First team meeting of the year (60 min). Agenda:
1. Why are we here? (5 min) — coach''s vision for the season
2. Standards (10 min) — present the 3-5 team standards, ask for buy-in
3. Captains (5 min) — announce process for selection
4. Schedule + expectations (15 min) — practice times, attendance, academics
5. Q&A (15 min) — players ask anything
6. Group break-out (10 min) — by class/position, players write goals
Skip the rah-rah speech. Players want a plan and a leader, not a sermon.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

-- ============ PLAYING TIME ============

('global', null, 'culture', 'playing_time_youth',
 'Playing time: youth (ages 5-12)',
 'EVERY PLAYER PLAYS in every game. Most leagues mandate it; even when not mandated, do it. Reasons: (1) the kid showed up — that''s the contract; (2) bench-warmers quit football; (3) rep distribution is more important than win-loss in youth.
Track plays-per-player on a clipboard. Aim for ~75% of starters'' rep count for the lowest player. If you have a kid who can''t stay on assignment, run him at a position where mistakes are smaller (second TE, FB, slot WR — not QB or middle LB).',
 null, null, 'seed', 'Pop Warner / AYF / NFHS youth coaching guidelines',
 'tier1_5_8', false, true),

('global', null, 'culture', 'playing_time_hs',
 'Playing time: HS varsity',
 'Varsity is meritocracy — best players play, period. But communicate clearly:
- Each player knows where they stand each week (starter, rotation, depth, scout).
- Use a "earn-your-reps" practice rule: top performer at a position THIS WEEK starts THIS WEEK. Reset weekly.
- Have a 5-min playing-time conversation with every non-starter twice per season — "here''s what would move you up."
JV/freshman teams: more equitable distribution; goal is development, not winning.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'culture', 'playing_time_conversations',
 'Playing-time conversations with players + parents',
 'When a player or parent asks why they''re not playing more:
1. Don''t avoid it — schedule the conversation, don''t do it on the sideline.
2. Have specific examples ready: "in the last game, on these 4 plays, you missed your assignment / dropped the catch / lost contain."
3. Tell them what would change their role: "if you can show me at practice that you can do X, you''re in the rotation."
4. Don''t compare players in the conversation. Talk only about the individual.
5. If the parent escalates: stay calm, repeat the standard, do not negotiate.
Document all conversations briefly (date, topic, what was said) in case escalation continues.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

-- ============ DISCIPLINE ============

('global', null, 'culture', 'discipline_principles',
 'Discipline: principles',
 'Three rules:
1. CONSISTENT — same consequence for same behavior, regardless of player''s talent. The day you let your QB skip conditioning is the day you lose the locker room.
2. PROPORTIONATE — petty offenses get small consequences; serious offenses (cheating, hazing, drugs) get serious consequences. Don''t over-punish small stuff.
3. PRIVATE — discipline a player privately when possible. Public shame breeds resentment. Public correction is OK for behavior the team can learn from.
Most-recommended consequence menu: extra running for tardiness, missed practice = miss next game, behavior issues = community service or apology. AVOID: punishing the team for one player''s mistake (kills culture).',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'culture', 'discipline_running_as_punishment',
 'Running as punishment: when (and when not)',
 'Running is the default football consequence. Use it sparingly:
- OK: tardy, equipment violation, technical errors in practice (5 minutes of up-downs).
- NOT OK: as a way to "break" players, after games we lost, on hot days, or as a stand-in for a hard conversation.
Why: kids who associate running with punishment will half-ass conditioning and get hurt. Conditioning should be aspirational ("we run hard so we win the 4th quarter"), not punitive.',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'culture', 'discipline_hazing',
 'Hazing: zero tolerance',
 'Zero tolerance means zero. Any "tradition" that makes a freshman/younger player do something humiliating, painful, or sexual is hazing — full stop. Communicate the policy in pre-season. If reported: immediate investigation, players involved sit until cleared, repeat offenders cut.
The "harmless rookie skit" is a slippery slope. Most hazing scandals start with something a coach considered harmless 5 years prior. Cut it all.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

-- ============ PARENT MANAGEMENT ============

('global', null, 'culture', 'parents_communication',
 'Parent communication: structure',
 'Set the channel and the rules in pre-season:
1. PARENT MEETING (week 1): introduce coaching staff, explain practice times, lay out the chain of command (player talks to coach FIRST; parent talks to coach 24 hours after the issue, never on the sideline).
2. WEEKLY UPDATES: send a Sunday email — last week recap, upcoming opponent, schedule reminders.
3. INDIVIDUAL ISSUES: schedule a meeting; never address by group text or in the parking lot.
4. THE 24-HOUR RULE: parents may not contact coaches about a game decision until 24 hours after kickoff. Cools tempers.',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'culture', 'parents_topics_off_limits',
 'Parents: topics off-limits',
 'In coach-parent communication, three topics are not on the table:
1. Other players'' performance, playing time, or behavior.
2. Play-calling decisions ("why did you call X on 3rd down?").
3. Personal coaching philosophy ("you should run more spread").
What IS on the table: their own kid''s status, behavior, academics, injuries. Coach should redirect off-limits topics gently but firmly: "I''m happy to talk about Jordan, but I can''t discuss other players or in-game decisions."',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'culture', 'parents_problem_handling',
 'Handling the difficult parent',
 'Most "problem parents" want to be heard, not to win. Steps:
1. Listen fully without interrupting (often resolves itself in 5 minutes).
2. Acknowledge the feeling: "I hear how frustrated you are."
3. Restate the standard: "Here''s how we make playing-time decisions."
4. Offer a concrete next step: "Let''s set up a meeting with [player] and the position coach to talk about what would move him up."
5. End the conversation. Don''t debate.
Document the conversation. If repeated escalation: loop in AD/program director.',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'culture', 'parents_youth_specific',
 'Parents: youth-specific',
 'Youth parents are MORE involved than HS parents. Lean in:
- Have 1-2 parent volunteers per practice (water, equipment, sideline help).
- Send DAILY communication (text or app) — "great practice, focus tomorrow on [X]".
- Praise specific kids by name in group messages — parents share with their kid.
- Hold a midseason parent meeting (15 min) to address questions.
- Have a clear policy on coach-from-the-stands behavior: "I love the support, please save the tactical advice for the car ride home."',
 null, null, 'seed', null,
 'tier1_5_8', false, true),

-- ============ MENTAL SKILLS ============

('global', null, 'culture', 'mental_visualization',
 'Mental skills: visualization',
 'Visualization (also called mental rehearsal) measurably improves performance. Build into team routine:
- Pre-game (15 min before warm-up): players sit, eyes closed, walk through their first 3 plays.
- Pre-practice (5 min before stretch): players visualize the day''s install.
- For QBs / DBs: nightly visualization homework — 10 min of mentally repping reads/coverages.
Doesn''t replace physical reps, but it''s free and additive. Top HS programs (IMG, Mater Dei, etc.) all use it. Sell it as "what every D1 program does."',
 null, null, 'seed', 'AFCA mental performance / Brian Cain mental conditioning',
 'tier4_hs', false, true),

('global', null, 'culture', 'mental_breath_control',
 'Mental skills: breath control',
 'Box breathing (4-count in, 4-count hold, 4-count out, 4-count hold) drops heart rate and re-focuses an over-stimulated player. Use it:
- In the huddle before a critical play.
- On the sideline after a turnover or big mistake.
- Pre-game while taping.
Coach the QB to do it before every snap. Special teams players (kicker, holder) should rep it daily. Most of "calm under pressure" is trainable breath habits, not personality.',
 null, null, 'seed', 'Brian Cain mental conditioning curriculum',
 'tier3_12_14', false, true),

('global', null, 'culture', 'mental_next_play',
 'Mental skills: next-play discipline',
 'Best mental skill in football: forgetting the last play. Cue: when something bad happens (drop, fumble, INT, missed tackle), do a physical reset — e.g., wipe the ball off your hands, slap your helmet — then say internally "next play." This breaks the rumination loop.
Coach culture matters here. If the head coach yells about the last play, players ruminate. If the head coach''s first words are "next play, where''s the spot?", players reset. Model it.',
 null, null, 'seed', null,
 null, false, true),

-- ============ PRACTICE BEHAVIOR ============

('global', null, 'culture', 'practice_attendance',
 'Practice attendance policy',
 'Standard policy:
- Excused absence (illness, school commitment, family emergency): notify head coach in writing 24 hours ahead when possible. No game-day penalty.
- Unexcused absence: 1st = warning + extra conditioning; 2nd = miss next game''s 1st quarter; 3rd = sit a full game; 4th = dismissal from team.
- Tardy: extra conditioning at end of practice.
Communicate this in writing in pre-season. Apply to ALL players including stars. The day you suspend your starting QB for being late is the day your culture solidifies.',
 null, null, 'seed', null,
 null, false, true),

('global', null, 'culture', 'practice_tempo_culture',
 'Practice tempo culture',
 'How you practice is how you play. Two non-negotiables:
1. RUN to the huddle, RUN to the LOS, RUN off the field on substitutions.
2. FINISH every play through the whistle — RBs sprint 5 yards past where they''d be tackled, defenders pursue to the sideline.
A practice with bad tempo = a Friday with bad tempo. If you see walking, blow the whistle, restart the play. After 1-2 weeks of strict enforcement, it becomes automatic.',
 null, null, 'seed', 'Saban / Belichick practice tempo culture',
 null, false, true),

('global', null, 'culture', 'practice_no_blame',
 'No-blame practice culture',
 'When something goes wrong in practice, the coach''s first reaction sets the tone for the season. NEVER point at one player as the cause. Instead:
- "Reset, run it again."
- "What did we miss? Show me."
- Ask the unit to self-diagnose: "QB, what did you see? OL, what did you see?"
This builds adult thinkers, not players who hide mistakes. Public blame trains kids to lie about errors instead of fixing them.',
 null, null, 'seed', null,
 null, false, true),

-- ============ DEVELOPING COACHES ============

('global', null, 'culture', 'staff_assistant_coaches',
 'Developing assistant coaches',
 'Treat your staff like players — they need development too:
- Weekly staff meeting (60 min): film review, install for the week, scouting, logistics.
- Each assistant owns ONE thing: a position group, a special-teams phase, a portion of the install.
- Give assistants the floor in meetings — let them present an install or a scouting report.
- Annual review: tell them where they stand in their career arc, what they need to work on.
Most HS programs have rotating assistants — building an HC pipeline by developing them is how you keep good ones.',
 null, null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'culture', 'staff_volunteer_coaches',
 'Volunteer coaches: youth context',
 'Most youth coaches are volunteer parents. Their experience varies wildly. Approach:
- Pre-season: 2-hour staff meeting going over the entire season (install, schedule, sideline rules, parent communication).
- ASSIGN specific roles: "you own RBs and ball security." Better than "help out."
- Provide 1-2 page cheat sheets (drills, plays, coaching points).
- If a volunteer is doing more harm than good (yelling at kids, teaching bad technique), have a private conversation. Don''t avoid.
- Recognize volunteers publicly — postseason awards, end-of-year handwritten thank-you.',
 null, null, 'seed', null,
 'tier1_5_8', false, true),

-- ============ INJURY + SAFETY ============

('global', null, 'culture', 'safety_concussion_protocol',
 'Concussion protocol',
 'Most states have NFHS-aligned concussion laws. Standard protocol:
1. Suspected concussion = REMOVE FROM PLAY, even if player insists they''re fine.
2. No return to practice until cleared in writing by a medical professional.
3. Return-to-play follows a 5-stage progression: rest → light aerobic → sport-specific → non-contact drills → full contact → return.
4. Never let a kid talk you into a same-game return.
The single highest-risk decision a coach makes in a game is whether to put a possibly-concussed kid back in. Default: out.',
 null, null, 'seed', 'NFHS / state concussion laws / CDC HEADS UP',
 null, true, false),

('global', null, 'culture', 'safety_heat_illness',
 'Heat illness protocol',
 'Heat illness sits on a spectrum: cramps → heat exhaustion → heat stroke (fatal).
Cramps: stretch + electrolytes + cool environment + REST.
Exhaustion: pull from practice, ice towels at neck/groin/armpits, water, EMS if not improving in 15 min.
Stroke: 911 IMMEDIATELY. Cold-water immersion (ice tub if available — keep one at HS practice). Every minute counts.
Acclimatization: NFHS heat-acclim rules: helmets-only days 1-2, shells days 3-5, full pads day 6+. Practices in heat-index 95+ require breaks every 12 min and water-on-demand.',
 null, null, 'seed', 'NFHS heat acclimatization / Korey Stringer Institute',
 null, true, false),

('global', null, 'culture', 'safety_emergency_action_plan',
 'Emergency Action Plan (EAP)',
 'Every practice and game site needs an EAP — written, posted, rehearsed. Required elements:
1. EMS access route (gate codes, who unlocks, staging area).
2. Lead emergency-coordinator role (AT or designated coach).
3. AED location.
4. Phone tree: athletic trainer → EMS → AD → parent.
5. Spine-board protocol — who calls it, who removes face mask.
Rehearse the EAP in pre-season with the entire staff and athletic training. The 30 seconds you save knowing where the AED is can save a life.',
 null, null, 'seed', 'NATA Inter-Association Task Force EAP guidelines',
 null, true, false);
