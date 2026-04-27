-- Coach AI KB — Flag 4v4 defensive schemes.
-- 4 defenders, no rush in most rule sets.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

('global', null, 'scheme', 'defense_man',
 'Flag 4v4 — Coverage: Man',
 'Each of three defenders takes one receiver. Fourth defender serves as a free safety / robber. Strong vs predictable concepts. Vulnerable to mesh/rub.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_cover_2',
 'Flag 4v4 — Coverage: Cover 2 (2 deep)',
 'Two defenders take deep halves, two play underneath. Strong vs deep balls and corners. Vulnerable to seam routes splitting the safeties.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_cover_3',
 'Flag 4v4 — Coverage: Cover 3 (3 deep)',
 'Three defenders cover deep thirds, one plays underneath as a robber/spy. Strong vs verticals; soft underneath.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_box',
 'Flag 4v4 — Coverage: Box (zone)',
 'Defenders divide the field into four zones (two short, two deep). Simple to teach younger players. Vulnerable to flooding one zone.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_press',
 'Flag 4v4 — Technique: Press alignment',
 'Defenders line up directly across receivers (no contact at LOS). Disrupts route timing. Vulnerable to stack/bunch.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_off',
 'Flag 4v4 — Technique: Off coverage',
 'Defenders play 3-5 yards off. Easier to defend deep, react to short. Concedes hitches. Common base for younger defenses.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_bracket',
 'Flag 4v4 — Technique: Bracket on top WR',
 'Two defenders double-team the best receiver — one underneath, one over the top. Forces QB to work the other two — high-leverage call vs an elite WR.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_robber',
 'Flag 4v4 — Technique: Robber',
 'Free defender drops into the middle to "rob" intermediate routes (digs, drags). Reads QB''s eyes. Punishes mesh and crossers.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_combo',
 'Flag 4v4 — Technique: Combo (man + zone)',
 'Two defenders play man on the trips side, two play zone backside. Effective vs unbalanced sets. Saves your worst defender from being isolated.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_qb_spy',
 'Flag 4v4 — Technique: QB spy',
 'In leagues where QB can scramble, dedicate one defender to mirror the QB. Sacrifices coverage but contains a mobile QB.',
 'flag_4v4', null, 'seed', null, true, false);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — flag 4v4 defenses (drafted, beta authoritative)', null
from public.rag_documents d
where d.sport_variant = 'flag_4v4' and d.topic = 'scheme' and d.subtopic like 'defense_%'
  and d.source = 'seed' and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
