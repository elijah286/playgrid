-- Coach AI KB — Flag 4v4 common offensive plays.
-- 4v4: 1 QB + 3 eligibles. Tight spacing on a small field — quick game dominates.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── Formations ───────────────────────────────────────────────────
('global', null, 'scheme', 'formation_trips_4v4',
 'Flag 4v4 — Formation: Trips',
 'All three eligibles to one side of the QB. Stresses defense — they must commit numbers to the trips side. Backside is a single QB scramble lane. Best for spread/quick passing.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_2x1_4v4',
 'Flag 4v4 — Formation: 2x1',
 'Two receivers one side, one receiver the other. Most balanced 4v4 alignment. Allows two-route concepts (mesh, smash, levels) to one side and an iso route to the other.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_stack_4v4',
 'Flag 4v4 — Formation: Stack',
 'Two receivers stacked behind one another at the line, third receiver split wide opposite. Stack creates free release — defender can''t cover both. Pairs with rub/pick concepts.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_bunch_4v4',
 'Flag 4v4 — Formation: Bunch',
 'Three receivers tightly grouped to one side. Stresses defensive matching. Works great vs man — natural rubs on every release. Vulnerable to zone defenders sitting in the bunch area.',
 'flag_4v4', null, 'seed', null, true, false),

-- ── Concepts ─────────────────────────────────────────────────────
('global', null, 'scheme', 'play_slants',
 'Flag 4v4 — Play: Slants',
 'All three eligibles run 3-step slants. Quick-game staple — beats press, exploits any underneath defender flat-footed. QB throws the open one.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_mesh',
 'Flag 4v4 — Play: Mesh',
 'Two receivers run shallow crosses meeting at ~4 yards. Third receiver runs corner/clear-out. Crossers create a natural rub vs man and find zone holes.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_smash',
 'Flag 4v4 — Play: Smash',
 'Outside receiver runs a hitch (low), inside receiver runs a corner (high). Third receiver clears or runs a check-down. High-low on the corner — beats Cover 2.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_stick',
 'Flag 4v4 — Play: Stick (trips)',
 '#1 (outside) clears, #2 runs a 5-yard stick (hook), #3 runs a flat. QB reads flat defender — flat = stick, stick = flat. Reliable third-down call.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_curl_flat',
 'Flag 4v4 — Play: Curl-flat',
 'Outside WR runs 8-yard curl, slot/back releases to flat. Beats any defender responsible for both — common move-the-chains call.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_screen',
 'Flag 4v4 — Play: WR screen',
 'Quick screen to a receiver with the other two as blockers (legal screen blocks — no contact). QB delivers a no-look ball after the snap. Counters aggressive rush in leagues that allow rushers.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_double_move',
 'Flag 4v4 — Play: Double move (sluggo)',
 'Receiver fakes a slant for 2 steps then breaks vertical (slant-and-go). Gets a defender to bite. Best on 1st down or after a slant has worked once already.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_four_verts_4v4',
 'Flag 4v4 — Play: All Verts',
 'All three receivers run vertical. Stresses any zone deep — find the open seam. Vulnerable to bracket coverage on the best receiver.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_levels',
 'Flag 4v4 — Play: Levels',
 'Two crossing routes at different depths (5 and 10 yards) with a clear-out. High-low on the underneath defender. Strong middle-of-field concept.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_drag_post',
 'Flag 4v4 — Play: Drag-post',
 'One receiver runs a shallow drag, another runs a deep post over the top. Stretches the defense vertically. Works vs man and zone.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_qb_keeper',
 'Flag 4v4 — Play: QB keeper',
 'In leagues where QB can advance, QB pulls the ball and runs the edge after a fake. Most effective when defense rushes hard.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_handoff',
 'Flag 4v4 — Play: Inside handoff',
 'In leagues with a true RB position, hand off behind the line for an interior run. Many 4v4 leagues prohibit running plays — verify rule set.',
 'flag_4v4', null, 'seed', null, true, false);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — flag 4v4 plays (drafted, beta authoritative)', null
from public.rag_documents d
where d.sport_variant = 'flag_4v4' and d.topic = 'scheme'
  and (d.subtopic like 'play_%' or d.subtopic like 'formation_%')
  and d.source = 'seed' and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
