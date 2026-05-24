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
    description: "Two crossing drags at differentiated depths — under-drag ~2yd + over-drag ~7-8yd.",
    body: "Two crossing drags that 'mesh' past each other at differentiated depths — one UNDER (~2 yds) and one OVER (~7-8 yds). The depth differentiation + meaningful absolute depth is what makes them mesh visibly: same depth = collision; close depths = visually-collided in the chat preview; both crammed at the LOS = invisible cross. Cal MUST set depthYds explicitly on each drag (e.g. 2 and 8) so the over-drag passes CLEARLY ABOVE the under-drag with unambiguous visible separation. Natural pick / rub action vs man, finds soft spots in zone.",
    aliases: ["Mesh Concept"],
    complexity: "basic",
    defaultFormation: { id: "doubles", strength: "right" },
    altFormations: [
      { id: "diamond", note: "Diamond formation tightens the mesh angle — rubs hit faster vs press man" },
    ],
    pattern: [
      { role: "any", family: "Drag", depthRangeYds: { min: 2, max: 3.5 } },
      { role: "any", family: "Drag", depthRangeYds: { min: 6, max: 9 } },
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
    pattern: [],
    structural: {
      requiresBallPathSteps: 2,
      requiresBallPathReturnsToOrigin: true,
    },
    requiresCapabilities: ["handoff", "trickPlay", "playAction"],
  },
];
