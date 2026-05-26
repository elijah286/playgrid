/**
 * Formation definitions — migrated from src/domain/play/offensiveSynthesize.ts.
 *
 * The legacy system doesn't store formations as DATA — it stores them as
 * parsing rules. `parseFormationName` walks a regex list and returns a
 * FormationSpec; `synthesizeForVariant` then computes positions from
 * the spec + variant. This migration extracts those parsing rules into
 * declarative FormationDef entries (one per named formation), preserving
 * the parametric character (variant-portability) where it applies and
 * using the customShape escape hatch for non-parametric layouts.
 *
 * Phase 1b sub-deliverable (formations). Phase 1c's generator will
 * produce the legacy parser from these defs.
 *
 * Migration choices:
 *   - One entry per CANONICAL formation name. Variant strings (e.g.,
 *     "Trips Right" vs "Trips Left") are NOT separate entries — strength
 *     is a render-time parameter, not a formation property.
 *   - Aliases follow the legacy `parseFormationName` regex patterns.
 *   - Pro I / I-formation has variant-dependent meaning: tackle_11 →
 *     parametric Pro-I (qb under center, FB+HB stacked); flag variants →
 *     custom-shape stack-I (receivers stacked behind shotgun QB). The
 *     migration creates ONE entry that uses spec for tackle_11 and
 *     customShape for flag variants via the renderer's branch logic.
 *     (The flag stack-I is `i-formation-flag` and uses customShape;
 *     the tackle Pro-I is `pro-i` and uses spec.)
 */

import type { FormationDef } from "../schemas/FormationDef";

const ALL_VARIANTS = ["flag_5v5", "flag_6v6", "flag_7v7", "tackle_11"] as const;
const FLAG_VARIANTS = ["flag_5v5", "flag_6v6", "flag_7v7"] as const;
/** Variants that have ≥4 eligible receivers, i.e. enough roster room for
 *  3-strong formations + a backside iso (Bunch, Stack, Trips). flag_5v5
 *  has only 3 receivers and cannot fit these shapes canonically. */
const FOUR_RCVR_VARIANTS = ["flag_6v6", "flag_7v7", "tackle_11"] as const;
/** Variants that have ≥5 eligible receivers — needed for Empty (5-wide)
 *  and Doubles (2x2 + back). flag_5v5 and flag_6v6 are too small. */
const FIVE_RCVR_VARIANTS = ["flag_7v7", "tackle_11"] as const;

export const FORMATIONS: FormationDef[] = [
  // ── Spread family ─────────────────────────────────────────────────
  {
    id: "spread",
    name: "Spread",
    family: "formation",
    variants: [...ALL_VARIANTS],
    description: "Umbrella term for shotgun-based 4-5 receiver looks. Defaults to Doubles when unspecified.",
    body: "Umbrella term — NOT a single fixed look. Modern Spread = QB in shotgun, 0-1 backs in the backfield, 3-5 receivers spread across the field. Common variants: Spread Doubles (2x2, 1 back), Spread Trips (3x1, 1 back), Spread Empty (5 wide, 0 backs). The point is to force the defense to declare and to spread defenders thin, then attack with quick-game, RPOs, or one-on-one matchups. When a coach says 'spread' and doesn't specify, default to Doubles (2x2) for younger teams (simplest reads) or Trips (3x1) for older teams.",
    complexity: "basic",
    spec: {
      qb: "shotgun",
      backs: "single",
      receivers: { left: 2, right: 2, te: 0 },
    },
    strength: "right",
    tags: ["spread", "balanced"],
  },
  {
    id: "doubles",
    name: "Doubles",
    family: "formation",
    // Needs 4 WRs + 1 back (5 skill). 5v5 has 3 receivers and 6v6 has 4
    // (which forces the back-or-balance trade-off). True 2x2 + back is a
    // 7v7 / tackle_11 set.
    variants: [...FIVE_RCVR_VARIANTS],
    description: "Balanced 2x2 spread — two receivers each side, QB shotgun, 1 back.",
    body: "Spread variant: QB in shotgun (~5 yds back), 1 RB beside the QB, 2 receivers on each side of the formation. Balanced look — defense can't cheat coverage strength. Pairs with Mesh, Y-Cross, four verticals, RPO bubbles. Foundation Spread set for most college and modern HS offenses.",
    aliases: ["2x2", "Spread Doubles"],
    complexity: "basic",
    spec: {
      qb: "shotgun",
      backs: "single",
      receivers: { left: 2, right: 2, te: 0 },
    },
    strength: "right",
    tags: ["spread", "balanced", "no-trips"],
  },
  {
    id: "trips",
    name: "Trips",
    family: "formation",
    // Needs 3 strong-side + 1 backside iso = 4 receivers. flag_5v5 only
    // has 3, so "Trips in 5v5" degenerates to "all receivers one side"
    // which isn't Trips. Restrict to 6v6+.
    variants: [...FOUR_RCVR_VARIANTS],
    description: "3x1 spread — 3 receivers one side, 1 receiver isolated backside.",
    body: "QB in shotgun, 3 skill players stacked to one side and 1 isolated to the other. Stretches the defense horizontally and forces a coverage rotation. Pairs with bubble screens, flood concepts, and isolation routes for the backside X. Common in 7v7 because the wider field rewards horizontal stress.",
    complexity: "basic",
    spec: {
      qb: "shotgun",
      backs: "single",
      receivers: { left: 1, right: 3, te: 0 },
    },
    strength: "right",
    tags: ["spread", "trips", "overload"],
  },
  {
    id: "twins",
    name: "Twins",
    family: "formation",
    // Twins = 2 strong-side (outside+slot) + TE + 1 backside iso. Needs ≥4
    // receivers + a TE. 5v5 has neither the receiver count nor a TE role,
    // and 6v6 doesn't have a true TE either. Tackle and 7v7 carry it.
    variants: [...FIVE_RCVR_VARIANTS],
    description: "2 receivers one side (outside + slot), 1 receiver isolated + TE on the other side.",
    body: "Twins gives you 2 receivers on the strong side (outside + slot) plus a TE on the strong side, with 1 isolated WR backside. QB in shotgun. The twins side runs combination routes (pivot-flat, slant-flat, drive concepts) while the isolated WR runs an iso or backside dig. Use as a precision-passing base — less explosive than Trips, more precise reads.",
    complexity: "intermediate",
    spec: {
      qb: "shotgun",
      backs: "single",
      receivers: { left: 1, right: 2, te: 1 },
    },
    strength: "right",
    tags: ["spread", "twins"],
  },
  {
    id: "empty",
    name: "Empty",
    family: "formation",
    // Empty = 5-wide, no back. Requires 5 receivers. flag_5v5 (3 rcvr) and
    // flag_6v6 (4 rcvr) don't carry the roster — restrict to 7v7 + tackle.
    variants: [...FIVE_RCVR_VARIANTS],
    description: "All skill players on the line — no back. 5-wide spread.",
    body: "All skill receivers on the line of scrimmage, no one in the backfield other than the QB. Maximum horizontal stretch — defense MUST commit a defender to every receiver, leaving the middle vacated. Pairs with quick game (slants, hitches), mesh, and any concept that wants 1-on-1 outside. Risk: zero protection from a back means a 4-man rush gets home fast.",
    aliases: ["5-wide", "Five Wide", "00 Personnel"],
    complexity: "intermediate",
    spec: {
      qb: "shotgun",
      backs: "none",
      receivers: { left: 2, right: 3, te: 0 },
    },
    strength: "right",
    tags: ["spread", "no-back", "5-wide"],
  },

  // ── Bunch / Stack ─────────────────────────────────────────────────
  {
    id: "bunch",
    name: "Bunch",
    family: "formation",
    // Bunch = 3-receiver cluster + backside iso (4 receivers) + 1 back.
    // Needs ≥4 receivers total. flag_6v6 has 4 skill positions which become
    // 1 back + 3 receivers — no room for the backside iso, so what comes
    // out is structurally a Trips Bunch, not a Bunch. Restrict to 7v7+.
    variants: [...FIVE_RCVR_VARIANTS],
    description: "Three receivers clustered tight to one side — rubs/picks vs man, floods vs zone.",
    body: "Three receivers clustered tightly together to one side of the formation (within ~3 yds of each other), 1 isolated WR backside, 1 RB. QB usually in shotgun. Creates natural rubs / pick action vs man coverage; floods a quarter of the field vs zone. Common variant: bunch + slot to the same side for a 4-strong look. Pairs with mesh, smash, and snag concepts.",
    complexity: "intermediate",
    customShape: "bunch",
    strength: "right",
    tags: ["spread", "trips", "bunch", "compressed"],
  },
  {
    id: "stack",
    name: "Stack",
    family: "formation",
    // Stack = 2-receiver vertical column on the strong side + backside iso
    // + 1 back. flag_6v6 (3 receivers post-back) can fit the stack pair +
    // backside iso, so this is supported there. Restrict 5v5 only.
    variants: [...FOUR_RCVR_VARIANTS],
    description: "Receivers stacked vertically (one behind the other) to disguise route distribution.",
    body: "Two receivers aligned vertically (one directly behind the other) at one outside spot, with the third receiver wide on the opposite side. The stack disguises route distribution because defenders can't identify which receiver is going where pre-snap. Common designs: front receiver runs a quick out / hitch (occupies the corner) while the back receiver runs a vertical / dig / wheel (gets free release). Pairs with quick-game pick concepts and shotgun screens. Best vs man — vs zone, the stack just gives the corner an easy read.",
    complexity: "intermediate",
    customShape: "stack",
    strength: "right",
    tags: ["spread", "stack", "disguise"],
  },

  // ── Backfield-based (Pro I, T, Wishbone, etc.) ───────────────────
  {
    id: "pro-i",
    name: "Pro I",
    family: "formation",
    variants: ["tackle_11"],
    description: "I-formation with 2 WRs split, 1 TE on the line, FB stacked behind QB, HB behind FB.",
    body: "I-formation variant with 2 WRs split (one each side), 1 TE on the line of scrimmage, FB at ~4 yds, HB at ~7 yds directly behind FB. QB under center. Power-running base with downhill lead blocks; play-action threat off run action. Distinguished from Singleback by having BOTH backs in the backfield.",
    aliases: ["I-Form", "I-Formation"],
    complexity: "intermediate",
    spec: {
      qb: "under_center",
      backs: "i_stack",
      receivers: { left: 1, right: 1, te: 1 },
    },
    strength: "right",
    tags: ["i-form", "run-heavy", "2-back"],
  },
  {
    id: "pro-set",
    name: "Pro Set",
    family: "formation",
    variants: ["tackle_11"],
    description: "Split-back set — 2 backs side-by-side behind QB under center.",
    body: "Two backs split — one on each side of the QB at ~5 yds depth. QB under center. 2 WRs split + TE on the line. Classic 2-back passing set; equal threat to run either direction; play-action friendly.",
    aliases: ["Split Backs", "Split-back"],
    complexity: "intermediate",
    spec: {
      qb: "under_center",
      backs: "split",
      receivers: { left: 1, right: 1, te: 1 },
    },
    strength: "right",
    tags: ["pro-set", "2-back"],
  },
  {
    id: "wishbone",
    name: "Wishbone",
    family: "formation",
    variants: ["tackle_11"],
    description: "Three backs in a Y behind QB under center — triple-option base.",
    body: "Three backs in the backfield: FB at ~4 yds directly behind QB, two HBs split slightly outside FB at ~6 yds (forming a Y / bone). QB under center. 2 TEs typical. Triple-option base — option pitch back, option dive back, QB keeps. Heavy run formation; almost no passing threat. Rare at modern HS but common in service-academy and traditional youth offenses.",
    aliases: ["Bone"],
    complexity: "advanced",
    spec: {
      qb: "under_center",
      backs: "wishbone",
      receivers: { left: 1, right: 1, te: 1 },
    },
    strength: "right",
    tags: ["wishbone", "option", "run-heavy", "3-back"],
  },
  {
    id: "t-formation",
    name: "T-Formation",
    family: "formation",
    variants: ["tackle_11"],
    description: "Three backs in a flat row behind QB under center — Full House.",
    body: "Three backs side-by-side on one row behind the QB (FB centered, two HBs flanking) at ~4 yds. QB under center. 2 TEs / 0-1 WRs. Old-school power formation; foundational to American football before the I-form took over. Modern usage: short-yardage and goal-line packages. Distinguished from Wishbone by having all three backs at the SAME depth (a flat row vs. a Y-shape).",
    aliases: ["Full House", "T-form"],
    complexity: "advanced",
    spec: {
      qb: "under_center",
      backs: "t_row",
      receivers: { left: 1, right: 1, te: 1 },
    },
    strength: "right",
    tags: ["t-formation", "run-heavy", "3-back", "short-yardage"],
  },
  {
    id: "pistol",
    name: "Pistol",
    family: "formation",
    variants: ["tackle_11"],
    description: "QB ~4 yds back with 1 RB directly behind — hybrid of shotgun + I.",
    body: "QB lined up at ~4 yds (between under-center and shotgun depth) with one back directly behind at ~7 yds. Combines shotgun's passing visibility with the I-formation's downhill run threat. Lots of misdirection options because the RB's path isn't telegraphed by alignment.",
    complexity: "intermediate",
    spec: {
      qb: "pistol",
      backs: "single",
      receivers: { left: 2, right: 1, te: 1 },
    },
    strength: "right",
    tags: ["pistol", "hybrid", "misdirection"],
  },
  {
    id: "singleback",
    name: "Singleback",
    family: "formation",
    variants: [...ALL_VARIANTS],
    description: "QB under center with one back behind — Ace personnel.",
    body: "QB under center or in shotgun with one back behind at ~5 yds. The other skill players spread out. Use to threaten swing screens, draws, and play-action off the back's motion. Flexible — fits multiple personnel groupings.",
    aliases: ["Ace"],
    complexity: "basic",
    spec: {
      qb: "under_center",
      backs: "single",
      receivers: { left: 1, right: 2, te: 1 },
    },
    strength: "right",
    tags: ["singleback", "ace", "1-back"],
  },

  // ── Custom shapes (Diamond family) ────────────────────────────────
  {
    id: "diamond",
    name: "Diamond",
    family: "formation",
    variants: [...FLAG_VARIANTS],
    description: "4-point geometric diamond — C short, X/Z wide at intermediate depth, Y deep middle.",
    body: "Four-point shape that stretches the defense vertically AND horizontally. C at the top (short middle on LOS), X and Z at the lateral points (off the LOS at intermediate depth), Y at the bottom (deep middle behind QB). The four points form a true diamond when viewed on the field. X and Z being OFF the LOS is what makes this a diamond rather than a T — they're at the lateral midpoint between C (LOS) and Y (deep). Pairs with crossing concepts (mesh, drive), four-verticals when the deep point releases vertically, and Y-screens off motion.",
    complexity: "intermediate",
    customShape: "diamond",
    strength: "right",
    tags: ["diamond", "4-point", "stretch"],
  },
  {
    id: "tight-diamond",
    name: "Tight Diamond",
    family: "formation",
    variants: [...FLAG_VARIANTS],
    description: "Diamond compressed inward — X/Z pulled to ~3 yards for pick/rub vs man press.",
    body: "Diamond compressed: X and Z reduce their splits to ~3 yds from C (instead of the wide ~5 yds), while Y stays aligned at ~7 yds deep middle. The tight splits make pick / rub plays automatic against man press: X and C can cross paths inside 5 yds for a natural rub, and Y can release between the inside defenders. Use vs. teams that play hard man press and don't switch.",
    complexity: "advanced",
    customShape: "tight_diamond",
    strength: "right",
    tags: ["diamond", "compressed", "pick", "rub", "vs-man"],
  },
  {
    id: "i-formation-flag",
    name: "I-Formation (flag)",
    family: "formation",
    variants: [...FLAG_VARIANTS],
    description: "Flag-context I — receivers stacked in a column behind QB shotgun, others split wide.",
    body: "Flag-context I — QB in shotgun, 1-2 receivers stacked in a column directly behind QB at ~7 and ~10 yds, the remaining receivers split wide. Distinct from the tackle Pro-I (which uses a FB + HB under center). The stack receiver can release on a swing, screen, or vertical seam; the wide receivers stretch the defense to keep the box clear. Use for misdirection — motion the stack receiver, run a wide-side handoff, or send the stack on a wheel route after a hard play-fake.",
    aliases: ["Stack-I", "Flag I-Form"],
    complexity: "intermediate",
    customShape: "stack_i",
    strength: "right",
    tags: ["i-form", "stack", "misdirection", "flag-only"],
  },

  // ── Trips Bunch (compressed Trips) ────────────────────────────────
  {
    id: "trips-bunch",
    name: "Trips Bunch",
    family: "formation",
    // 3-receiver compressed cluster with no backside iso. Needs ≥3 strong-side
    // receivers; flag_5v5 (3 total receivers, all to one side) degenerates
    // into "everyone to one side" which isn't a distinct Trips Bunch from
    // canonical Trips. Restrict to 6v6+.
    variants: [...FOUR_RCVR_VARIANTS],
    description: "Trips with the 3 receivers compressed tight — combines Trips overload with Bunch rubs.",
    body: "Trips formation (3 to one side) with the 3 receivers compressed tight together (~2-3 yds apart). Combines the overload of Trips with the rub effect of Bunch — defense has to cover 3 receivers in a tight cluster, which is structurally hard against man. Pairs with snag (3-level stretch), mesh (crossing routes from the bunch), and the H-pop screen. The most aggressive man-beater for variants with the roster to support it.",
    complexity: "advanced",
    customShape: "trips_bunch",
    strength: "right",
    tags: ["trips", "bunch", "compressed", "vs-man"],
  },
];
