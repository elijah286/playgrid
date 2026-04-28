-- Coach AI KB — Drills for Extreme Flag (placeholder).
-- Extreme Flag is largely an Austin, TX league with custom rules. Until
-- admin loads authoritative content from the league rulebook, these are
-- generic flag drills marked needs_review.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  age_tier, authoritative, needs_review
) values

('global', null, 'drill', 'extreme_flag_placeholder',
 'Extreme Flag drills: placeholder',
 'Extreme Flag is a regional league variant (primarily Austin, TX area) with custom rules differing from NFL FLAG and standard 7v7. Until the official Extreme Flag rulebook is loaded into the KB, refer coaches to: (a) the variant-agnostic flag drill seed (flag-pulling, route running, QB pass clock); (b) NFL Flag 5v5 drills as the closest analog if Extreme Flag is 5-on-5; (c) 7v7 drills if Extreme Flag is 7-on-7.
This entry should be replaced when admin loads authoritative content.',
 'extreme_flag', null, 'seed', 'PLACEHOLDER — awaiting admin upload of Austin Extreme Flag rulebook',
 null, false, true),

('global', null, 'drill', 'extreme_flag_route_tree',
 'Extreme Flag route tree (generic flag baseline)',
 'Until Extreme Flag-specific concepts are loaded, use the standard flag route tree: hitch (5), slant (3-step in), out (5), curl (8), comeback (12-to-8), in/dig (12), corner (12-to-corner), post (12-to-post hash), go (vertical). Drill cones at each depth. 8 reps per route.',
 'extreme_flag', null, 'seed', 'PLACEHOLDER — generic flag route tree',
 null, false, true),

('global', null, 'drill', 'extreme_flag_flag_pull',
 'Extreme Flag flag-pull form',
 'Same form-tackling-but-flag-pull mechanics as NFL Flag: square hips, knees bent, eyes on hips not flag, pull DOWN and AWAY. Until rulebook clarifies any contact differences, default to no-contact flag pulling.',
 'extreme_flag', null, 'seed', 'PLACEHOLDER',
 null, false, true);
