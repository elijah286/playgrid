/**
 * Concept definitions — migrated from src/domain/play/conceptCatalog.ts.
 *
 * Phase 1b sub-deliverable. All 20 concepts ported as typed ConceptDef
 * entries, preserving the matcher pattern + structural requirements +
 * complexity tier from the legacy catalog. Each concept declares a
 * default formation by id (cross-ref validated by load.ts).
 *
 * Migration choices:
 *   - `pattern` (KG) = `required` (legacy) — role + family + depth ranges.
 *   - `description` (KG short) = first sentence of legacy description.
 *   - `body` (KG long) = full legacy description for the KB chunk.
 *   - `defaultFormation` chosen based on each concept's canonical
 *     pairing (Mesh→Doubles, Snag→Trips Bunch, Bubble RPO→Trips, etc.).
 *   - `requiresCapabilities` derived from the legacy capability gates
 *     (QB runs → qbRun; RPOs → rpoRead; reverses/trick plays → handoff
 *     + trickPlay; standard run concepts → handoff).
 *   - Pass concepts apply to ALL variants; run/RPO/trick concepts
 *     are typically restricted to variants that allow the capability.
 *
 * Skeleton builder data (per-player `assignments`) is NOT migrated in
 * this commit. Those live in src/domain/play/conceptSkeleton.ts and
 * remain the source of compose_play's composition. Phase 1c's auto-
 * generator will surface this if/when we want the KG to own it.
 */

import type { ConceptDef } from "../schemas/ConceptDef";

const ALL_VARIANTS = ["flag_5v5", "flag_6v6", "flag_7v7", "tackle_11"] as const;
const TACKLE_ONLY = ["tackle_11"] as const;

export const CONCEPTS: ConceptDef[] = [
  // ── Pass concepts ─────────────────────────────────────────────────
  {
    id: "curl-flat",
    name: "Curl-Flat",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "High-low read on the flat defender — outside curl + underneath flat.",
    body: "High-low read on the flat defender. Outside receiver runs a SHORT curl (~5 yds, settling at the soft spot just past the LBs); slot or back releases to the flat at 0-3 yds. The flat defender can't cover both — sit on one and the QB throws the other.",
    aliases: ["Curl/Flat", "Hook-Flat"],
    complexity: "basic",
    defaultFormation: { id: "doubles", strength: "right" },
    whenToUse: "Call on 2nd-and-medium or 3rd-and-short vs zone underneath — the flat defender can't cover both layers. Avoid vs man press if your outside receiver can't separate at the top of the curl.",
    commonMistakes: [
      "Curl receiver settles too deep — the LB beneath him stays in the throwing lane. Settle at 5-6 yards, not 8+.",
      "Flat release tangles with the curl. Spacing should be at least 5 yards apart at the snap.",
      "QB stares at the curl; if zone rotates, throw the flat fast — it's the cheaper completion.",
    ],
    pattern: [
      { role: "outside_wr", family: "Curl", depthRangeYds: { min: 4, max: 7 } },
      { role: "any",        family: "Flat", depthRangeYds: { min: 0, max: 4 } },
    ],
  },
  {
    id: "slant-flat",
    name: "Slant-Flat",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "High-low on the flat defender — outside slant + flat underneath.",
    body: "Quick-game variant of Curl-Flat. Outside receiver runs a slant (3-yd stem, sharp inside cut at ~25° above horizontal, catches at 5-6 yds); slot or back releases to the flat at 0-3 yds. The flat defender is in a high-low bind — sits on the flat = throw the slant behind him; bites on the slant = throw the flat. Beats press man (slant is a press-man killer because the inside leverage is gained immediately) and Cover 2 (slant fits between the underneath defenders).",
    aliases: ["Slant/Flat"],
    complexity: "basic",
    defaultFormation: { id: "doubles", strength: "right" },
    whenToUse: "Quick-game answer to press man — the slant is one of football's most reliable press-beaters. Also strong vs Cover 2 with the slant fitting between the corner and the safety.",
    commonMistakes: [
      "Slant breaks too vertical — should be ~45° inside, not 60-75° (that's a deep dig, not a slant).",
      "Flat releases under the slant; should be on the OUTSIDE so the QB has a clean look at both options.",
      "Slant receiver waits to break — at 3 yards he should already be in the cut.",
      "QB throws late. This is a rhythm throw on the third step from shotgun — if it's not there by then, scramble.",
    ],
    pattern: [
      { role: "outside_wr", family: "Slant", depthRangeYds: { min: 3, max: 7 } },
      { role: "any",        family: "Flat",  depthRangeYds: { min: 0, max: 4 } },
    ],
  },
  {
    id: "smash",
    name: "Smash",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "High-low corner-flat combo — outside hitch + corner over the top.",
    body: "High-low corner-flat combo. Outside receiver runs a hitch / short curl (4-6 yds) underneath; inside receiver / TE runs a corner (12-15 yds) over the top. Beats Cover 2 — the corner takes the flat receiver, the safety can't cover the corner.",
    aliases: ["Smash Concept"],
    complexity: "basic",
    defaultFormation: { id: "doubles", strength: "right" },
    whenToUse: "Cover-2 killer — the corner over the top puts the safety in a no-win choice and the hitch underneath is the safe check-down. Reliable on 1st-and-10 or 2nd-and-medium against a 2-shell team.",
    commonMistakes: [
      "Corner depth too shallow — the safety squeezes it. Aim for 12-15 yards before the break.",
      "Hitch settles at the wrong depth; should be at 5 yards with eyes back to the QB by the third step.",
      "QB throws the hitch first against zone — wrong read. Check the corner first, dump the hitch if covered.",
      "Receivers cross the same vertical lane and create traffic. Outside should win to the sideline; corner climbs to the boundary.",
    ],
    pattern: [
      { role: "outside_wr", family: "Hitch",  depthRangeYds: { min: 4, max: 6 } },
      { role: "any",        family: "Corner", depthRangeYds: { min: 12, max: 18 } },
    ],
  },
  {
    id: "stick",
    name: "Stick",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "3rd-down staple — slot sit + flat underneath, clear out over the top.",
    body: "3rd-down staple. Inside receiver / slot runs a sit at 5-6 yds (the 'stick'); outside receiver clears with a fade or go; back releases to the flat. High-low on the flat defender — same idea as curl-flat but uses a SIT instead of a curl (more deliberate settle).",
    aliases: ["Stick Concept"],
    complexity: "basic",
    defaultFormation: { id: "trips", strength: "right" },
    whenToUse: "3rd-down staple, especially 3rd-and-3 to 3rd-and-6. The sit gives you a settled target; the flat is the hot if zone rotates underneath.",
    commonMistakes: [
      "Slot doesn't sit — keeps running, the route becomes a dig and loses the high-low element.",
      "Outside receiver doesn't clear hard enough; the deep defender sinks and the stick window closes.",
      "QB throws the flat before reading the LB — kills the high-low purpose. Read the underneath defender first.",
    ],
    pattern: [
      { role: "slot", family: "Sit",  depthRangeYds: { min: 5, max: 7 } },
      { role: "any",  family: "Flat", depthRangeYds: { min: 0, max: 4 } },
    ],
  },
  {
    id: "snag",
    name: "Snag",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "Three-receiver triangle — slot snag + outside corner + back flat.",
    body: "Three-receiver triangle. Inside slot runs the 'snag' (spot route at 5-6 yds, settling); outside runs a corner over the top; back to the flat. Triangle stretches the flat defender high-low AND the corner inside-out.",
    aliases: ["Snag Concept", "Spot Concept"],
    complexity: "intermediate",
    defaultFormation: { id: "trips-bunch", strength: "right" },
    whenToUse: "Versatile triangle vs Cover 1 or Cover 3 — three options at three depths. Strong on 2nd-and-medium when you need positive yards regardless of look.",
    commonMistakes: [
      "Snag receiver doesn't sit in the soft spot; either keeps running or settles too deep.",
      "Corner route flattens out; should be a true corner break at 45°, not a deep out.",
      "RB flat doesn't get vertical leverage on the linebacker; flat should be back to the sideline at 0-3 yards.",
    ],
    pattern: [
      { role: "slot",       family: "Spot",   depthRangeYds: { min: 4, max: 7 } },
      { role: "outside_wr", family: "Corner", depthRangeYds: { min: 12, max: 18 } },
      { role: "any",        family: "Flat",   depthRangeYds: { min: 0, max: 4 } },
    ],
  },
  {
    id: "four-verticals",
    name: "Four Verticals",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "FOUR receivers run vertical — outside Gos + inside Seams. Literally requires four verts.",
    body: "FOUR receivers run vertical, stretching every coverage deep. The two outside WRs run Go routes; the two inside players (slot + TE, or two slots) run Seams to split the safeties. The concept LITERALLY requires four vertical routes — a play with only two verts is NOT '4 verts', it's a different concept (e.g. seam-flood, dagger). Beats Cover 2 (4 verts vs 2 deep), Cover 3 (seams threaten the FS), and any single-high look.",
    aliases: ["Four Verts", "4 Verts", "Verticals"],
    complexity: "intermediate",
    defaultFormation: { id: "doubles", strength: "right" },
    altFormations: [
      { id: "empty", note: "5-wide variant — all four receivers can release on verts plus a fifth choice route" },
      { id: "trips", note: "Trips side runs 3 verts; backside isolate runs the 4th" },
    ],
    whenToUse: "Best on 1st-and-10 or shot plays vs single-high coverage — seam routes attack the safety's space, and a man corner can't run with a vertical for 50 yards. Avoid vs deep zone (Cover 4) which has too many bodies in the deep half.",
    commonMistakes: [
      "Inside receivers don't bend their seam — should track at 2-yard width inside the hash to attack the FS.",
      "Outside receivers run pure verticals vs deep zone — should adjust to comebacks at 14-16 yards.",
      "QB throws on rhythm without reading the safety; this is a read-then-throw, not a pre-snap throw.",
    ],
    pattern: [
      { role: "outside_wr", family: "Go",   depthRangeYds: { min: 12, max: 25 } },
      { role: "outside_wr", family: "Go",   depthRangeYds: { min: 12, max: 25 } },
      { role: "any",        family: "Seam", depthRangeYds: { min: 12, max: 25 } },
      { role: "any",        family: "Seam", depthRangeYds: { min: 12, max: 25 } },
    ],
  },
  {
    id: "mesh",
    name: "Mesh",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "Two crossing drags meshing at 5-6 yards with 1 yard of vertical separation.",
    body: "Two shallow crossing drags from opposite sides of the formation that 'mesh' past each other at 5-6 yards — one runner is the UNDER (at 5yd), the other is the OVER (at 6yd), giving 1 yard of visible separation at the mesh point. The depth differential is small but real: same depth = collision; ~1yd differential at canonical 5-6 yd depth = natural rub for the under-drag and a free release for the over-drag. Cal MUST set depthYds explicitly on each drag (e.g. 5 and 6) so the over-drag passes CLEARLY ABOVE the under-drag. Natural pick / rub action vs man, finds soft spots in zone.",
    aliases: ["Mesh Concept"],
    complexity: "basic",
    defaultFormation: { id: "doubles", strength: "right" },
    altFormations: [
      { id: "diamond", note: "Diamond formation tightens the mesh angle — rubs hit faster vs press man" },
    ],
    whenToUse: "Best vs man coverage — the natural rub at the cross gives both crossers a free release. Also reliable as a check-down vs blitz because the drags break inside out of the rush. Avoid vs Cover 2 with a deep middle safety; the underneath shells smother the crossers.",
    commonMistakes: [
      "Crossers at the same depth — they collide and defenders stay glued. Aim for ~1 yard of vertical separation at the mesh point (e.g. 5 and 6).",
      "QB locks onto the first crosser; the second crosser comes open a half-tick later behind the rub.",
      "Tightening the cross too close to the LOS — defenders can re-route from underneath. Cross at 5-6 yards, not below.",
      "No check-down outlet. Mesh wants an RB or center as a hot route against blitz.",
    ],
    reads: [
      { progression: 1, player: "Flat / check-down", window: "vs blitz — throw immediately", coverage: "vs pressure" },
      { progression: 2, player: "Under-drag", window: "first crosser behind the LBs", coverage: "vs man" },
      { progression: 3, player: "Over-drag", window: "second crosser behind the rub", coverage: "vs man" },
    ],
    // Canonical Mesh depths: BOTH drags at 5-6yd with at least 1yd
    // of separation. Pattern enforces differentiation via NON-
    // OVERLAPPING ranges per slot: under-drag in [4, 5.5], over-drag
    // in [5.5, 7]. Same-depth drags (e.g. 5/5 or 6/6) fail because
    // only one slot is satisfied — preserves the "collision = not a
    // mesh" gate. The skeleton emits the canonical 5+6.
    pattern: [
      { role: "any", family: "Drag", depthRangeYds: { min: 4, max: 5.5 } },
      { role: "any", family: "Drag", depthRangeYds: { min: 5.5, max: 7 } },
    ],
  },
  {
    id: "flood",
    name: "Flood",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "Three receivers stretching ONE side at three depths — Corner deep, Out mid, Flat low.",
    body: "Three receivers stretching ONE SIDE of the field at THREE depths — Corner deep (12-18 yds), Out at the second level (7-10 yds), Flat low (0-4 yds, typically the RB to the flood side). All on the SAME SIDE so the cornerback (high-low) and the flat defender are both stretched. Forces a single underneath defender to pick one. Beats Cover 3 and most rotated zones. Erhardt-Perkins / pro-style staple.",
    aliases: ["Sail", "Flood Concept", "Sail Concept"],
    complexity: "intermediate",
    defaultFormation: { id: "trips", strength: "right" },
    sameSideRequired: true,
    whenToUse: "Best vs Cover 3 — the three-level stretch puts the deep defender, the curl-flat defender, and the boundary corner each in conflict. Doesn't beat 2-shell coverages with two deep safeties.",
    commonMistakes: [
      "Routes stack vertically instead of stretching flat-to-deep — one defender can cover them all.",
      "Deep route runs at the wrong landmark; should be at the numbers, not the hash.",
      "Flat releases too late; should be the first route to declare so the underneath defender commits.",
    ],
    pattern: [
      { role: "any", family: "Corner", depthRangeYds: { min: 12, max: 18 } },
      { role: "any", family: "Out",    depthRangeYds: { min: 8,  max: 12 } },
      { role: "any", family: "Flat",   depthRangeYds: { min: 0,  max: 4  } },
    ],
  },
  {
    id: "drive",
    name: "Drive",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "Two middle crossers at differentiated depths — Drag under + Dig over.",
    body: "Two crossers attacking the middle at differentiated depths — Drag UNDER (2-4 yds) and Dig OVER (10-14 yds). The under-drag rubs through traffic; the dig settles in the void behind the LBs. Beats man (rub on releases) and zone (dig sits in the hole). Often paired with a backside clear.",
    aliases: ["Drive Concept"],
    complexity: "intermediate",
    defaultFormation: { id: "doubles", strength: "right" },
    whenToUse: "Excellent answer to Cover 1 — the drag eats horizontal space, the dig above stretches the LB level. Reliable 2nd-and-medium call when you need a chunk play but not a shot.",
    commonMistakes: [
      "Drag depth wrong — should be at 2-4 yards, not 5+ (that becomes a shallow cross, different concept).",
      "Dig too shallow; should be at 12 yards minimum to stretch the second-level defenders.",
      "Both crossers go the same direction; should be opposing for the rub effect at the cross.",
    ],
    pattern: [
      { role: "any", family: "Drag", depthRangeYds: { min: 2,  max: 4  } },
      { role: "any", family: "Dig",  depthRangeYds: { min: 10, max: 14 } },
    ],
  },
  {
    id: "levels",
    name: "Levels",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "Two inside-breakers at two levels — low In (6-8) + high Dig (12-14).",
    body: "Two crossing in-breaking routes at TWO LEVELS — low In at 6-8 yds and high Dig at 12-14 yds, both breaking inside on the same side. High-low stretches the underneath LB. LB sinks under the dig = throw the low In; LB drives short = throw the dig. Indianapolis Colts (Manning era) staple.",
    aliases: ["Levels Concept"],
    complexity: "intermediate",
    defaultFormation: { id: "doubles", strength: "right" },
    whenToUse: "Manning-era staple vs man and zone-match. High-low at two depths puts the corner in a bind on the deep side.",
    commonMistakes: [
      "Routes flatten out instead of staying vertical at their landmark before the in-cut.",
      "QB throws the high read first; should read low-to-high — high In is the safety-valve.",
      "Both routes break at the same yardage; the depth differential is the entire point.",
    ],
    pattern: [
      { role: "any", family: "In",  depthRangeYds: { min: 6,  max: 8  } },
      { role: "any", family: "Dig", depthRangeYds: { min: 10, max: 14 } },
    ],
  },
  {
    id: "y-cross",
    name: "Y-Cross",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "TE/Y deep crosser at 14-16 yds + deep clear + flat outlet.",
    body: "TE/Y runs a DEEP crosser at 14-16 yds, paired with a deep clear-out (Post or Go) on top and a flat/drag underneath. Triangle stretch — high (clear), medium (deep cross), low (flat) on the same side. QB reads the safety, then the LB. Beats man and zone equally. Air Raid + West Coast staple.",
    aliases: ["Y Cross", "Y-Cross Concept"],
    complexity: "advanced",
    defaultFormation: { id: "doubles", strength: "right" },
    whenToUse: "Big-play call vs Cover 1 — the crosser becomes a 1-on-1 with a linebacker on a deep angle. Best on 2nd-and-long when you need a chunk.",
    commonMistakes: [
      "Crosser stays flat instead of climbing — should be at 18-22 yards by the time he crosses the hash.",
      "No underneath outlet route; the play falls apart vs pressure and the QB has nowhere to go.",
      "Post + dig stack at the same depth on the same side; depth and side differentiation is what stretches the safety.",
    ],
    pattern: [
      { role: "any", family: "Dig",  depthRangeYds: { min: 14, max: 16 } },
      { role: "any", family: "Post", depthRangeYds: { min: 12, max: 18 } },
      { role: "any", family: "Flat", depthRangeYds: { min: 0,  max: 4  } },
    ],
  },
  {
    id: "dagger",
    name: "Dagger",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "Inside Seam clears, outside Dig hits the void — modern NFL shot play.",
    body: "Inside receiver runs a Seam (vertical clear, 14+ yds) to clear the deep safety; outside receiver runs a DEEP DIG at 14-16 yds in the void the seam created. Modern NFL shot play — the seam pulls the safety, the dig hits the soft spot behind the LB and in front of the safety's vacated zone. Best vs single-high coverage.",
    aliases: ["Dagger Concept"],
    complexity: "advanced",
    defaultFormation: { id: "doubles", strength: "right" },
    whenToUse: "Modern shot play vs single-high coverage — the seam pulls the safety, the dig hits the soft spot the safety vacated. Best on 1st-and-10 or 2nd-and-medium when you've seen Cover 1 or Cover 3.",
    commonMistakes: [
      "Seam not aggressive enough; should force the safety to declare or commit.",
      "Dig too shallow — settle at 14-16 yards in the soft spot, not 10.",
      "QB throws the dig before the seam clears the safety; sequence matters.",
    ],
    pattern: [
      { role: "any", family: "Seam", depthRangeYds: { min: 14, max: 25 } },
      { role: "any", family: "Dig",  depthRangeYds: { min: 14, max: 16 } },
    ],
  },

  // ── Designed-QB-run / RPO / reverse ───────────────────────────────
  {
    id: "qb-draw",
    name: "QB Draw",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "Designed QB run from shotgun — OL pass-sets to sell pass, QB attacks soft middle.",
    body: "Designed QB run from shotgun. The OL pass-sets to sell pass; receivers run pass routes (hitches / verts) to widen and pull the defense; the QB hesitates as if reading, then runs straight through the soft middle. Best against rush-heavy fronts on obvious passing downs — coverage drops, the box is light, the QB takes the easy yards.",
    aliases: ["Quarterback Draw", "QB Lead Draw"],
    complexity: "basic",
    defaultFormation: { id: "empty", strength: "right" },
    whenToUse: "Best on 3rd-and-medium against a deep-rotation defense — pass-rushers vacate the middle, coverage drops, the QB takes the easy 7-8 yards. Especially deadly when the QB is a running threat.",
    commonMistakes: [
      "QB telegraphs by stepping up too early; should sell the dropback for at least two beats.",
      "OL doesn't sell the pass set; rushers stay home and the lane never opens.",
      "Receivers don't widen on their hitches; LBs hold the middle and the lane closes.",
    ],
    pattern: [],
    structural: {
      requiresCarry: {
        player: "qb",
        runTypes: ["draw", "qb_keep"],
      },
    },
    requiresCapabilities: ["qbRun"],
  },
  {
    id: "bubble-rpo",
    name: "Bubble RPO",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "Inside Zone + Bubble screen tag — QB reads conflict defender for run/throw.",
    body: "Run-pass option built on Inside Zone with a bubble screen tag. The OL run-blocks; the back takes the Inside Zone path; a slot receiver releases on a bubble (lateral release, settling 0–2 yds behind the LOS); the QB reads the conflict defender (typically the playside OLB / overhang). If the conflict defender comes down to fill the run, the QB pulls and throws the bubble — the slot has the perimeter outflanked. If the defender stays out to play the bubble, the QB gives and the back hits a 5-on-5 box. Modern HS / college / NFL staple.",
    aliases: ["Bubble Screen RPO", "RPO Bubble", "Inside Zone Bubble"],
    complexity: "advanced",
    defaultFormation: { id: "trips", strength: "right" },
    whenToUse: "Use when the box is loaded (defender count exceeds blockers + 1) — pull and throw the bubble. When the box is light, hand off. The READ is the play; calling the right action based on alignment is more important than the play name.",
    commonMistakes: [
      "QB doesn't actually read; just hands off (or always pulls). Defeats the entire purpose of the RPO.",
      "Bubble receiver attacks the LOS; should be running at the QB pre-snap then bouncing outside on the catch.",
      "OL runs downfield on the bubble side — illegal man downfield. Half-cuts are the discipline; no OL gets past the LOS until the QB commits.",
      "QB holds the read too long; should be a 1-second decision off the conflict defender's first step.",
    ],
    pattern: [
      { role: "slot", family: "Bubble", depthRangeYds: { min: -2, max: 2 } },
    ],
    structural: {
      requiresRpoRead: true,
      requiresCarry: {
        player: "back",
        runTypes: ["inside_zone"],
      },
    },
    requiresCapabilities: ["rpoRead", "handoff"],
  },
  {
    id: "jet-reverse",
    name: "Jet Reverse",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "Multi-handoff misdirection — initial fake one way, reverse runner attacks the vacated side.",
    body: "Multi-handoff misdirection. QB takes the snap and hands to the back (or jet-motion receiver) running toward one side; the back/jet then hands the ball back to the weak-side receiver coming around from the opposite direction. Two exchanges, three ball-handlers. The whole defense flows to the initial fake; the reverse runner attacks the vacated weak side. Best when the defense is over-pursuing the run game and your perimeter blockers (slot, weak-side WR) can seal the cornerback.",
    aliases: ["Reverse", "Reverse Jet", "End-Around Reverse"],
    complexity: "intermediate",
    defaultFormation: { id: "singleback", strength: "right" },
    whenToUse: "Catch a defense over-pursuing pre-snap motion. Best in the red zone or on the boundary where the defense has been over-flowing to the jet action. One-shot — use it sparingly; the surprise IS the play.",
    commonMistakes: [
      "Motion man too slow; pursuit catches up before the second handoff connects.",
      "Reverse cross-block too cute; just give a clean lane on the backside — the misdirection does the work.",
      "Calling it too often; once the defense has seen it twice in a game, the over-pursuit disappears.",
    ],
    pattern: [],
    structural: {
      requiresBallPathSteps: 2,
    },
    requiresCapabilities: ["handoff", "trickPlay"],
  },

  // ── Plain run concepts ────────────────────────────────────────────
  {
    id: "sweep",
    name: "Sweep",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "Wide perimeter run — OL pulls/reaches playside, back attacks the edge.",
    body: "Wide perimeter run. QB hands to the back, who attacks the edge with the OL pulling or reaching playside. The back's footwork is patient-then-fast: read the kick-out block, then turn vertical when the corner is sealed. Best vs over-aligned interior fronts where the perimeter is light.",
    aliases: ["Outside Sweep", "Toss Sweep", "Stretch"],
    complexity: "basic",
    defaultFormation: { id: "singleback", strength: "right" },
    whenToUse: "Get to the edge fast vs a defense over-committing to the interior. Best on 1st-and-10 to establish the edge run, or as a change-of-pace after a series of inside hits.",
    commonMistakes: [
      "RB cuts up too early; should press the edge first to force the corner to commit, THEN turn vertical.",
      "Pulling lineman gets caught on the LOS; needs a clean pull around with no hesitation.",
      "Perimeter blockers don't seal — wide receivers and slot must stalk-block the corner and force defender.",
    ],
    pattern: [],
    structural: {
      requiresCarry: { player: "back", runTypes: ["sweep", "outside_zone"] },
      requiresBallPathSteps: 1,
    },
    requiresCapabilities: ["handoff"],
  },
  {
    id: "dive",
    name: "Dive",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "North-south interior run — back attacks A/B gap downhill, OL inside-zone-blocks.",
    body: "North-south interior run. QB hands to the back attacking the A/B gap downhill — first available crease wins. OL inside-zone-blocks. Stays on schedule, eats clock, and softens up a stout interior for the play-action that follows.",
    aliases: ["Inside Dive", "Iso", "Lead Dive"],
    complexity: "basic",
    defaultFormation: { id: "singleback", strength: "right" },
    whenToUse: "Short yardage between the tackles vs a soft front. Quick-hitting and predictable but consistent — chunks of 2-4 yards keep the chains moving and set up play-action.",
    commonMistakes: [
      "Back hesitates at the hole; should hit it downhill at full speed — first available crease wins.",
      "OL high-blocks; need to double-team the playside DT to the LB level.",
      "Run-action faked too softly; play-action off dive depends on the LBs honoring this look.",
    ],
    pattern: [],
    structural: {
      requiresCarry: { player: "back", runTypes: ["inside_zone", "trap"] },
      requiresBallPathSteps: 1,
    },
    requiresCapabilities: ["handoff"],
  },
  {
    id: "power",
    name: "Power",
    family: "concept",
    variants: [...TACKLE_ONLY],
    description: "Gap-scheme downhill run with a pulling lineman as lead through a designated gap.",
    body: "Gap-scheme downhill run with a pulling blocker as lead. QB hands to the back, who follows the pulling guard (or H-back) through the designated gap. OL down-blocks playside; backside guard pulls and kicks out / leads up to the second level. Hard-hitting, decisive — the defense gets one count to fit gaps and the back is already through. Best when the defense over-aligns to one side or against a stack-and-shed front you can knock off the ball.",
    aliases: ["Power O", "Strong Power", "Down G"],
    complexity: "basic",
    defaultFormation: { id: "pro-i", strength: "right" },
    whenToUse: "Short yardage between the tackles. Reliable hammer when you need 2-3 yards — gets at least the LOS even vs a stacked box.",
    commonMistakes: [
      "RB cuts away from the puller; should follow him through the hole, not freelance.",
      "Puller stops at the LOS instead of climbing to the LB; the second-level block is what springs the run.",
      "Down-blocks too soft; need to knock the DTs off the ball, not just engage.",
    ],
    pattern: [],
    structural: {
      requiresCarry: { player: "back", runTypes: ["power"] },
      requiresBallPathSteps: 1,
    },
    requiresCapabilities: ["handoff", "blocking"],
  },
  {
    id: "counter",
    name: "Counter",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "Misdirection run — back jab-steps strong, takes handoff going back weak behind pulling blockers.",
    body: "Misdirection run. The back jab-steps strong-side to hold the LBs, then takes the handoff going BACK weak-side behind pulling blockers (typically the backside guard + tackle). The 'counter' is the defense's pursuit moving the wrong way. Best vs defenses that flow hard to initial back action.",
    aliases: ["Counter Trey", "Counter GT", "Counter OF"],
    complexity: "intermediate",
    defaultFormation: { id: "singleback", strength: "right" },
    whenToUse: "Against an aggressive front that over-pursues to the back's initial step. The misdirection at the snap pulls defenders away from the actual play side.",
    commonMistakes: [
      "Fake step too lazy; defenders read it. Must be a hard one-step fake to sell the strong-side action.",
      "Pulling guards trip over each other; need clean pull-around timing — backside guard pulls first, tackle follows.",
      "Back doesn't widen enough after the jab; the counter path should bend BEHIND the OL's wash.",
    ],
    pattern: [],
    structural: {
      requiresCarry: { player: "back", runTypes: ["counter"] },
      requiresBallPathSteps: 1,
    },
    requiresCapabilities: ["handoff"],
  },
  {
    id: "draw",
    name: "Draw",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "Late-developing interior run that sells pass first — OL pass-sets, back hits soft middle late.",
    body: "Late-developing interior run that sells pass first. The OL pass-sets to draw the rush upfield; receivers run hitches / verts to widen the coverage; QB drops back, then hands LATE to the back hitting the soft middle vacated by the rush. Best on obvious passing downs against rush-heavy fronts.",
    aliases: ["RB Draw", "Lead Draw"],
    complexity: "intermediate",
    defaultFormation: { id: "empty", strength: "right" },
    whenToUse: "Best on 3rd-and-long when the defense is in pass-rush mode — the OL pass-sets and the back hits the hole the rushers vacated. Especially deadly vs nickel/dime fronts with light boxes.",
    commonMistakes: [
      "OL sells the pass too softly; rushers don't widen and the lane never opens.",
      "Back leaves too early; should wait for the rushers to commit upfield past the LOS.",
      "Receivers run shallow routes; should run hitches at 8-10 yards to pull coverage AWAY from the hole.",
    ],
    pattern: [],
    structural: {
      requiresCarry: { player: "back", runTypes: ["draw"] },
      requiresBallPathSteps: 1,
    },
    requiresCapabilities: ["handoff"],
  },

  // ── Trick play ────────────────────────────────────────────────────
  {
    id: "flea-flicker",
    name: "Flea Flicker",
    family: "concept",
    variants: [...ALL_VARIANTS],
    description: "Trick play — back/WR pitches ball back to QB after fake rush, deep throw off run-action.",
    body: "Trick play that sells run, then attacks deep. QB hands to a back / WR going forward to the LOS; that player runs hard as if rushing, then PITCHES the ball BACK to the QB still behind the LOS. The defense has already triggered on the run fake; deep receivers clear out and find the void behind the now-collapsing safeties. Two backwards passes / handoffs, one deep throw. Best after the run game has been established — the defense has to believe the fake.",
    aliases: ["Flicker", "Halfback Flicker", "WR Flicker"],
    complexity: "advanced",
    defaultFormation: { id: "doubles", strength: "right" },
    whenToUse: "Trick play — best after establishing the run game so safeties are biting on run-action. Usually 1st-and-10 or 2nd-and-short, ideally between the 30s. One-time call: defenses adjust the second time they see it.",
    commonMistakes: [
      "QB shows the pass too early; safeties don't bite and the deep routes get smothered.",
      "Back doesn't sell the run hard enough; should be at full speed before the pitch back.",
      "Deep receiver releases vertically too quickly; should release lazily then accelerate to sell the run-block.",
      "Pitch back to QB is sloppy; should be a clean underhand pitch, not a forward toss.",
    ],
    pattern: [],
    structural: {
      requiresBallPathSteps: 2,
      requiresBallPathReturnsToOrigin: true,
    },
    requiresCapabilities: ["handoff", "trickPlay", "playAction"],
  },
];
