/**
 * Canonical defensive alignments — deterministic positions for common
 * (front, coverage) combinations.
 *
 * Why this exists: when Coach Cal freehands defensive players, it routinely
 * produces broken looks (two CBs on the same side, LBs stacked on top of
 * D-line, safeties at QB-depth). Forcing the AI to pick a NAMED scheme and
 * then having code place the players makes the defense legal by construction.
 *
 * Coordinate system matches the CoachDiagram format the AI emits:
 *   x = yards from center  (negative = LEFT side, positive = RIGHT side)
 *   y = yards from LOS     (positive = downfield / defense's side)
 *
 * "Strength" controls which side the defense rotates toward. The catalog
 * is authored as if strength = "right"; for "left" we mirror x.
 */
/**
 * Per-defender assignment within a canonical (front, coverage) entry.
 *
 * Replaces the coarse `manCoverage: boolean` flag with a structured
 * description of WHAT each defender is doing. This is what makes Cover 1
 * render correctly: FS plays a zone (deep middle) while every other
 * defender is in man — a coverage-wide boolean can't express that.
 *
 * Kinds:
 *   - `zone`  — defender drops into a named zone (looked up by `zoneId`
 *               in the alignment's `zones[]`).
 *   - `man`   — defender matches a specific receiver. `target` is a
 *               receiver id like "X" / "Z" / "TE" / "RB" / "#1" (slot
 *               relative to formation strength). When unset, the
 *               renderer/notes layer infers the target by leverage.
 *   - `blitz` — defender rushes the QB through `gap`. Not all entries
 *               include blitzers; this is the override slot.
 *   - `spy`   — defender mirrors a specific offensive player (usually
 *               the QB or a dynamic back).
 *
 * `unspecified` is intentionally NOT a kind — every defender in the
 * catalog must have a concrete role. The validator (Phase D4) rejects
 * any entry with a missing or unknown assignment.
 */
export type DefenderAssignmentSpec =
  | { kind: "zone"; zoneId: string }
  | { kind: "man"; target?: string }
  | { kind: "blitz"; gap?: "A" | "B" | "C" | "D" | "edge" }
  | { kind: "spy"; target?: string };

export type DefensiveAlignmentPlayer = {
  /** Short label (≤2 chars) shown inside the triangle. */
  id: string;
  x: number;
  y: number;
  /**
   * What this defender is doing. New in the per-defender model. Optional
   * on legacy entries; new entries MUST set it. Read via
   * `getDefenderAssignmentDefault(player, alignment)` to fall back to
   * the alignment-level `manCoverage` boolean for legacy compatibility.
   */
  assignment?: DefenderAssignmentSpec;
};

/**
 * Canonical zone shape attached to a (front, coverage) entry. Yards, authored
 * for strength="right" (mirrors with the players when strength flips). Same
 * fields as `CoachDiagramZone` so the AI tool can pass them straight through.
 */
export type DefensiveAlignmentZone = {
  /**
   * Stable id for cross-referencing from per-defender `zone` assignments.
   * Required when any defender's `assignment.kind === "zone"` references it.
   * Convention: snake_case role name — `deep_middle`, `deep_third_l`,
   * `hook_l`, `flat_r`, etc.
   */
  id?: string;
  kind: "rectangle" | "ellipse";
  /** Center of the zone in yards. */
  center: [number, number];
  /** FULL width and height in yards. */
  size: [number, number];
  /** Short label drawn inside the zone (e.g. "Deep third L"). */
  label: string;
};

export type DefensiveAlignment = {
  /** Front name as a coach would say it. */
  front: string;
  /** Coverage name as a coach would say it. */
  coverage: string;
  /** Sport variant this alignment is sized for. */
  variant: "tackle_11" | "flag_7v7" | "flag_5v5";
  /** Plain-English summary the AI can echo back to the coach. */
  description: string;
  /** Players in canonical positions, authored for strength="right". */
  players: DefensiveAlignmentPlayer[];
  /**
   * Zone shapes — only meaningful when `manCoverage !== true`. Same coord
   * system as `players`. Optional: legacy alignments without zones simply
   * render dots only.
   */
  zones?: DefensiveAlignmentZone[];
  /**
   * True for pure-man coverages (Cover 0, Cover 1 with man on every receiver,
   * 7v7 Man). Suppresses zone rendering and tells the AI to draw assignment
   * lines (defender → receiver) instead.
   */
  manCoverage?: boolean;
};

// ── Tackle 11-on-11 ─────────────────────────────────────────────────────────

const T11_43_OVER_COVER_3: DefensiveAlignment = {
  front: "4-3 Over",
  coverage: "Cover 3",
  variant: "tackle_11",
  description:
    "4-3 Over with the 3-tech to the strong (right) side, Sam walked out over the TE. " +
    "Cover 3 shell — corners take deep thirds, free safety in the deep middle, three LBs underneath.",
  players: [
    // D-line — y≈1 (just off the LOS)
    { id: "DE", x: -8,  y: 1, assignment: { kind: "blitz", gap: "edge" } },
    { id: "DT", x: -2,  y: 1, assignment: { kind: "blitz", gap: "A" } },
    { id: "DT", x:  3,  y: 1, assignment: { kind: "blitz", gap: "B" } },
    { id: "DE", x:  8,  y: 1, assignment: { kind: "blitz", gap: "edge" } },
    // Linebackers — y≈4-5
    { id: "WL", x: -5,  y: 4.5, assignment: { kind: "zone", zoneId: "hook_l" } },
    { id: "ML", x:  0,  y: 4.5, assignment: { kind: "zone", zoneId: "hook_m" } },
    { id: "SL", x:  6,  y: 4.5, assignment: { kind: "zone", zoneId: "flat_r" } },
    // Secondary
    { id: "CB", x: -16, y: 6,   assignment: { kind: "zone", zoneId: "deep_third_l" } },
    { id: "CB", x:  16, y: 6,   assignment: { kind: "zone", zoneId: "deep_third_r" } },
    { id: "FS", x:  0,  y: 13,  assignment: { kind: "zone", zoneId: "deep_third_m" } },
    { id: "SS", x:  6,  y: 9,   assignment: { kind: "zone", zoneId: "flat_l" } },
  ],
  zones: [
    { id: "deep_third_l", kind: "rectangle", center: [-11, 17], size: [11, 16], label: "Deep 1/3 L" },
    { id: "deep_third_m", kind: "rectangle", center: [  0, 17], size: [11, 16], label: "Deep 1/3 M" },
    { id: "deep_third_r", kind: "rectangle", center: [ 11, 17], size: [11, 16], label: "Deep 1/3 R" },
    { id: "flat_l",  kind: "rectangle", center: [-14, 4], size: [8,  8], label: "Flat L" },
    { id: "hook_l",  kind: "rectangle", center: [ -5, 5], size: [10, 8], label: "Hook L" },
    { id: "hook_m",  kind: "rectangle", center: [  0, 5], size: [6,  8], label: "Hook M" },
    { id: "flat_r",  kind: "rectangle", center: [ 14, 4], size: [8,  8], label: "Flat R" },
  ],
};

const T11_43_OVER_COVER_2: DefensiveAlignment = {
  front: "4-3 Over",
  coverage: "Cover 2",
  variant: "tackle_11",
  description:
    "4-3 Over front with Cover 2 shell — two safeties splitting the deep halves, " +
    "corners squat in the flats, three LBs in hook/middle zones.",
  players: [
    { id: "DE", x: -8,  y: 1, assignment: { kind: "blitz", gap: "edge" } },
    { id: "DT", x: -2,  y: 1, assignment: { kind: "blitz", gap: "A" } },
    { id: "DT", x:  3,  y: 1, assignment: { kind: "blitz", gap: "B" } },
    { id: "DE", x:  8,  y: 1, assignment: { kind: "blitz", gap: "edge" } },
    { id: "WL", x: -5,  y: 4.5, assignment: { kind: "zone", zoneId: "hook_l" } },
    { id: "ML", x:  0,  y: 4.5, assignment: { kind: "zone", zoneId: "hook_m" } },
    { id: "SL", x:  6,  y: 4.5, assignment: { kind: "zone", zoneId: "hook_r" } },
    { id: "CB", x: -16, y: 5,   assignment: { kind: "zone", zoneId: "flat_l" } },
    { id: "CB", x:  16, y: 5,   assignment: { kind: "zone", zoneId: "flat_r" } },
    { id: "FS", x: -8,  y: 13,  assignment: { kind: "zone", zoneId: "deep_half_l" } },
    { id: "SS", x:  8,  y: 13,  assignment: { kind: "zone", zoneId: "deep_half_r" } },
  ],
  zones: [
    { id: "deep_half_l", kind: "rectangle", center: [-8, 17], size: [16, 16], label: "Deep 1/2 L" },
    { id: "deep_half_r", kind: "rectangle", center: [ 8, 17], size: [16, 16], label: "Deep 1/2 R" },
    { id: "flat_l",  kind: "rectangle", center: [-14, 4], size: [8, 8], label: "Flat L" },
    { id: "hook_l",  kind: "rectangle", center: [ -6, 5], size: [7, 8], label: "Hook L" },
    { id: "hook_m",  kind: "rectangle", center: [  0, 5], size: [6, 8], label: "Hook M" },
    { id: "hook_r",  kind: "rectangle", center: [  6, 5], size: [7, 8], label: "Hook R" },
    { id: "flat_r",  kind: "rectangle", center: [ 14, 4], size: [8, 8], label: "Flat R" },
  ],
};

const T11_34_COVER_1: DefensiveAlignment = {
  front: "3-4",
  coverage: "Cover 1",
  variant: "tackle_11",
  description:
    "Three down linemen (NT head-up, two DEs over the tackles), four LBs (two ILBs " +
    "and two OLBs as edge rushers/setters). Cover 1 — single-high FS, everyone else man.",
  manCoverage: true,
  players: [
    { id: "DE", x: -5,  y: 1,   assignment: { kind: "blitz", gap: "B" } },
    { id: "NT", x:  0,  y: 1,   assignment: { kind: "blitz", gap: "A" } },
    { id: "DE", x:  5,  y: 1,   assignment: { kind: "blitz", gap: "B" } },
    { id: "OL", x: -10, y: 2.5, assignment: { kind: "blitz", gap: "edge" } },
    { id: "IL", x: -3,  y: 4.5, assignment: { kind: "man", target: "RB" } },
    { id: "IL", x:  3,  y: 4.5, assignment: { kind: "man", target: "TE" } },
    { id: "OL", x: 10,  y: 2.5, assignment: { kind: "blitz", gap: "edge" } },
    { id: "CB", x: -16, y: 6,   assignment: { kind: "man", target: "X" } },
    { id: "CB", x:  16, y: 6,   assignment: { kind: "man", target: "Z" } },
    { id: "SS", x:  6,  y: 6,   assignment: { kind: "man", target: "Y" } },
    { id: "FS", x:  0,  y: 13,  assignment: { kind: "zone", zoneId: "deep_middle" } },
  ],
  zones: [
    { id: "deep_middle", kind: "rectangle", center: [0, 17], size: [20, 16], label: "Deep middle (FS)" },
  ],
};

const T11_NICKEL_425_COVER_4: DefensiveAlignment = {
  front: "Nickel (4-2-5)",
  coverage: "Cover 4 (Quarters)",
  variant: "tackle_11",
  description:
    "Modern nickel front — 4 down, 2 ILBs, 5 DBs (nickel/STAR replaces a LB over the slot). " +
    "Cover 4 quarters: corners and safeties each take a deep quarter, three underneath.",
  players: [
    { id: "DE", x: -8,  y: 1,   assignment: { kind: "blitz", gap: "edge" } },
    { id: "DT", x: -2,  y: 1,   assignment: { kind: "blitz", gap: "A" } },
    { id: "DT", x:  3,  y: 1,   assignment: { kind: "blitz", gap: "B" } },
    { id: "DE", x:  8,  y: 1,   assignment: { kind: "blitz", gap: "edge" } },
    { id: "ML", x: -3,  y: 4.5, assignment: { kind: "zone", zoneId: "hook_m" } },
    { id: "WL", x:  4,  y: 4.5, assignment: { kind: "zone", zoneId: "hook_l" } },
    { id: "NB", x:  9,  y: 5,   assignment: { kind: "zone", zoneId: "flat_r" } },
    { id: "CB", x: -16, y: 6,   assignment: { kind: "zone", zoneId: "deep_quarter_1" } },
    { id: "CB", x:  16, y: 6,   assignment: { kind: "zone", zoneId: "deep_quarter_4" } },
    { id: "FS", x: -7,  y: 11,  assignment: { kind: "zone", zoneId: "deep_quarter_2" } },
    { id: "SS", x:  7,  y: 11,  assignment: { kind: "zone", zoneId: "deep_quarter_3" } },
  ],
  zones: [
    { id: "deep_quarter_1", kind: "rectangle", center: [-13.5, 17], size: [9, 16], label: "Deep 1/4" },
    { id: "deep_quarter_2", kind: "rectangle", center: [ -4.5, 17], size: [9, 16], label: "Deep 1/4" },
    { id: "deep_quarter_3", kind: "rectangle", center: [  4.5, 17], size: [9, 16], label: "Deep 1/4" },
    { id: "deep_quarter_4", kind: "rectangle", center: [ 13.5, 17], size: [9, 16], label: "Deep 1/4" },
    { id: "hook_l",  kind: "rectangle", center: [-5, 5], size: [10, 8], label: "Hook L" },
    { id: "hook_m",  kind: "rectangle", center: [ 0, 5], size: [8,  8], label: "Hook M" },
    { id: "flat_r",  kind: "rectangle", center: [12, 4], size: [12, 8], label: "Flat R" },
  ],
};

const T11_44_STACK_COVER_3: DefensiveAlignment = {
  front: "4-4 Stack",
  coverage: "Cover 3",
  variant: "tackle_11",
  description:
    "Classic 8-in-the-box youth/HS run defense — 4 down linemen + 4 linebackers (Will, " +
    "Mike, Buck, Sam) + 3 DBs (2 corners, 1 deep safety in Cover 3). Two ILBs stack " +
    "directly behind the DTs; two OLBs play just outside the DEs. Heavy run support; " +
    "vulnerable to spread passing because there are only 3 DBs to cover 4-5 receivers.",
  players: [
    { id: "DE", x: -8,  y: 1, assignment: { kind: "blitz", gap: "edge" } },
    { id: "DT", x: -3,  y: 1, assignment: { kind: "blitz", gap: "A" } },
    { id: "DT", x:  3,  y: 1, assignment: { kind: "blitz", gap: "B" } },
    { id: "DE", x:  8,  y: 1, assignment: { kind: "blitz", gap: "edge" } },
    { id: "WL", x: -8,  y: 4, assignment: { kind: "zone", zoneId: "flat_l" } },
    { id: "ML", x: -3,  y: 4, assignment: { kind: "zone", zoneId: "hook_l" } },
    { id: "BK", x:  3,  y: 4, assignment: { kind: "zone", zoneId: "hook_r" } },
    { id: "SL", x:  8,  y: 4, assignment: { kind: "zone", zoneId: "flat_r" } },
    { id: "CB", x: -16, y: 6, assignment: { kind: "zone", zoneId: "deep_third_l" } },
    { id: "CB", x:  16, y: 6, assignment: { kind: "zone", zoneId: "deep_third_r" } },
    { id: "FS", x:  0,  y: 13, assignment: { kind: "zone", zoneId: "deep_third_m" } },
  ],
  zones: [
    { id: "deep_third_l", kind: "rectangle", center: [-10, 17], size: [10, 16], label: "Deep 1/3 L" },
    { id: "deep_third_m", kind: "rectangle", center: [  0, 17], size: [10, 16], label: "Deep 1/3 M" },
    { id: "deep_third_r", kind: "rectangle", center: [ 10, 17], size: [10, 16], label: "Deep 1/3 R" },
    { id: "flat_l", kind: "rectangle", center: [-11, 5], size: [8, 8], label: "Flat L" },
    { id: "hook_l", kind: "rectangle", center: [ -4, 5], size: [6, 8], label: "Hook L" },
    { id: "hook_r", kind: "rectangle", center: [  4, 5], size: [6, 8], label: "Hook R" },
    { id: "flat_r", kind: "rectangle", center: [ 11, 5], size: [8, 8], label: "Flat R" },
  ],
};

const T11_44_STACK_COVER_1: DefensiveAlignment = {
  front: "4-4 Stack",
  coverage: "Cover 1",
  variant: "tackle_11",
  description:
    "8-in-the-box 4-4 with man-free behind it — corners and the 4 LBs in man on the " +
    "5 eligible receivers (slot/TE/RB), single-high FS over the top. Aggressive run-" +
    "support look that asks the LBs to cover backs/TEs man-up.",
  manCoverage: true,
  players: [
    { id: "DE", x: -8,  y: 1, assignment: { kind: "blitz", gap: "edge" } },
    { id: "DT", x: -3,  y: 1, assignment: { kind: "blitz", gap: "A" } },
    { id: "DT", x:  3,  y: 1, assignment: { kind: "blitz", gap: "B" } },
    { id: "DE", x:  8,  y: 1, assignment: { kind: "blitz", gap: "edge" } },
    { id: "WL", x: -8,  y: 4, assignment: { kind: "man", target: "RB" } },
    { id: "ML", x: -3,  y: 4, assignment: { kind: "man", target: "TE" } },
    { id: "BK", x:  3,  y: 4, assignment: { kind: "man", target: "S" } },
    { id: "SL", x:  8,  y: 4, assignment: { kind: "man", target: "Y" } },
    { id: "CB", x: -16, y: 6, assignment: { kind: "man", target: "X" } },
    { id: "CB", x:  16, y: 6, assignment: { kind: "man", target: "Z" } },
    { id: "FS", x:  0,  y: 13, assignment: { kind: "zone", zoneId: "deep_middle" } },
  ],
  zones: [
    { id: "deep_middle", kind: "rectangle", center: [0, 17], size: [20, 16], label: "Deep middle (FS)" },
  ],
};

const T11_46_BEAR_COVER_1: DefensiveAlignment = {
  front: "46 Bear",
  coverage: "Cover 1",
  variant: "tackle_11",
  description:
    "Bear front — 4 down with both DTs in 3-techs, both DEs wide, strong safety walked " +
    "into the box. Cover 1 behind it — single-high FS, everyone else man. Crushes the run.",
  manCoverage: true,
  players: [
    { id: "DE", x: -10, y: 1,   assignment: { kind: "blitz", gap: "edge" } },
    { id: "DT", x: -3,  y: 1,   assignment: { kind: "blitz", gap: "A" } },
    { id: "DT", x:  3,  y: 1,   assignment: { kind: "blitz", gap: "B" } },
    { id: "DE", x: 10,  y: 1,   assignment: { kind: "blitz", gap: "edge" } },
    { id: "WL", x: -5,  y: 3,   assignment: { kind: "man", target: "RB" } },
    { id: "ML", x:  0,  y: 3,   assignment: { kind: "man", target: "TE" } },
    { id: "SS", x:  5,  y: 3,   assignment: { kind: "man", target: "Y" } },
    { id: "SL", x:  9,  y: 4,   assignment: { kind: "man", target: "S" } },
    { id: "CB", x: -16, y: 6,   assignment: { kind: "man", target: "X" } },
    { id: "CB", x: 16,  y: 6,   assignment: { kind: "man", target: "Z" } },
    { id: "FS", x:  0,  y: 13,  assignment: { kind: "zone", zoneId: "deep_middle" } },
  ],
  zones: [
    { id: "deep_middle", kind: "rectangle", center: [0, 17], size: [20, 16], label: "Deep middle (FS)" },
  ],
};

// ── Flag 7v7 ────────────────────────────────────────────────────────────────
//
// 7-on-7 flag has no rush (in most leagues) — defense is 7 DBs/LBs spread
// across the field. Common looks: Cover 3, Cover 2, man free.

const F7_COVER_3: DefensiveAlignment = {
  front: "7v7 Zone",
  coverage: "Cover 3",
  variant: "flag_7v7",
  description:
    "Standard 7v7 zone shell. 3 deep (corners + free safety), 4 underneath (two flat, two hook).",
  players: [
    { id: "FL", x: -10, y: 4,  assignment: { kind: "zone", zoneId: "flat_l" } },
    { id: "HL", x: -4,  y: 5,  assignment: { kind: "zone", zoneId: "hook_l" } },
    { id: "HR", x:  4,  y: 5,  assignment: { kind: "zone", zoneId: "hook_r" } },
    { id: "FR", x: 10,  y: 4,  assignment: { kind: "zone", zoneId: "flat_r" } },
    { id: "CB", x: -12, y: 11, assignment: { kind: "zone", zoneId: "deep_third_l" } },
    { id: "FS", x:  0,  y: 13, assignment: { kind: "zone", zoneId: "deep_third_m" } },
    { id: "CB", x: 12,  y: 11, assignment: { kind: "zone", zoneId: "deep_third_r" } },
  ],
  zones: [
    { id: "flat_l",       kind: "rectangle", center: [-11, 5], size: [8,  8], label: "Flat L" },
    { id: "hook_l",       kind: "rectangle", center: [-4,  5], size: [6,  8], label: "Hook L" },
    { id: "hook_r",       kind: "rectangle", center: [ 4,  5], size: [6,  8], label: "Hook R" },
    { id: "flat_r",       kind: "rectangle", center: [11,  5], size: [8,  8], label: "Flat R" },
    { id: "deep_third_l", kind: "rectangle", center: [-10, 17], size: [10, 16], label: "Deep 1/3 L" },
    { id: "deep_third_m", kind: "rectangle", center: [ 0,  17], size: [10, 16], label: "Deep 1/3 M" },
    { id: "deep_third_r", kind: "rectangle", center: [10,  17], size: [10, 16], label: "Deep 1/3 R" },
  ],
};

const F7_COVER_2: DefensiveAlignment = {
  front: "7v7 Zone",
  coverage: "Cover 2",
  variant: "flag_7v7",
  description:
    "7v7 Cover 2 — two safeties split the deep halves, five underneath in zones (two flats, three hooks).",
  players: [
    { id: "CB", x: -12, y: 5,  assignment: { kind: "zone", zoneId: "flat_l" } },
    { id: "HL", x: -5,  y: 5,  assignment: { kind: "zone", zoneId: "hook_l" } },
    { id: "HM", x:  0,  y: 5,  assignment: { kind: "zone", zoneId: "hook_m" } },
    { id: "HR", x:  5,  y: 5,  assignment: { kind: "zone", zoneId: "hook_r" } },
    { id: "CB", x: 12,  y: 5,  assignment: { kind: "zone", zoneId: "flat_r" } },
    { id: "FS", x: -7,  y: 12, assignment: { kind: "zone", zoneId: "deep_half_l" } },
    { id: "SS", x:  7,  y: 12, assignment: { kind: "zone", zoneId: "deep_half_r" } },
  ],
  zones: [
    { id: "flat_l", kind: "rectangle", center: [-12, 5], size: [6, 8], label: "Flat L" },
    { id: "hook_l", kind: "rectangle", center: [-5,  5], size: [6, 8], label: "Hook L" },
    { id: "hook_m", kind: "rectangle", center: [ 0,  5], size: [6, 8], label: "Hook M" },
    { id: "hook_r", kind: "rectangle", center: [ 5,  5], size: [6, 8], label: "Hook R" },
    { id: "flat_r", kind: "rectangle", center: [12,  5], size: [6, 8], label: "Flat R" },
    { id: "deep_half_l", kind: "rectangle", center: [-7.5, 17], size: [15, 16], label: "Deep 1/2 L" },
    { id: "deep_half_r", kind: "rectangle", center: [ 7.5, 17], size: [15, 16], label: "Deep 1/2 R" },
  ],
};

const F7_TAMPA_2: DefensiveAlignment = {
  front: "7v7 Zone",
  coverage: "Tampa 2",
  variant: "flag_7v7",
  description:
    "7v7 Tampa 2 — Cover 2 shell with the middle hook (M) carrying any vertical " +
    "down the deep middle. Effectively a 3-deep, 4-under look out of a 2-high disguise.",
  players: [
    { id: "CB", x: -12, y: 5,  assignment: { kind: "zone", zoneId: "flat_l" } },
    { id: "HL", x: -5,  y: 5,  assignment: { kind: "zone", zoneId: "hook_l" } },
    { id: "M",  x:  0,  y: 6,  assignment: { kind: "zone", zoneId: "deep_middle" } },
    { id: "HR", x:  5,  y: 5,  assignment: { kind: "zone", zoneId: "hook_r" } },
    { id: "CB", x: 12,  y: 5,  assignment: { kind: "zone", zoneId: "flat_r" } },
    { id: "FS", x: -7,  y: 12, assignment: { kind: "zone", zoneId: "deep_half_l" } },
    { id: "SS", x:  7,  y: 12, assignment: { kind: "zone", zoneId: "deep_half_r" } },
  ],
  zones: [
    { id: "flat_l", kind: "rectangle", center: [-12, 5], size: [6, 8], label: "Flat L" },
    { id: "hook_l", kind: "rectangle", center: [-5,  5], size: [6, 8], label: "Hook L" },
    { id: "hook_r", kind: "rectangle", center: [ 5,  5], size: [6, 8], label: "Hook R" },
    { id: "flat_r", kind: "rectangle", center: [12,  5], size: [6, 8], label: "Flat R" },
    { id: "deep_half_l", kind: "rectangle", center: [-9, 17], size: [12, 16], label: "Deep 1/2 L" },
    { id: "deep_middle", kind: "rectangle", center: [ 0, 17], size: [6,  16], label: "Deep mid (M)" },
    { id: "deep_half_r", kind: "rectangle", center: [ 9, 17], size: [12, 16], label: "Deep 1/2 R" },
  ],
};

const F7_COVER_4: DefensiveAlignment = {
  front: "7v7 Zone",
  coverage: "Cover 4",
  variant: "flag_7v7",
  description:
    "7v7 Quarters — four deep defenders each take a quarter of the field, three underneath. " +
    "Strong vs verticals; soft underneath.",
  players: [
    { id: "FL", x: -10, y: 5,  assignment: { kind: "zone", zoneId: "curl_flat_l" } },
    { id: "M",  x:   0, y: 5,  assignment: { kind: "zone", zoneId: "hook_m" } },
    { id: "FR", x:  10, y: 5,  assignment: { kind: "zone", zoneId: "curl_flat_r" } },
    { id: "CB", x: -13, y: 11, assignment: { kind: "zone", zoneId: "deep_quarter_1" } },
    { id: "FS", x:  -5, y: 13, assignment: { kind: "zone", zoneId: "deep_quarter_2" } },
    { id: "SS", x:   5, y: 13, assignment: { kind: "zone", zoneId: "deep_quarter_3" } },
    { id: "CB", x:  13, y: 11, assignment: { kind: "zone", zoneId: "deep_quarter_4" } },
  ],
  zones: [
    { id: "curl_flat_l", kind: "rectangle", center: [-10, 5], size: [10, 8], label: "Curl/Flat L" },
    { id: "hook_m",      kind: "rectangle", center: [  0, 5], size: [8,  8], label: "Hook M" },
    { id: "curl_flat_r", kind: "rectangle", center: [ 10, 5], size: [10, 8], label: "Curl/Flat R" },
    { id: "deep_quarter_1", kind: "rectangle", center: [-11, 17], size: [8, 16], label: "Deep 1/4" },
    { id: "deep_quarter_2", kind: "rectangle", center: [ -4, 17], size: [6, 16], label: "Deep 1/4" },
    { id: "deep_quarter_3", kind: "rectangle", center: [  4, 17], size: [6, 16], label: "Deep 1/4" },
    { id: "deep_quarter_4", kind: "rectangle", center: [ 11, 17], size: [8, 16], label: "Deep 1/4" },
  ],
};

const F7_COVER_1: DefensiveAlignment = {
  front: "7v7 Man",
  coverage: "Cover 1",
  variant: "flag_7v7",
  description:
    "7v7 man-free — six defenders in man on the six skill receivers, single-high FS over the top.",
  manCoverage: true,
  players: [
    { id: "CB", x: -12, y: 5,  assignment: { kind: "man", target: "X" } },
    { id: "NB", x: -6,  y: 5,  assignment: { kind: "man", target: "H" } },
    { id: "LB", x:  0,  y: 4,  assignment: { kind: "man", target: "B" } },
    { id: "NB", x:  6,  y: 5,  assignment: { kind: "man", target: "S" } },
    { id: "CB", x: 12,  y: 5,  assignment: { kind: "man", target: "Z" } },
    { id: "SS", x:  4,  y: 6,  assignment: { kind: "man", target: "Y" } },
    { id: "FS", x:  0,  y: 13, assignment: { kind: "zone", zoneId: "deep_middle" } },
  ],
  zones: [
    { id: "deep_middle", kind: "rectangle", center: [0, 17], size: [20, 16], label: "Deep middle (FS)" },
  ],
};

const F7_COVER_0: DefensiveAlignment = {
  front: "7v7 Man",
  coverage: "Cover 0",
  variant: "flag_7v7",
  description:
    "7v7 Cover 0 — every defender in pure man, no deep help. Rare, used to bait an aggressive throw " +
    "or on critical down/distance.",
  manCoverage: true,
  players: [
    { id: "CB", x: -12, y: 5, assignment: { kind: "man", target: "X" } },
    { id: "NB", x: -6,  y: 5, assignment: { kind: "man", target: "H" } },
    { id: "LB", x:  0,  y: 4, assignment: { kind: "man", target: "B" } },
    { id: "NB", x:  6,  y: 5, assignment: { kind: "man", target: "S" } },
    { id: "CB", x: 12,  y: 5, assignment: { kind: "man", target: "Z" } },
    { id: "SS", x:  6,  y: 6, assignment: { kind: "man", target: "Y" } },
    { id: "FS", x: -4,  y: 6, assignment: { kind: "spy", target: "Q" } },
  ],
};

// ── Flag 5v5 ────────────────────────────────────────────────────────────────

const F5_COVER_3: DefensiveAlignment = {
  front: "5v5 Zone",
  coverage: "Cover 3",
  variant: "flag_5v5",
  description:
    "5v5 zone shell — 3 deep (two corners + free safety) and 2 underneath (flat/hook on each side).",
  players: [
    { id: "FL", x: -7,  y: 4,  assignment: { kind: "zone", zoneId: "flat_l" } },
    { id: "FR", x:  7,  y: 4,  assignment: { kind: "zone", zoneId: "flat_r" } },
    { id: "CB", x: -10, y: 10, assignment: { kind: "zone", zoneId: "deep_third_l" } },
    { id: "FS", x:  0,  y: 12, assignment: { kind: "zone", zoneId: "deep_third_m" } },
    { id: "CB", x: 10,  y: 10, assignment: { kind: "zone", zoneId: "deep_third_r" } },
  ],
  zones: [
    { id: "flat_l", kind: "rectangle", center: [-8, 4], size: [10, 8], label: "Flat L" },
    { id: "flat_r", kind: "rectangle", center: [ 8, 4], size: [10, 8], label: "Flat R" },
    { id: "deep_third_l", kind: "rectangle", center: [-9, 17], size: [9, 16], label: "Deep 1/3 L" },
    { id: "deep_third_m", kind: "rectangle", center: [ 0, 17], size: [9, 16], label: "Deep 1/3 M" },
    { id: "deep_third_r", kind: "rectangle", center: [ 9, 17], size: [9, 16], label: "Deep 1/3 R" },
  ],
};

const F5_COVER_1: DefensiveAlignment = {
  front: "5v5 Man",
  coverage: "Cover 1",
  variant: "flag_5v5",
  description:
    "5v5 man — four defenders in man on the four skill players, one free safety deep.",
  manCoverage: true,
  players: [
    { id: "CB", x: -8,  y: 5,  assignment: { kind: "man", target: "X" } },
    { id: "NB", x: -3,  y: 5,  assignment: { kind: "man", target: "H" } },
    { id: "NB", x:  3,  y: 5,  assignment: { kind: "man", target: "S" } },
    { id: "CB", x:  8,  y: 5,  assignment: { kind: "man", target: "Z" } },
    { id: "FS", x:  0,  y: 12, assignment: { kind: "zone", zoneId: "deep_middle" } },
  ],
  zones: [
    { id: "deep_middle", kind: "rectangle", center: [0, 17], size: [20, 16], label: "Deep middle (FS)" },
  ],
};

export const DEFENSIVE_ALIGNMENTS: DefensiveAlignment[] = [
  T11_43_OVER_COVER_3,
  T11_43_OVER_COVER_2,
  T11_34_COVER_1,
  T11_NICKEL_425_COVER_4,
  T11_46_BEAR_COVER_1,
  T11_44_STACK_COVER_3,
  T11_44_STACK_COVER_1,
  F7_COVER_3,
  F7_COVER_2,
  F7_TAMPA_2,
  F7_COVER_4,
  F7_COVER_1,
  F7_COVER_0,
  F5_COVER_3,
  F5_COVER_1,
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function findDefensiveAlignment(
  variant: string,
  front: string,
  coverage: string,
): DefensiveAlignment | null {
  const v = norm(variant);
  const f = norm(front);
  const c = norm(coverage);
  return (
    DEFENSIVE_ALIGNMENTS.find(
      (a) => norm(a.variant) === v && norm(a.front) === f && norm(a.coverage) === c,
    ) ?? null
  );
}

export function listDefensiveAlignments(variant: string): DefensiveAlignment[] {
  const v = norm(variant);
  return DEFENSIVE_ALIGNMENTS.filter((a) => norm(a.variant) === v);
}

/**
 * Mirror an alignment to the requested strength side. The catalog is authored
 * as if strength = "right"; for "left" we negate x on every player.
 *
 * Note: per-defender `assignment` is preserved verbatim. Zone IDs are
 * stable across mirror (the zone's own coords are mirrored separately by
 * `zonesForStrength`).
 */
export function alignmentForStrength(
  alignment: DefensiveAlignment,
  strength: "left" | "right",
): DefensiveAlignmentPlayer[] {
  if (strength === "right") return alignment.players;
  return alignment.players.map((p) => ({ ...p, x: -p.x }));
}

/**
 * Resolve the per-defender assignment for a player in an alignment, falling
 * back to a sensible default for legacy entries that don't yet set
 * `assignment` on every player.
 *
 * Fallback policy:
 *   - If the alignment is `manCoverage: true` and there are no zones, the
 *     defender is in man on a generic target.
 *   - If the alignment has zones but no man, the defender drops into the
 *     zone whose center is closest to its position (best-effort).
 *   - Otherwise the defender is in man (the safest "do nothing structural"
 *     fallback, since most legacy entries without zones are man looks).
 *
 * Validators (Phase D4) reject any catalog entry where this fallback is
 * required — but at runtime, consumers can read assignments without
 * guarding against undefined.
 */
export function getDefenderAssignmentDefault(
  player: DefensiveAlignmentPlayer,
  alignment: DefensiveAlignment,
): DefenderAssignmentSpec {
  if (player.assignment) return player.assignment;
  const zones = alignment.zones ?? [];
  if (alignment.manCoverage || zones.length === 0) {
    return { kind: "man" };
  }
  // Pick the zone with the closest center to the player.
  let best = zones[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const z of zones) {
    const dx = z.center[0] - player.x;
    const dy = z.center[1] - player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best.id ? { kind: "zone", zoneId: best.id } : { kind: "man" };
}

/**
 * Returns the alignment's defenders with each one's resolved assignment
 * attached. Convenience for renderers/notes that don't want to call
 * `getDefenderAssignmentDefault` per player.
 */
export function alignmentWithAssignments(
  alignment: DefensiveAlignment,
  strength: "left" | "right" = "right",
): Array<DefensiveAlignmentPlayer & { assignment: DefenderAssignmentSpec }> {
  const players = alignmentForStrength(alignment, strength);
  return players.map((p) => ({
    ...p,
    assignment: getDefenderAssignmentDefault(p, alignment),
  }));
}

/**
 * Look up a zone by id within an alignment. Optionally mirrors for strength.
 */
export function findZoneById(
  alignment: DefensiveAlignment,
  zoneId: string,
  strength: "left" | "right" = "right",
): DefensiveAlignmentZone | null {
  const zones = zonesForStrength(alignment, strength);
  return zones.find((z) => z.id === zoneId) ?? null;
}

export function zonesForStrength(
  alignment: DefensiveAlignment,
  strength: "left" | "right",
): DefensiveAlignmentZone[] {
  const zones = alignment.zones ?? [];
  if (strength === "right") return zones;
  return zones.map((z) => ({
    ...z,
    center: [-z.center[0], z.center[1]],
  }));
}
