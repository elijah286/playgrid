-- Coach AI KB — Flag 7v7 common offensive plays.
--
-- 7v7 has 7 offensive players, no run game, no pass rush. Designed for
-- pass-game development. Formations carry over from 11-man HS football
-- minus the offensive line.

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body,
  source, source_note,
  authoritative, needs_review
) values

-- Formations
('global', null, 'scheme', 'formation_trips',
 'Flag 7v7 — Formation: Trips Right (3x1)',
 'Three receivers stacked to the right, one alone left, one back in the backfield (or empty). QB shotgun. Stresses single-high coverage and creates rub potential. Foundational 7v7 formation.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'formation_doubles',
 'Flag 7v7 — Formation: Doubles (2x2)',
 'Two receivers each side, one back, QB shotgun. Balanced look — defense must declare leverage. Best for spacing concepts (mesh, levels, smash).',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'formation_empty',
 'Flag 7v7 — Formation: Empty (3x2 or 4x1)',
 'No back in the backfield — six receivers split across the formation. Pure pass look; defense must drop everyone. Ideal in obvious passing situations or to force a coverage tell.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'formation_bunch',
 'Flag 7v7 — Formation: Bunch',
 'Three receivers tightly clustered to one side. Creates natural rubs vs man, and overload vs zone. Hard to press a bunch — defenders have no clean release angle.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'formation_stack',
 'Flag 7v7 — Formation: Stack',
 'Two receivers aligned one directly behind the other (one or both sides). The back receiver gets a free release — devastating vs press man.',
 'flag_7v7', null, 'seed', null, false, true),

-- Pass concepts (mostly transferable from 5v5 with more bodies)
('global', null, 'scheme', 'play_mesh_7v7',
 'Flag 7v7 — Concept: Mesh',
 'Two receivers run shallow crossing routes (1-3 yards) from opposite sides. A third receiver runs a deep over (15+ yards). Optional fourth on a corner. Universal man-coverage beater — the crossing routes pick natural rubs.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'play_smash_7v7',
 'Flag 7v7 — Concept: Smash',
 'Outside receiver hitch at 5; slot corner route at 10-12. Hi-lo on the corner defender. Beats Cover 2. Run from doubles or trips.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'play_4v_7v7',
 'Flag 7v7 — Concept: 4 Verticals',
 'Outside receivers run go routes; slot receivers run seams. Forces all four deep zones to commit. QB reads the post safety — throw to the receiver opposite his rotation. Gold-standard vs Cover 1 or Cover 3.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'play_stick_7v7',
 'Flag 7v7 — Concept: Stick',
 'Inside receiver runs a 5-yard stick (sit). Outside receiver runs a fade. Backside runs a flat at 2-3 yards. Triangle stretch — beats most zones.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'play_snag_7v7',
 'Flag 7v7 — Concept: Snag',
 'Outside snag at 5 yards (curl-and-settle), inside corner at 10, third receiver flat at 2. Triangle stretch — defender always wrong. Excellent red-zone call.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'play_levels_7v7',
 'Flag 7v7 — Concept: Levels',
 'Two receivers run dig routes at different depths (5 and 12) to the same area. Top-down read on the underneath defender.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'play_flood_7v7',
 'Flag 7v7 — Concept: Flood / Sail',
 'Three receivers attack one side at three depths: deep streak, intermediate sail/out at 10-12, shallow flat at 2-3. Stretches a single zone defender. Pair with QB rollout.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'play_y_cross_7v7',
 'Flag 7v7 — Concept: Y-Cross',
 'Slot crosses 12-15 yards deep from one side to the other; outside receivers clear the middle with go routes. Backside receiver runs a dig as the secondary read. Beats both man and zone.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'play_curl_flat_7v7',
 'Flag 7v7 — Concept: Curl-Flat',
 'Outside curl at 10, inside flat at 3. Two-on-one stretch on the flat defender. Reliable vs zone.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'play_drive_7v7',
 'Flag 7v7 — Concept: Drive (shallow + dig)',
 'Shallow cross at 1-2, dig at 10 behind it. Defender can''t cover both depths. Excellent answer to drop-7 zone.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'play_post_wheel_7v7',
 'Flag 7v7 — Concept: Post-Wheel',
 'Outside post; inside wheel underneath. Beats man — defenders almost always blow the switch on the natural pick.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'play_bench_7v7',
 'Flag 7v7 — Concept: Bench (out + dig)',
 'Outside receiver runs a 10-yard out (bench route); slot runs a dig over the middle. High-low stretch on the curl-to-flat zone defender.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'play_double_post',
 'Flag 7v7 — Concept: Double Post',
 'Two posts split a single deep safety. The safety must commit to one — the other is open. Use vs Cover 1 / Cover 3 with motion to confirm single-high.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'play_shallow_cross_7v7',
 'Flag 7v7 — Concept: Shallow cross',
 'A single receiver runs a shallow cross underneath (1-3 yards). Other receivers clear with go routes or 10+ yard digs. Easy completion vs man — the man defender chases through traffic.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'play_double_move',
 'Flag 7v7 — Concept: Double-move (slant-and-go)',
 'Receiver fakes a slant for 2-3 steps then breaks deep. Defender bites on the inside cut and is trailing. Best as a one-shot call once the defender has been burned by an actual slant.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'play_screen_swing',
 'Flag 7v7 — Concept: Swing screen',
 'A receiver in the backfield swings to the flat as the QB throws immediately. Other receivers run vertical clearouts. Free yardage vs soft coverage. No blocking — depends on space, not blocks.',
 'flag_7v7', null, 'seed', null, false, true);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — 7v7 plays (drafted, awaiting admin verification)', null
from public.rag_documents d
where d.sport_variant = 'flag_7v7'
  and d.source = 'seed'
  and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
