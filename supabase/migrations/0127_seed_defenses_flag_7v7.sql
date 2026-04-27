-- Coach AI KB — Flag 7v7 defensive schemes.
-- 7 defenders, no pass rush, all coverage. Adapts 11-man secondary
-- concepts for a 7-on-7 passing game.

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body,
  source, source_note,
  authoritative, needs_review
) values

('global', null, 'scheme', 'defense_cover_1',
 'Flag 7v7 — Coverage: Cover 1 (man + free safety)',
 'Six defenders in man on receivers, one as a deep free safety reading the QB. Most aggressive coverage in 7v7 — wins one-on-one matchups with deep insurance. Vulnerable to mesh, rub concepts, and stack releases.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'defense_cover_2',
 'Flag 7v7 — Coverage: Cover 2 (two deep, five under)',
 'Two safeties split the deep field; five underneath defenders take flats and middle hooks. Strong vs Smash and Curl-Flat. Vulnerable to four verts and any seam-stretching concept that splits the safeties.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'defense_cover_3',
 'Flag 7v7 — Coverage: Cover 3 (three deep, four under)',
 'Three deep zones (corners + free safety), four underneath. Excellent vs four verts (every deep route is covered). Vulnerable to flood and sail concepts that overload one underneath defender.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'defense_cover_4',
 'Flag 7v7 — Coverage: Cover 4 / Quarters',
 'Four defenders bail to deep quarters, three underneath. Pattern-match style — quarter defenders read the slot routes and combine with underneath players. Strong vs verticals and 4 verts. Soft underneath.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'defense_cover_6',
 'Flag 7v7 — Coverage: Cover 6 (split-field)',
 'Quarters to one side, Cover 2 to the other. Lets you Quarter the trips side and Cover-2 the back side. Useful vs unbalanced 3x1 sets.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'defense_press_man',
 'Flag 7v7 — Technique: Press man',
 'Defender lined up directly across with no cushion (alignment-only press — no contact at the line). Disrupts route timing. Vulnerable to stacks/bunch (free release) and double-moves.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'defense_off_man',
 'Flag 7v7 — Technique: Off man',
 'Defender plays 5-7 yards off. Easier to defend deep routes and react to short routes. Concedes hitches and slants — common base technique for younger players.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'defense_match_man',
 'Flag 7v7 — Technique: Match (pattern-match) coverage',
 'Defenders start in zone but convert to man on specific route distributions. E.g., if both slot receivers run vertical, the safety carries the inside, the corner stays on the outside. Best of both worlds — zone integrity vs man matchups. Requires practice and communication.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'defense_robber',
 'Flag 7v7 — Technique: Robber',
 'Free safety drops underneath a deep route to "rob" intermediate digs and crossers. Reads the QB''s eyes from depth, then jumps the throw. Punishes Y-Cross and dig concepts.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'defense_bracket',
 'Flag 7v7 — Technique: Bracket coverage',
 'Two defenders double-team one elite receiver — one underneath, one over the top. Forces the QB to throw to other targets. Use against a clear #1 in big games.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'defense_combo',
 'Flag 7v7 — Technique: Combo (man + zone hybrid)',
 'Defenders one side play man; defenders the other play zone. Effective vs unbalanced sets like Trips. Lets you bracket the strong-side concept.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'scheme', 'defense_two_man_under',
 'Flag 7v7 — Coverage: Two Man Under (2-Man)',
 'Two deep safeties + five underneath defenders in man (trail technique). Strong vs intermediate routes — defenders trail the receiver and the safeties top everything. Vulnerable to crossing routes and shallow drags.',
 'flag_7v7', null, 'seed', null, false, true);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — 7v7 defensive schemes (drafted, awaiting admin verification)', null
from public.rag_documents d
where d.sport_variant = 'flag_7v7'
  and d.source = 'seed'
  and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
