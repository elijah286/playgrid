-- Mesh KB v3: bump differentiation depths so the cross is VISIBLE.
--
-- Coach feedback 2026-05-02: previous v2 (depths 2 and 4) still
-- rendered the mesh cross crammed against the LOS / OL row. Canonical
-- Throw Deep / Hudl Mesh art shows the routes crossing at 4-6yd
-- depth — clearly above the line, where the cross is the visible
-- focal point of the play.
--
-- Lockstep changes (catalog + KB + agent prompt + tests):
--   • Drag template canonical depth bumped from 1.5yd → 3yd
--     (template y=0.06 → 0.12). depthYds scaling preserves the
--     pinned-flat cross at any scaled depth.
--   • Drag catalog range widened from [1, 4] → [1, 6] so the OVER
--     drag in a Mesh can render at 5-6yd without falling outside
--     the family.
--   • Mesh slot ranges bumped from [1, 2.5]+[3.5, 5] → [2, 3.5]+[4.5, 6].
--   • Cal now sets depthYds: 3 (under) and depthYds: 5 (over).

update public.rag_documents
set content = 'Mesh is anchored by TWO crossing drag routes that mesh past each other at MEANINGFUL, DIFFERENTIATED depths — one drag at 2-3.5 yds (the UNDER) and one drag at 4.5-6 yds (the OVER). The depth differentiation + meaningful absolute depth is what makes them mesh visibly: same depth = collision; both crammed at the LOS = invisible cross. The catalog enforces this: the two drag slots have non-overlapping depth ranges that BOTH require depth above the OL row, so a play with both drags at 1-2yd is rejected.

How to author Mesh in a PlaySpec:
  • Set `depthYds: 3` on the under-drag assignment.
  • Set `depthYds: 5` on the over-drag assignment.
  • Without explicit depthYds, both drags render at the catalog default (3 yds) and the cross is invisible — both routes overlap.
  • DO NOT set both at 1-2yd "to be safe shallow" — that crams the play against the LOS and the mesh action is invisible to the coach reading the diagram.

Standard role assignments:
  • Both drags are run by INSIDE players — slot WRs, H-back, or Y/TE — NOT by both outside X/Z.
  • The outside X/Z receivers run COMPLEMENTARY routes over the top: a SIT or DIG at 8-12 yds (the high option), or in some variations one X/Z runs a single deep clear (Go/Post) to vacate the secondary.
  • The back releases to the flat as the QB''s outlet.

What Mesh is NOT: a play with 3+ vertical routes. Multiple verticals stretch the secondary thin and defeat the purpose — Mesh works because the underneath drags find the soft spot a SINGLE vertical opens up. If you find yourself drawing 3 verticals + 2 drags, you''re authoring something closer to 4 Verts with a drag tag, not Mesh.

QB read: man vs zone — vs man, hit the crosser running away from his defender; vs zone, hit whoever finds the soft spot underneath the LBs. The over-drag (5 yds) is typically the primary; the under-drag (3 yds) is the secondary; the over-the-top SIT/DIG is the third progression; the back/flat is the checkdown. Air Raid foundation, modeled after the Throw Deep / Hudl canonical Mesh art.',
    needs_review = false
where scope = 'global'
  and topic = 'scheme'
  and subtopic = 'concept_mesh';
