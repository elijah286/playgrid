# Goldens verification — Bomb Squad offense, page 1

The labels in [goldens/bomb-squad-offense-p1.json](goldens/bomb-squad-offense-p1.json) are **my read of your photo** (Fable, 2026-07-02, from the full-sheet image at chat resolution). They are the eval's answer key, so they need a pass from someone who knows the plays — you — before the accuracy numbers mean anything.

## How to verify (10–15 minutes)

1. Run a dry crop so you get one clean image per play:
   ```
   npx tsx scripts/photo-import-eval/run.ts --image <path-to-photo>.jpg --dry
   ```
   Crops land in `scripts/photo-import-eval/runs/.../crops/`. (Or just use the physical sheet.)
2. For each play in the goldens file: fix anything wrong (family, depth, direction, formation name). `alternates` = other families you'd accept as a correct read of the drawing.
3. Flip `"verified": false` → `true` on each play you've checked. The report scores verified and unverified plays separately.

Formation names, route families, and depths use your app's own vocabulary (the catalog in `src/domain/play/routeTemplates.ts`); aliases are fine — the scorer resolves them.

## My read per play, and what I need from you

| # | My one-line read | Open question |
|---|---|---|
| 1 | Doubles, B offset back. Z drag, B jet motion→flat R, Y seam, X corner R, A go | Is B a flat after motion or a **jet sweep handoff**? |
| 2 | Trips left. Y quick-out L, Z deep corner L, A in 8, X corner R, B out 5 | Weakest read of row 1 — check Z and A especially |
| 3 | Compressed trips left. A corner L, Z seam, B hitch, X out 8, Y seam | Trips or bunch? X: flat out vs climbing corner? |
| 4 | Y quick-out L, A flat L, Z long shallow cross L, X corner R, B go | **What do the short dashed arrows mean?** |
| 5 | Z/A stacked far left. Z corner L, A in, Y deep cross L, X go, B go | Who owns the deep crosser — Y or X? Stack order? |
| 6 | Bunch left; crossing mess. A seam, B corner R, Y flat L, X post L, Z under-cross | Stress-test panel — expect to correct several |
| 7 | Z corner L, A post R, B drag L, X dig L, Y post L | Which of X/Y digs vs posts? |
| 8 | **Five verts** (X/B/Y/A/Z all vertical) | Quickest confirm on the sheet |
| 9 | A go, Z whip/pivot, Y quick-out L, B dig L, X go | Z's little pivot shape — whip? |
| 10 | A go, Y out 5 ⚑, X in 6, Z go, B hitch ⚑ | **What are the little flag/pennant glyphs?** (also plays 11, 15) |
| 11 | A go, Z hitch, B out ⚑, X corner R, Y post L | Weak read — check everything |
| 12 | A seam, Y in-cross R, B out 6, X comeback 12, Z go | X's hook: comeback (to sideline) or curl (to QB)? |
| 13 | Z deep post R, A curl 8, Y in 10, X drag L, B jet motion→flat R | Same B jet-sweep question as Play 1; Z post vs go |
| 14 | Iso Y left; Z seam, B drag L, X post L, A go | Quads right or trips+back? Who's the shallow crosser? |
| 15 | Z slant, A post R, X hitch ⚑, B corner R, Y curl | B: corner vs wheel; A's deep in-breaker |
| 16 | Iso Y left. Y comeback L, Z post L, B drag L, X in 8, A corner R | A: single-break corner or double move (out & up)? |

Three notation questions decide several labels at once:

1. **Zigzag along the LOS** (plays 1, 13): I've assumed pre-snap jet motion into a route. If those are jet sweep handoffs, the golden becomes `kind: "carry"`.
2. **Short dashed arrows** (play 4): check-release / option / decoy?
3. **Pennant glyphs** (plays 10, 11, 15): once you tell me what Playmaker X means by them, the extraction prompt gets a rule and stops flagging them as ambiguities.
