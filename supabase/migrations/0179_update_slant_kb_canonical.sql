-- Coach AI KB — correct the canonical slant definition.
--
-- Previous content (from 0144) stated "3-step quick break inside at a
-- 45-degree angle". Per coaching-staff direction, the canonical slant
-- in this app is a 3-yard vertical stem followed by a ~25-degree lean
-- inside over the middle (25° measured from vertical — receiver stays
-- mostly forward with a steady inside angle, not a flat 45° cut).
-- This wording must match Coach Cal's behavior + the route template
-- in src/domain/play/routeTemplates.ts.

update public.rag_documents
set
  content = '3-yard vertical stem then a 25-degree lean inside over the middle (25° measured from vertical — the receiver stays mostly downfield with a steady inside angle, NOT a flat 45° cut). Route tree #2. Catches the ball at 5-7 yards. Beats press man (receiver wins inside leverage) and Cover 2 (slant fits between underneath defenders). Most common quick-game call in football.',
  needs_review = false
where scope = 'global'
  and topic = 'scheme'
  and subtopic = 'route_slant';
