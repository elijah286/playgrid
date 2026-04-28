-- Coach AI KB — fix slant angle convention.
--
-- 0179 used "25° from vertical" wording, which produced a near-vertical
-- route. The canonical definition for this app is "25° above horizontal"
-- — measured from the LOS / sideline-to-sideline axis, so the route is
-- mostly lateral with a shallow upfield component. This matches the
-- updated route template in src/domain/play/routeTemplates.ts.

update public.rag_documents
set
  content = '3-yard vertical stem then a 25-degree-above-horizontal cut across the middle (angle measured from horizontal / LOS — the route is mostly lateral with a shallow upfield component, NOT a steep vertical-leaning break). Route tree #2. Catches the ball at 5-6 yards depth, having gained 5-7 yards laterally. Beats press man (receiver wins inside leverage fast) and Cover 2 (slant fits between underneath defenders). Most common quick-game call in football.',
  needs_review = false
where scope = 'global'
  and topic = 'scheme'
  and subtopic = 'route_slant';
