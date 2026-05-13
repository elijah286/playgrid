-- Coach AI KB — Flag 6v6 practice template + drill inheritance pointer.
--
-- 6v6 sits between 5v5 and 7v7 mechanically — same flag-pull / route /
-- QB-clock fundamentals as 5v5, same field width and most coverage shells
-- as 7v7. Rather than duplicate ~20 functionally-identical drill chunks,
-- this seed:
--   1. Adds the variant-distinctive content (one practice template).
--   2. Adds an "inherits from" pointer Cal's RAG can retrieve, telling it
--      to pull flag_5v5 + flag_7v7 drills when the playbook is 6v6.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  age_tier, authoritative, needs_review
) values

('global', null, 'practice_template', 'sample_6v6_competitive_75min',
 'Sample 6v6 competitive practice (75 min, tier-2/3)',
 'Goal: 6-on-6 flag league (adult rec or competitive youth), install + situational.

| Time | Activity | Focus |
|------|----------|-------|
| 0:00-0:10 | Dynamic warm-up + flag-pull form | Movement prep |
| 0:10-0:25 | Position splits — QB+WR (routes), C+B (release timing, swing/screen), DEF (zone drops + edge rush) | Parallel fundamentals |
| 0:25-0:40 | 6-on-air install (run 8-10 plays from script — emphasize the eligible C in every concept) | Timing without defense |
| 0:40-0:60 | 6v6 live (3 series each side, 7-second clock or designated rusher per league rule) | Scrimmage |
| 0:60-0:70 | Red zone period (5 plays from the 10 — every skill player AND C gets a route, no dead bodies) | Situational |
| 0:70-0:75 | Team talk + scout for next opponent | Culture |

Key 6v6 emphases: (1) the center is eligible — every pass design must include a route for C; (2) the field is 30 yds wide so outside leverage matters more than 5v5; (3) the extra defender vs 5v5 makes the deep middle harder to attack — pair vertical concepts with horizontal stretches.',
 'flag_6v6', null, 'seed', null,
 'tier3_12_14', false, true),

('global', null, 'conventions', 'flag_6v6_overview',
 'Flag 6v6 — variant overview + drill inheritance',
 'Roster: 6 per side. Offense: QB + Center (eligible receiver) + 4 skill players. Defense: 6 defenders, typically 4 underneath + 2 deep (Cover 2 / 3) or 4 underneath + 2 deep with one as a rusher (Cover 1 with edge blitz).

Field: 60 yds long, 30 yds wide, 10-yd endzones (USFTL standard). Many adult rec leagues match these dimensions.

Rules to confirm with the league:
- Rushing: most 6v6 leagues use a 7-second QB clock OR allow a designated rusher from 7+ yds off the LOS. The playbook''s rules form controls which is in effect.
- Center eligibility: C is generally eligible in 6v6 (same as 5v5). Verify with league rule book.
- 1st downs: crossing midfield = automatic 1st (most common). Some leagues use fixed-distance downs every 20 yds — coach can override in the playbook.
- Handoffs: legal. Designed QB runs (QB draw, sneak) — most leagues require a handoff before any run, same as 5v5; opt in via the playbook''s advancedCapabilities if your league differs.

Drill inheritance: 6v6 shares fundamentals with both 5v5 (flag-pull form, QB clock, center release) and 7v7 (route concepts vs zone shells, multi-receiver progressions). Coach Cal can pull drills tagged sport_variant=flag_5v5 OR sport_variant=flag_7v7 for 6v6 practice plans — those drills work without modification.

Concept inventory: every catalog concept that works for 5v5 or 7v7 composes legally for 6v6 (Curl-Flat, Smash, Stick, Snag, Four Verticals, Mesh, Flood, Drive, Levels, Y-Cross, Dagger). The skeleton generator fits each to a 6-player roster (typically 1 back + 3 receivers + C + QB).',
 'flag_6v6', null, 'seed', null,
 null, true, false);
