-- Coach AI KB — Tackle 11-man defensive schemes (shared, sanctioning_body=NULL).
-- Universal across Pop Warner, AYF, NFHS.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── Fronts ───────────────────────────────────────────────────────
('global', null, 'scheme', 'defense_43',
 'Tackle 11 — Defensive front: 4-3',
 'Four down linemen (2 DEs + 2 DTs), three linebackers (Sam, Mike, Will), four DBs. Balanced front — strong vs both run and pass. Most popular base front in modern football.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_34',
 'Tackle 11 — Defensive front: 3-4',
 'Three down linemen (NT + 2 DEs), four linebackers (2 ILBs + 2 OLBs). The OLBs serve as edge rushers or coverage players depending on the call. More versatile vs the pass; relies on big NT to occupy double-teams.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_46',
 'Tackle 11 — Defensive front: 46 (Bear)',
 'Eight in the box: 4 down linemen + 3 LBs + an extra safety walked down. Designed to stop the run by overloading gaps. Made famous by the 1985 Bears. Vulnerable to the pass — light in the secondary.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_53',
 'Tackle 11 — Defensive front: 5-3 (youth)',
 'Five down linemen, three linebackers, three DBs. Common in youth tackle (Pop Warner / AYF). Heavy run-stopping front for an era where younger offenses run more than they pass.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_62',
 'Tackle 11 — Defensive front: 6-2 (youth)',
 'Six down linemen, two linebackers, three DBs. Even more run-stuffing than 5-3. Still common in 8-9 year-old divisions where teams almost never throw.',
 'tackle_11', null, 'seed', null, true, false),

-- ── Coverages ────────────────────────────────────────────────────
('global', null, 'scheme', 'defense_cover_0',
 'Tackle 11 — Coverage: Cover 0 (zero blitz)',
 'Pure man coverage with no deep safety — all 11 are accounted for in the box or in man coverage. Used to bring max pressure (6-7 rushers). Boom-or-bust: huge play if it gets home, huge play allowed if not.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_cover_1',
 'Tackle 11 — Coverage: Cover 1 (man + free safety)',
 'Single deep safety (free), all other DBs and a LB in man coverage. Sometimes a robber LB roams underneath. Strong vs run (8-man front) and vertical concepts. Vulnerable to mesh/rub plays.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_cover_2',
 'Tackle 11 — Coverage: Cover 2',
 'Two deep safeties split the field, five underneath defenders in zone. Strong vs intermediate routes and the deep ball outside the numbers. Vulnerable to four verts (seam splits the safeties) and floods.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_cover_3',
 'Tackle 11 — Coverage: Cover 3',
 'Three deep zones (2 corners + free safety), four underneath. Excellent vs the deep ball and the run (8-man front). Vulnerable to floods and high-low concepts on the curl/flat defender.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_cover_4',
 'Tackle 11 — Coverage: Cover 4 (Quarters)',
 'Four deep quarters with pattern-match rules, three underneath. Modern variant: corners and safeties read route distributions and pass off receivers. Strong vs verticals. Soft underneath against quick game.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_cover_6',
 'Tackle 11 — Coverage: Cover 6 (split-field)',
 'Quarters to one side, Cover 2 to the other. Allows different coverages vs trips and back side. Modern split-field response to spread offenses.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_two_man',
 'Tackle 11 — Coverage: 2-Man (Two Man Under)',
 'Two deep safeties + five underneath defenders in man (trail technique). Defenders trail receivers, safeties top everything. Strong vs intermediate routes; vulnerable to crossing routes and short hitches.',
 'tackle_11', null, 'seed', null, true, false),

-- ── Pressures ────────────────────────────────────────────────────
('global', null, 'scheme', 'defense_zone_blitz',
 'Tackle 11 — Pressure: Zone blitz',
 'Bring 5 rushers (one is a LB or DB), drop a normal rusher (DE) into a short zone. Confuses QB hot reads and creates unexpected coverage looks. Pairs with Cover 3 behind.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_overload_blitz',
 'Tackle 11 — Pressure: Overload blitz',
 'Bring 4-5 rushers all from one side of the formation, leaving the backside lighter. Forces the offense to slide protection one way and creates 1-on-1 matchups on the other.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_corner_blitz',
 'Tackle 11 — Pressure: Corner blitz',
 'Cornerback rushes off the edge while another defender (often a safety) rotates to cover his receiver. Risky — receiver gets free release. Best against immobile QBs in obvious passing situations.',
 'tackle_11', null, 'seed', null, true, false);

-- Initial revisions.
insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — tackle 11 shared defenses (drafted, beta authoritative)', null
from public.rag_documents d
where d.sport_variant = 'tackle_11'
  and d.sanctioning_body is null
  and d.topic = 'scheme'
  and d.subtopic like 'defense_%'
  and d.source = 'seed'
  and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
