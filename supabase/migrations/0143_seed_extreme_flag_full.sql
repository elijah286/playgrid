-- Coach AI KB — Extreme Flag (9v9 hybrid): penalties + plays + defenses + strategy + coaching.
-- Extreme Flag is a hybrid format: more players than 5v5/7v7, larger field, no rushing
-- contact but blocking is permitted (varies by ruleset). Originated in Texas leagues.
-- Verify all rules against the specific Austin/regional league rulebook before relying.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── Penalties ────────────────────────────────────────────────────
('global', null, 'rules', 'penalty_false_start',
 'Extreme Flag — Penalty: False start',
 'Movement by an offensive player after the set. Penalty: 5 yards, replay the down.',
 'extreme_flag', null, 'seed',
 'Verify enforcement spot against current Extreme Flag rulebook.', true, false),

('global', null, 'rules', 'penalty_offside',
 'Extreme Flag — Penalty: Offside',
 'Defender across the LOS at the snap. Penalty: 5 yards, replay. Live ball.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_illegal_contact',
 'Extreme Flag — Penalty: Illegal contact',
 'Defender contacts a receiver beyond the legal jamming zone, or a blocker uses an illegal blocking technique. Penalty: 10 yards. Verify exact legal-block definitions.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_pi',
 'Extreme Flag — Penalty: Pass interference',
 'DPI: spot foul, automatic first down. OPI: 10 yards from previous spot, loss of down.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_flag_guarding',
 'Extreme Flag — Penalty: Flag guarding',
 'Ball carrier shields flags with arm/hand/ball. Penalty: 5-10 yards from spot of foul.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_diving',
 'Extreme Flag — Penalty: Diving / hurdling',
 'Ball carrier dives to gain yards or hurdles a defender. Penalty: dead ball at spot of dive, 5 yards.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_unsportsmanlike',
 'Extreme Flag — Penalty: Unsportsmanlike',
 'Penalty: 10-15 yards. Two on one player = ejection.',
 'extreme_flag', null, 'seed', null, true, false),

-- ── Plays / formations ───────────────────────────────────────────
('global', null, 'scheme', 'formation_spread_xf',
 'Extreme Flag — Formation: Spread',
 'QB in shotgun, RB beside, multiple eligibles split wide. Common base — spreads the larger 9v9 defense thin.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_trips_xf',
 'Extreme Flag — Formation: Trips',
 'Three eligibles bunched to one side. Stresses defensive coverage on a wider field.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_i_xf',
 'Extreme Flag — Formation: I-formation',
 'In leagues that allow it, I-formation with FB and TB enables a more physical run game.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_inside_run_xf',
 'Extreme Flag — Play: Inside run',
 'Hand-off to RB attacking interior gap. Where blocking is allowed, looks much like 11-man inside zone with fewer linemen.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_sweep_xf',
 'Extreme Flag — Play: Sweep',
 'Edge run with a lead blocker (where blocking allowed) or a clear-out receiver. Wide field favors the perimeter.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_smash_xf',
 'Extreme Flag — Play: Smash',
 'Outside hitch + inside corner route. Standard high-low — works in any pass-heavy format.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_post_xf',
 'Extreme Flag — Play: Post',
 'Deep post over a single safety. Most defenses run with one or no deep safeties — vertical routes are high-percentage.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_screen_xf',
 'Extreme Flag — Play: Screen',
 'Quick screen to a WR or RB with blockers in front (where blocking permitted). Counter to aggressive defenses.',
 'extreme_flag', null, 'seed', null, true, false),

-- ── Defenses ────────────────────────────────────────────────────
('global', null, 'scheme', 'defense_box_xf',
 'Extreme Flag — Defense: Box (zone)',
 'Defenders split the field into zones (typically 6 underneath + 2-3 deep depending on roster). Easier to teach.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_man_xf',
 'Extreme Flag — Defense: Man',
 'Each defender takes one eligible. Spare defender as a free safety. Strong vs predictable concepts; vulnerable to mesh/rub.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_cover_2_xf',
 'Extreme Flag — Coverage: Cover 2',
 'Two safeties split deep halves; underneath defenders take zones. Strong vs intermediate routes.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_cover_3_xf',
 'Extreme Flag — Coverage: Cover 3',
 'Three deep zones. Strong vs verticals; soft underneath.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_blitz_xf',
 'Extreme Flag — Pressure: Blitz',
 'Bring an extra rusher (where rushing permitted). Risky vs spread; pick spots.',
 'extreme_flag', null, 'seed', null, true, false),

-- ── Strategy ────────────────────────────────────────────────────
('global', null, 'tactics', 'wide_field_xf',
 'Extreme Flag — Strategy: Use the field width',
 'Larger field than 5v5/7v7. Horizontal stretches (sweeps, jet motion, spread sets) force defenders to cover ground.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'tactics', 'tempo_xf',
 'Extreme Flag — Strategy: Tempo',
 'No-huddle stresses small-roster Extreme Flag teams. Fatigue is a weapon — push pace after a chunk play.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'tactics', 'red_zone_xf',
 'Extreme Flag — Strategy: Red zone',
 'Field shrinks. Best calls: fade to your tallest WR, slant/flat package, quick-game stick.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'tactics', 'matchups_xf',
 'Extreme Flag — Strategy: Matchup hunting',
 'With multiple eligibles, isolate your best WR vs their worst defender. Use motion to identify man vs zone, attack repeatedly.',
 'extreme_flag', null, 'seed', null, true, false),

-- ── Coaching ────────────────────────────────────────────────────
('global', null, 'tactics', 'practice_xf',
 'Extreme Flag — Coaching: Practice structure',
 '75-min template: 10 min warmup + flag pulling, 15 min position work, 20 min concept install, 20 min team, 10 min situational.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'tactics', 'roster_xf',
 'Extreme Flag — Coaching: Roster management',
 'Cross-train every player at offense and defense — small rosters demand it. Know your top 8 for clutch moments.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'tactics', 'install_xf',
 'Extreme Flag — Coaching: Install pacing',
 '8-12 base plays + 3-4 defensive calls is plenty for most rosters. Add one new thing per week. Repetition wins.',
 'extreme_flag', null, 'seed', null, true, false),

('global', null, 'tactics', 'tournament_xf',
 'Extreme Flag — Coaching: Tournament management',
 'Multi-game days exhaust kids. Bring water, snacks, sun protection. Tighten rotation in bracket play. Single-page call sheet.',
 'extreme_flag', null, 'seed', null, true, false);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — Extreme Flag full coverage (drafted, beta authoritative)', null
from public.rag_documents d
where d.sport_variant = 'extreme_flag' and d.source = 'seed' and d.retired_at is null
  and (d.subtopic like 'penalty_%' or d.subtopic like 'play_%' or d.subtopic like 'formation_%'
       or d.subtopic like 'defense_%' or d.subtopic like '%_xf')
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
