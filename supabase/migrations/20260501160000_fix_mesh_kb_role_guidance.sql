-- Fix concept_mesh KB chunk: add explicit role guidance so Cal stops
-- authoring "Mesh" as 2 drags + 3 vertical clear-outs.
--
-- Production failure 2026-05-01: coach asked for a Mesh in their
-- tackle_11 playbook. Cal generated X drag + Z drag + H/S/B verticals.
-- Three verticals stretch the secondary thin and defeat the purpose
-- of Mesh — the drags need a SINGLE complementary route over the top
-- (sit/dig/single clear) to find the soft spot.
--
-- Old KB chunk said only "Outside receivers run vertical clear-outs
-- or sit routes" — Cal interpreted "vertical clear-outs" literally
-- and stacked 3 of them.

update public.rag_documents
set content = 'Mesh is anchored by TWO shallow drag routes (1-3 yds depth) brushing past each other underneath in the middle of the formation — that crossing is what creates the natural pick action vs man and the soft-spot read vs zone. Standard role assignments:
  • Both drags are run by INSIDE players — slot WRs, H-back, or Y/TE — NOT by both outside X/Z.
  • The outside X/Z receivers run COMPLEMENTARY routes over the top: a SIT or DIG at 8-12 yds (the high option), or in some variations one X/Z runs a single deep clear (Go/Post) to vacate the secondary.
  • The back releases to the flat as the QB''s outlet.
What Mesh is NOT: a play with 3+ vertical routes. Multiple verticals stretch the secondary thin and defeat the purpose — Mesh works because the underneath drags find the soft spot a SINGLE vertical opens up. If you find yourself drawing 3 verticals + 2 drags, you''re authoring something closer to 4 Verts with a drag tag, not Mesh.
QB read: man vs zone — vs man, hit the crosser running away from his defender; vs zone, hit whoever finds the soft spot underneath the LBs. The over-the-top SIT/DIG is the second progression; the back/flat is the checkdown. Air Raid foundation.',
    needs_review = false
where scope = 'global'
  and topic = 'scheme'
  and subtopic = 'concept_mesh';
