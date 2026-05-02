-- Mesh KB v2: explicit depthYds instructions for the high/low pair.
--
-- Followup to 20260501160000. After tightening the catalog Mesh
-- concept (slot ranges [1, 2.5] under and [3.5, 5] over) and wiring
-- the renderer to honor `action.depthYds`, the KB chunk now needs to
-- TELL Cal to set depthYds explicitly on each drag — without that,
-- both drags render at the catalog default (1.5yd) and the play
-- looks like a collision instead of a mesh.

update public.rag_documents
set content = 'Mesh is anchored by TWO shallow drag routes that cross past each other UNDERNEATH at DIFFERENTIATED depths — one drag at 1-2.5 yds (the UNDER) and one drag at 3.5-5 yds (the OVER). The depth difference is what makes them mesh: same depth = collision, different depths = clean cross. The catalog enforces this: the two drag slots have non-overlapping depth ranges, so a play with both drags at the same depth is rejected.

How to author Mesh in a PlaySpec:
  • Set `depthYds: 2` on the under-drag assignment.
  • Set `depthYds: 4` on the over-drag assignment.
  • Without explicit depthYds, both drags render at the catalog default (1.5 yds) and the play looks like a collision instead of a mesh.

Standard role assignments:
  • Both drags are run by INSIDE players — slot WRs, H-back, or Y/TE — NOT by both outside X/Z.
  • The outside X/Z receivers run COMPLEMENTARY routes over the top: a SIT or DIG at 8-12 yds (the high option), or in some variations one X/Z runs a single deep clear (Go/Post) to vacate the secondary.
  • The back releases to the flat as the QB''s outlet.

What Mesh is NOT: a play with 3+ vertical routes. Multiple verticals stretch the secondary thin and defeat the purpose — Mesh works because the underneath drags find the soft spot a SINGLE vertical opens up. If you find yourself drawing 3 verticals + 2 drags, you''re authoring something closer to 4 Verts with a drag tag, not Mesh.

QB read: man vs zone — vs man, hit the crosser running away from his defender; vs zone, hit whoever finds the soft spot underneath the LBs. The over-drag (4 yds) is typically the primary; the under-drag (2 yds) is the secondary; the over-the-top SIT/DIG is the third progression; the back/flat is the checkdown. Air Raid foundation.',
    needs_review = false
where scope = 'global'
  and topic = 'scheme'
  and subtopic = 'concept_mesh';
