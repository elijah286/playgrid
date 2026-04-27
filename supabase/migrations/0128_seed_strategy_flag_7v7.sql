-- Coach AI KB — Flag 7v7 strategy & tactics.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

('global', null, 'tactics', 'down_first',
 'Flag 7v7 — Strategy: 1st down',
 'Take a shot. With no run game, every down is a pass — the defense knows it. 1st down is the cheapest down to throw deep. Hit a vertical or post-wheel; even an incomplete leaves 2nd-and-medium.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'down_second',
 'Flag 7v7 — Strategy: 2nd down',
 '2nd-and-medium is when defenses tighten. Mix high-percentage spacing concepts (snag, stick) with shot plays. 2nd-and-long: aggressive — the defense expects you to take the easy underneath, so check the deep look first.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'down_third',
 'Flag 7v7 — Strategy: 3rd down',
 '3rd-and-short: stick or quick out. 3rd-and-medium: mesh, Y-cross, levels. 3rd-and-long: 4 verts, double post, deep dig. Always have a route that crosses the sticks — never throw a 3-yard hitch on 3rd-and-7.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'down_fourth',
 'Flag 7v7 — Strategy: 4th down',
 'No punts — every 4th is a go. Field position matters: a stop deep in your own territory hands a short field to the opponent. Trust your best concept against the coverage tendency you''ve identified.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'red_zone_offense',
 'Flag 7v7 — Strategy: Red zone offense',
 'Field shrinks vertically — verticals don''t work. Best concepts: snag (triangle stretch), bunch slants, fade to a height mismatch, pick concepts (mesh, Y-cross). Settle for 1-point conversion if the TD throw isn''t there.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'red_zone_defense',
 'Flag 7v7 — Strategy: Red zone defense',
 'Drop everyone into man-under or zone-under. Take away crossers and corners. Bracket their best receiver. Force the QB into the back line of the end zone — make him throw a low-percentage ball.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'two_minute',
 'Flag 7v7 — Strategy: Two-minute offense',
 'Use the sidelines (out routes, comebacks). No-huddle to prevent defensive substitutions. Spike to stop the clock if you have one timeout left. Save at least one timeout for end-of-half goal-line decisions.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'vs_press_man',
 'Flag 7v7 — Strategy: Beating press man',
 'Stacks and bunches give you free releases — defender can''t get hands on the back receiver. Slants and quick outs win timing. Double moves punish a defender who jumps the first cut.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'vs_zone',
 'Flag 7v7 — Strategy: Beating zone',
 'Find seams between defenders. Spacing concepts (snag, stick, smash) put two receivers in one zone defender''s area. Underneath crossers (mesh, drag) make zone defenders chase. Hold the QB''s eyes one direction to move the safety.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'vs_quarters',
 'Flag 7v7 — Strategy: Beating Quarters',
 'Quarters jumps the slot vertical. Counter with shallow crosses underneath the bail-out, dig at 12 (the depth where quarter defenders sit), or vertical/wheel concepts that make the safety choose.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'vs_cover_3',
 'Flag 7v7 — Strategy: Beating Cover 3',
 'Cover 3 has only four underneath defenders — flood concepts overload one zone with three receivers at three depths. The middle linebacker is the seam defender; pull him out of the middle with motion and hit the slot seam.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'beating_count',
 'Flag 7v7 — Strategy: Beating the QB count',
 '4 seconds is short. Quick-game concepts (slant, hitch, snag, stick, mesh) get the ball out before the count. Save deep shots for 1st-and-long when an incompletion isn''t fatal. Train the QB to know the count cadence (out loud or silent).',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'tournament_management',
 'Flag 7v7 — Strategy: Tournament management',
 'Pool play: protect point differential — both ways. Don''t run up the score (you''ll cap out and waste energy); don''t get blown out (you''ll lose tiebreakers). Save your best schemes for bracket play. Manage roster fatigue with rotations across pool games.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'first_drive',
 'Flag 7v7 — Strategy: Scripted opening series',
 'Script the first 4-6 plays to (a) probe coverage with a route concept that forces a man-vs-zone tell, (b) feature your best matchups early. Save trick plays for later — the surprise value matters most when the game tightens.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'halftime_adjustments',
 'Flag 7v7 — Strategy: Halftime adjustments',
 'Pick ONE adjustment per side. Offense: identify the coverage hurting you and have an answer ready. Defense: identify the offense''s favorite concept and assign a defender to take it away. Don''t install new schemes mid-game.',
 'flag_7v7', null, 'seed', null, false, true);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — 7v7 strategy (drafted, awaiting admin verification)', null
from public.rag_documents d
where d.sport_variant = 'flag_7v7' and d.source = 'seed' and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
