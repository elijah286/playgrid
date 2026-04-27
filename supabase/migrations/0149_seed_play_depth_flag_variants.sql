-- Coach AI KB — Per-variant play depth for flag formats (5v5, 7v7, 4v4).
-- Adds advanced/format-specific concepts on top of the existing per-variant seeds.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── NFL Flag 5v5 — advanced concepts ─────────────────────────────
('global', null, 'scheme', 'play_5v5_choice',
 'NFL Flag 5v5 — Concept: Choice (option route)',
 'Slot WR runs an option route — sit at 5 yards vs zone, break in/out vs man based on defender leverage. QB and slot read the coverage together. High-completion vs any look. Best with a smart slot WR.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_5v5_dagger',
 'NFL Flag 5v5 — Concept: Dagger',
 'Inside slot runs a vertical seam (clears the deep middle); outside WR runs a deep dig at 12-15 yards into the void. Stresses single-high coverage. Modern shot play adapted from 11-man.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_5v5_drag_and_dig',
 'NFL Flag 5v5 — Concept: Drag-and-dig',
 'Slot runs a shallow drag; outside WR runs a 10-yard dig over the top. Two crossers attacking the middle. Beats man and zone. Reliable 3rd-and-medium call.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_5v5_bunch_mesh',
 'NFL Flag 5v5 — Concept: Bunch mesh',
 'Bunch formation with two of the three bunch receivers running the mesh, third releasing to flat. Bunch alignment forces defensive switches mid-route — natural rubs everywhere. Devastating vs man.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_5v5_smash_china',
 'NFL Flag 5v5 — Concept: Smash-China',
 'Outside hitch, inside corner, third receiver runs a deep over (china) from the backside. Triple-stretch attacking Cover 2 vertically and horizontally. Use on early downs or in red zone.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_5v5_hank',
 'NFL Flag 5v5 — Concept: Hank (curl-flat-corner)',
 'Outside WR curl, slot flat, third receiver corner over the top. Triangle stretch on one side. Reads the flat defender then the corner.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_5v5_pick_red_zone',
 'NFL Flag 5v5 — Concept: Pick (red zone — only legal if no contact)',
 'Note: pick plays are illegal if they cause contact with the defender. Legal version: receivers run crossing routes that force defenders to navigate around each other (no actual pick). Effective inside the 5 vs man.',
 'flag_5v5', 'nfl_flag', 'seed',
 'Verify pick rules vs current NFL Flag rule book — penalty if contact occurs.',
 true, false),

('global', null, 'scheme', 'play_5v5_qb_run_threat',
 'NFL Flag 5v5 — Concept: QB scramble drill',
 'Once the QB pulls down to scramble (where rules allow), receivers convert routes: vertical routes break to comebacks, in-routes break to mirror the QB. Drill it weekly — broken plays are 5v5 staples.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_5v5_motion_concept',
 'NFL Flag 5v5 — Concept: Motion-into-empty',
 'Motion the RB out of the backfield to create a 4-wide empty look. Forces the defense to declare and reveals coverage instantly. Pair with a quick game concept (slants/stick) that hits before pressure.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

-- ── NFL Flag 5v5 — strategy ─────────────────────────────────────
('global', null, 'tactics', 'strat_5v5_first_down',
 'NFL Flag 5v5 — Strategy: 1st down',
 '1st-and-10 in 5v5 is the best play-call opportunity. Defense is often soft. Take a shot at 12-15 yards (smash, dig, post) on early downs. If incomplete, you''re still in 2nd-and-10 with options.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'tactics', 'strat_5v5_no_run_zone',
 'NFL Flag 5v5 — Strategy: No-run zones',
 'Inside the 5-yard line and inside the 5 from a 1st-down-line: no running plays allowed (NFL Flag specific). Must throw. Best calls: slant, fade, quick out, pick (no-contact). Practice these reps weekly.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'tactics', 'strat_5v5_qb_count',
 'NFL Flag 5v5 — Strategy: Beat the rush count',
 'Defender count to ~3.5-4 seconds before rushing (where applicable). QB must release before the rush gets home. Drill quick reads — if 1st read isn''t open by 2 sec, dump to flat or check-down.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

-- ── Flag 7v7 — advanced concepts ─────────────────────────────────
('global', null, 'scheme', 'play_7v7_y_sail',
 'Flag 7v7 — Concept: Y-Sail',
 'Outside WR runs a deep go (clears the corner), Y/inside slot runs a 12-yard sail (out-cut), RB or third receiver releases to the flat. Three routes at three depths to one side — beats Cover 3 by overloading the curl-flat defender.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_7v7_levels',
 'Flag 7v7 — Concept: Levels',
 'Two crossing dig routes at 6 and 12 yards on the same side, with a clear-out vertical. High-low on the LB. Beats zone and man. Reliable 3rd-and-medium call.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_7v7_drive',
 'Flag 7v7 — Concept: Drive',
 'Inside receiver runs a shallow drag at 3-5 yards; outside receiver runs a 12-yard dig over the top. Two crossers attacking the middle. Foundational concept — works against virtually any coverage.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_7v7_dagger',
 'Flag 7v7 — Concept: Dagger',
 'Inside slot runs a clear seam; outside WR runs a deep dig at 15 yards into the void behind the LB. Stresses Cover 1 / Cover 3. Modern NFL shot play adapted to 7v7.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_7v7_post_wheel',
 'Flag 7v7 — Concept: Post-wheel',
 'Outside WR runs a deep post (clears the safety inside); slot/RB runs a wheel up the sideline. The post creates the void where the wheel finishes. Devastating vs man on a LB.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_7v7_double_post',
 'Flag 7v7 — Concept: Double post',
 'Two post routes from adjacent receivers — high (deeper, ~18 yards) and low (~12 yards). Stresses the safety vertically. Pick which one based on safety commitment.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_7v7_choice_concept',
 'Flag 7v7 — Concept: Choice (option route)',
 'Slot/Y receiver runs an option route — sit vs zone, break in/out vs man based on defender leverage. Read happens at the cut. High completion rate with a smart slot.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_7v7_all_curls',
 'Flag 7v7 — Concept: All Curls',
 'Every receiver runs a 10-12 yard curl. Find the open one in zone holes. Reliable vs zone; vulnerable to man if no built-in hot.',
 'flag_7v7', null, 'seed', null, true, false),

-- ── Flag 7v7 — strategy ─────────────────────────────────────────
('global', null, 'tactics', 'strat_7v7_count',
 'Flag 7v7 — Strategy: Beat the 4-second count',
 'Most 7v7 rule sets enforce a 4-second QB count. Build progressions that resolve in <3 seconds. Quick game (slants, mesh, stick) and 1-read concepts beat the count. Anything 5-step + is risky.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'tactics', 'strat_7v7_no_run',
 'Flag 7v7 — Strategy: Pass-only adaptation',
 '7v7 is pass-only. Leverage everything around the throw: shifting alignments, motions, formation strength. Use the defense''s inability to commit a run-stopper against them.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'tactics', 'strat_7v7_red_zone',
 'Flag 7v7 — Strategy: Red zone — fade & rub',
 'Inside the 10, the field shrinks to the point that fades to a tall WR + rub concepts (mesh in goal-line spacing) become the highest-percentage calls. Avoid deep verticals — no field to throw into.',
 'flag_7v7', null, 'seed', null, true, false),

-- ── Flag 4v4 — advanced concepts ─────────────────────────────────
('global', null, 'scheme', 'play_4v4_double_slant',
 'Flag 4v4 — Concept: Double slant',
 'Two adjacent receivers run slants. Inside slant + outside slant create a natural rub vs man. Quick-game staple — easy completion vs any coverage.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_4v4_dragon',
 'Flag 4v4 — Concept: Dragon (slant-flat)',
 'Outside WR runs a slant (5 yards in), inside receiver runs a flat. High-low on the flat defender. Reliable 1st/2nd down call.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_4v4_y_stick',
 'Flag 4v4 — Concept: Y-stick (3-receiver)',
 'Outside clear, slot stick, inside flat. Read flat defender. Ultra-reliable concept in tight 4v4 spacing.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_4v4_rub_concept',
 'Flag 4v4 — Concept: Rub (legal pick alternative)',
 'Two receivers run crossing routes that force defenders to navigate around each other (no contact = legal). Effective vs man, especially in red zone. Verify your league''s contact rules.',
 'flag_4v4', null, 'seed', null, true, false),

-- ── Flag 4v4 — strategy ─────────────────────────────────────────
('global', null, 'tactics', 'strat_4v4_tight_space',
 'Flag 4v4 — Strategy: Embracing tight spacing',
 'Only 3 eligibles + 4 defenders on a small field = no place to hide a bad route. Every receiver must be sharp. Use stacks and bunches to manufacture space — it''s the only way to free a receiver vs tight coverage.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'tactics', 'strat_4v4_isolation',
 'Flag 4v4 — Strategy: Isolate your best',
 'With only 3 eligibles, you can isolate your best WR every snap. Identify defense''s worst defender, align your best opposite, attack until adjusted.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'tactics', 'strat_4v4_pace',
 'Flag 4v4 — Strategy: Pace',
 'Small rosters mean defenders fatigue fast. No-huddle in the 2nd half, especially if you''re winning skill matchups, swings games. Practice no-huddle weekly — it''s a free advantage in 4v4.',
 'flag_4v4', null, 'seed', null, true, false);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — flag-variant play depth', null
from public.rag_documents d
where d.sport_variant in ('flag_5v5','flag_7v7','flag_4v4')
  and d.source = 'seed' and d.retired_at is null
  and (d.subtopic like 'play_5v5_%' or d.subtopic like 'play_7v7_%'
       or d.subtopic like 'play_4v4_%' or d.subtopic like 'strat_5v5_%'
       or d.subtopic like 'strat_7v7_%' or d.subtopic like 'strat_4v4_%')
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
