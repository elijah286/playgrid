-- Coach AI KB — NFL Flag 5v5 common offensive plays.
--
-- 5v5 personnel: QB, center (eligible), and 3 receivers (often labeled
-- W1/W2/W3 or X/Y/Z, sometimes with one as a "running back" who motions or
-- aligns in the backfield). No blocking, no QB runs in standard rules.
-- All chunks authoritative=false / needs_review=true.

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body,
  source, source_note,
  authoritative, needs_review
) values

-- ── Formations ────────────────────────────────────────────────────
('global', null, 'scheme', 'formation_trips_right',
 'NFL Flag 5v5 — Formation: Trips Right',
 'Three receivers stacked to the right of the center; one receiver alone left. QB in shotgun. Stresses the defense to that side and creates rub/spacing options. Best against single-high coverage.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'formation_spread',
 'NFL Flag 5v5 — Formation: Spread (2x2)',
 'Two receivers split each side of the center, QB in shotgun. Balanced look — forces the defense to declare its leverage. Foundation formation for most pass concepts (mesh, levels, smash).',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'formation_empty',
 'NFL Flag 5v5 — Formation: Empty',
 'All four eligible receivers split out (no back in the backfield), QB alone. Pure pass look — defense must drop everyone into coverage. Useful in obvious passing situations or no-run zones.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'formation_bunch',
 'NFL Flag 5v5 — Formation: Bunch',
 'Three receivers tightly clustered to one side (within 2-3 yards of each other). Creates natural rub/pick concerns for man defense. Hard to press from a bunch — defenders have no clean release angle.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'formation_stack',
 'NFL Flag 5v5 — Formation: Stack',
 'Two receivers aligned one directly behind the other on each side (or just one stacked pair). The back receiver gets a free release — makes it nearly impossible for a man defender to jam.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Pass concepts ────────────────────────────────────────────────
('global', null, 'scheme', 'play_slants',
 'NFL Flag 5v5 — Concept: Slants',
 'All receivers run 3-step slants at a 45-degree angle to the inside. QB takes a quick 3-step drop and throws to the most open inside-breaking route. Beats man coverage and zone underneath. Best from Trips or Spread.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'play_mesh',
 'NFL Flag 5v5 — Concept: Mesh',
 'Two receivers run shallow crossing routes (1-3 yards) from opposite sides, "meshing" near the center to create natural picks/rubs. A third receiver runs a corner or post over the top. Universal answer to man coverage.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'play_smash',
 'NFL Flag 5v5 — Concept: Smash',
 'Outside receiver runs a hitch (5 yards, sit down). Inside receiver runs a corner route (10-12 yards, breaks to the sideline). High-low read on the corner: throw the hitch if the corner sits, throw the corner if he jumps the hitch. Beats Cover 2.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'play_stick',
 'NFL Flag 5v5 — Concept: Stick',
 'Inside receiver runs a 5-yard stick route (square-in or sit). Outside receiver runs a fade or out. Back-side receiver runs a flat. Triangle stretch — defender can''t cover all three. Great vs zone.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'play_snag',
 'NFL Flag 5v5 — Concept: Snag',
 'Outside receiver runs a snag (curl-and-settle) at 5 yards. Inside receiver runs a corner. Third receiver runs a flat underneath. Triangle: corner high, snag middle, flat low — defender always wrong. Excellent red-zone concept.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'play_levels',
 'NFL Flag 5v5 — Concept: Levels',
 'Two receivers run in-breaking routes at different depths (e.g. 5-yard dig and 12-yard dig) to the same area. QB reads top-down — throw the deep dig if the underneath defender drops, throw the shallow if he sits.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'play_flood',
 'NFL Flag 5v5 — Concept: Flood',
 'Three receivers attack one side at three depths: deep (corner/streak), intermediate (out at 10-12), shallow (flat at 2-3). Stretches a single zone defender vertically. Pair with rollout for max effect.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'play_four_verts',
 'NFL Flag 5v5 — Concept: 4 Verticals',
 'All four eligible receivers run vertical routes — outside go, slot seams. Forces the defense to cover deep across the field. QB reads safety leverage: throw to the receiver opposite the deep safety''s movement. Gold standard vs Cover 1 / Cover 3.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'play_y_cross',
 'NFL Flag 5v5 — Concept: Y-Cross',
 'Slot receiver runs a deep crossing route from one side to the other, 12-15 yards deep. Outside receivers run clearouts (go routes) to vacate the middle. QB hits the cross when it crosses the defender. Beats man + zone.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'play_curl_flat',
 'NFL Flag 5v5 — Concept: Curl-Flat',
 'Outside receiver runs a 10-yard curl. Inside receiver runs a flat at 3 yards. Two-on-one stretch on the flat defender — if he sinks to the curl, throw the flat; if he widens, throw the curl. Simple and reliable.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'play_drive',
 'NFL Flag 5v5 — Concept: Drive (Shallow Cross + Dig)',
 'One receiver runs a shallow cross at 1-2 yards. A second receiver runs a 10-yard dig behind it. Forces a man defender to chase the shallow while creating space at the dig depth.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'play_wheel',
 'NFL Flag 5v5 — Concept: Wheel',
 'Inside receiver runs to the flat then turns up the sideline — the "wheel". Outside receiver runs a slant or post to clear the flat defender. Great vs man — the wheel runner gets a wide open lane up the sideline.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'play_screen',
 'NFL Flag 5v5 — Concept: Screen / Bubble',
 'Outside receiver takes one step then settles or moves laterally toward the QB. Other receivers release downfield as decoys. QB throws quick — a "free yardage" play vs soft zone or off coverage. Note: no blocking is allowed in front of the receiver; the play depends on space, not blocks.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'play_post_wheel',
 'NFL Flag 5v5 — Concept: Post-Wheel',
 'Outside receiver runs a deep post. Inside receiver runs a wheel underneath. Beats man coverage by forcing the defenders to switch — they almost always blow the switch.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Run / motion-based plays ──────────────────────────────────────
('global', null, 'scheme', 'play_jet_sweep',
 'NFL Flag 5v5 — Play: Jet Sweep',
 'Receiver sprints in pre-snap motion across the formation; QB hands off (or pitches) on the move so the runner has full speed. Attacks the edge before the defense can rotate. Add a fake to the QB on a backside boot for a built-in counter.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'play_handoff_dive',
 'NFL Flag 5v5 — Play: Backfield handoff (dive)',
 'Receiver aligns in the backfield as a "back". QB takes the snap and hands off; the back attacks downhill toward the line of scrimmage. Useful 4th-and-short converter. Cannot be run from inside a no-run zone.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'play_reverse',
 'NFL Flag 5v5 — Play: Reverse',
 'Jet motion to one side; QB hands off. Runner takes 1-2 steps then hands or pitches to a second receiver coming the opposite direction. Counter to over-pursuing defenses but very vulnerable to a fast inside rusher — only run when the defense is selling out on jet sweep.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'scheme', 'play_play_action_boot',
 'NFL Flag 5v5 — Play: Play-action boot',
 'Fake jet sweep or dive, then QB rolls out the opposite direction with two receivers on a flood concept (deep, intermediate, flat). High-percentage vs aggressive defenses that bite on run action.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true);

-- Initial revisions.
insert into public.rag_document_revisions (
  document_id, revision_number,
  title, content, source, source_note,
  authoritative, needs_review,
  change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — common plays (drafted, awaiting admin verification)', null
from public.rag_documents d
where d.sport_variant = 'flag_5v5'
  and d.sanctioning_body = 'nfl_flag'
  and d.source = 'seed'
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
