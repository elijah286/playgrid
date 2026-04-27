-- Coach AI KB — 8-man tackle football: penalties + plays + defenses + strategy + coaching.
-- 8-man uses an 80×40 field (some leagues 100×40), 10 yards for first down, all eligible
-- but typically 5 linemen + 3 backs/eligibles. Common in small high schools (CO, NE, KS,
-- MT, WY, SD, ND, OK, ID, NM).

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── Penalties ────────────────────────────────────────────────────
('global', null, 'rules', 'penalty_false_start',
 '8-man — Penalty: False start',
 'Movement by an offensive player after the set. Penalty: 5 yards, replay the down.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_offside',
 '8-man — Penalty: Offside',
 'Defender across the LOS at snap. Penalty: 5 yards. Live ball.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_holding',
 '8-man — Penalty: Holding',
 'Restraining an opponent illegally. Penalty: 10 yards, replay the down.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_pi',
 '8-man — Penalty: Pass interference',
 'DPI: 15 yards, automatic first down. OPI: 15 yards, loss of down.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_facemask',
 '8-man — Penalty: Face mask',
 'Grasping the face mask. Penalty: 15 yards, automatic first down vs defense.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_personal_foul',
 '8-man — Penalty: Personal foul / late hit',
 'Penalty: 15 yards, automatic first down.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_targeting',
 '8-man — Penalty: Targeting',
 'Forcible contact to the head/neck or leading with the helmet. Penalty: 15 yards. Some state rules add ejection.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_unsportsmanlike',
 '8-man — Penalty: Unsportsmanlike',
 'Penalty: 15 yards. Two on one player = ejection.',
 'eight_man', null, 'seed', null, true, false),

-- ── Plays / formations ───────────────────────────────────────────
('global', null, 'scheme', 'formation_spread_8m',
 '8-man — Formation: Spread',
 'QB in shotgun, RB beside him, three eligibles split wide. Common modern base.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_i_8m',
 '8-man — Formation: I-formation',
 'QB under center, FB and TB stacked. Power running base — works with the 5-lineman 8-man front.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_trips_8m',
 '8-man — Formation: Trips',
 'Three eligibles to one side. Stresses defensive coverage.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_inside_zone_8m',
 '8-man — Play: Inside zone',
 'Linemen step playside, RB reads the front-side gap. Foundation run. Same scheme as 11-man, simpler with one fewer defender to read.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_sweep_8m',
 '8-man — Play: Sweep',
 'Pitch to a back attacking the edge with TE/H-back leading. Wide-field sweeps often big plays in 8-man due to fewer pursuit defenders.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_qb_run_8m',
 '8-man — Play: QB run / option',
 'Read the unblocked edge defender. QB pulls if defender crashes. Spread option works well in 8-man — fewer defenders to outflank.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_post_8m',
 '8-man — Play: Post',
 'Deep post over a single safety. With one fewer DB than 11-man, vertical routes consistently win.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_smash_8m',
 '8-man — Play: Smash',
 'Outside hitch + corner route. Beats Cover 2. Simple and effective.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_screen_8m',
 '8-man — Play: WR/RB screen',
 'Counters aggressive defenses. Simple to install, high-yield against blitz.',
 'eight_man', null, 'seed', null, true, false),

-- ── Defenses ────────────────────────────────────────────────────
('global', null, 'scheme', 'defense_43_8m',
 '8-man — Defense: 4-3 front (4 DL, 3 LB, 1 DB)',
 'Heavy front. Stops the run. Pass-defense is light — vulnerable to spread passing teams.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_34_8m',
 '8-man — Defense: 3-4 front (3 DL, 4 LB, 1 DB)',
 'Even more LB-heavy. Used in run-dominant leagues.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_33_2_8m',
 '8-man — Defense: 3-3-2',
 'Three down linemen, three LBs, two DBs. Most common modern 8-man front. Balanced.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_man_8m',
 '8-man — Coverage: Man',
 'DBs in man, LBs match TE/RB. Pressure-heavy. Risky vs spread.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_cover_2_8m',
 '8-man — Coverage: Cover 2',
 'Two safeties split the deep field. Underneath defenders take zones. Strong vs intermediate routes.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_cover_3_8m',
 '8-man — Coverage: Cover 3',
 'Three deep zones (with one DB rolling into a deep third). Strong vs verticals; soft underneath.',
 'eight_man', null, 'seed', null, true, false),

-- ── Strategy ────────────────────────────────────────────────────
('global', null, 'tactics', 'first_down_8m',
 '8-man — Strategy: 1st down play-calling',
 '10-yard first down. Run-heavy on early downs. Mix in shot plays — defenses are structurally light in coverage.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'tactics', 'red_zone_8m',
 '8-man — Strategy: Red zone',
 'Field shrinks. Power runs and slant/flat dominate. Fade routes succeed at higher rates in 8-man because fewer help defenders.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'tactics', 'mercy_rule_8m',
 '8-man — Strategy: Mercy rule',
 'Most 8-man rule sets (state-dependent) end or running-clock at 45-point lead. Manage tempo accordingly when scores diverge.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'tactics', 'tempo_8m',
 '8-man — Strategy: Tempo',
 'No-huddle stresses small-roster defenses. With limited subs, fatigue compounds quickly.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'tactics', 'special_teams_8m',
 '8-man — Strategy: Special teams',
 'Standard PAT rules (1 by kick, 2 by run/pass) vs 6-man inversion. Field position matters — some leagues kickoff from the 30 instead of 35.',
 'eight_man', null, 'seed', null, true, false),

-- ── Coaching ────────────────────────────────────────────────────
('global', null, 'tactics', 'practice_8m',
 '8-man — Coaching: Practice structure',
 '2-hour template: 15 min warmup + tackling, 25 min position work, 25 min group install, 35 min team, 20 min special teams.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'tactics', 'roster_8m',
 '8-man — Coaching: Roster management',
 'Programs often have 14-22 players. Cross-train at multiple positions. Manage workload to keep starters fresh in the 4th quarter.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'tactics', 'tackling_8m',
 '8-man — Coaching: Tackling',
 'With more open space than 11-man (same field, fewer players), open-field tackling is critical. Drill rugby-style form tackling daily.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'tactics', 'install_8m',
 '8-man — Coaching: Install pacing',
 '10-15 base offensive plays + 4-6 defensive calls is plenty. Add only 1-2 things per week. Repetition wins, especially with smaller rosters.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'tactics', 'transition_8m',
 '8-man — Coaching: 8-man to 11-man transition',
 'Some kids will move on to 11-man programs. Teach sound 11-man-style fundamentals (zone blocking, gap discipline, pass progressions) so the transition is smooth.',
 'eight_man', null, 'seed', null, true, false);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — 8-man full coverage (drafted, beta authoritative)', null
from public.rag_documents d
where d.sport_variant = 'eight_man' and d.source = 'seed' and d.retired_at is null
  and (d.subtopic like 'penalty_%' or d.subtopic like 'play_%' or d.subtopic like 'formation_%'
       or d.subtopic like 'defense_%' or d.subtopic like '%_8m')
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
