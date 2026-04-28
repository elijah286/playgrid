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
export type DefensiveAlignmentPlayer = {
  /** Short label (≤2 chars) shown inside the triangle. */
  id: string;
  x: number;
  y: number;
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
    { id: "DE", x: -8,  y: 1 },   // weak-side DE (5-tech)
    { id: "DT", x: -2,  y: 1 },   // 1-tech NT to weak-side A-gap
    { id: "DT", x:  3,  y: 1 },   // 3-tech to strong-side B-gap
    { id: "DE", x:  8,  y: 1 },   // strong-side DE (5-tech)
    // Linebackers — y≈4-5
    { id: "WL", x: -5,  y: 4.5 }, // Will (weak inside)
    { id: "ML", x:  0,  y: 4.5 }, // Mike
    { id: "SL", x:  6,  y: 4.5 }, // Sam (strong, walked toward TE)
    // Secondary
    { id: "CB", x: -16, y: 6 },   // weak-side corner
    { id: "CB", x:  16, y: 6 },   // strong-side corner
    { id: "FS", x:  0,  y: 13 },  // single-high free safety
    { id: "SS", x:  6,  y: 9 },   // strong safety, half-rolled to robber depth
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
    { id: "DE", x: -8,  y: 1 },
    { id: "DT", x: -2,  y: 1 },
    { id: "DT", x:  3,  y: 1 },
    { id: "DE", x:  8,  y: 1 },
    { id: "WL", x: -5,  y: 4.5 },
    { id: "ML", x:  0,  y: 4.5 },
    { id: "SL", x:  6,  y: 4.5 },
    { id: "CB", x: -16, y: 5 },   // squat corners in Cover 2
    { id: "CB", x:  16, y: 5 },
    { id: "FS", x: -8,  y: 13 },  // two-high — split halves
    { id: "SS", x:  8,  y: 13 },
  ],
};

const T11_34_COVER_1: DefensiveAlignment = {
  front: "3-4",
  coverage: "Cover 1",
  variant: "tackle_11",
  description:
    "Three down linemen (NT head-up, two DEs over the tackles), four LBs (two ILBs " +
    "and two OLBs as edge rushers/setters). Cover 1 — single-high FS, everyone else man.",
  players: [
    { id: "DE", x: -5,  y: 1 },
    { id: "NT", x:  0,  y: 1 },
    { id: "DE", x:  5,  y: 1 },
    { id: "OL", x: -10, y: 2.5 }, // weak-side OLB on edge
    { id: "IL", x: -3,  y: 4.5 }, // weak inside LB
    { id: "IL", x:  3,  y: 4.5 }, // strong inside LB
    { id: "OL", x: 10,  y: 2.5 }, // strong-side OLB on edge
    { id: "CB", x: -16, y: 6 },
    { id: "CB", x:  16, y: 6 },
    { id: "SS", x:  6,  y: 6 },   // strong safety in man on TE/slot
    { id: "FS", x:  0,  y: 13 },  // single-high
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
    { id: "DE", x: -8,  y: 1 },
    { id: "DT", x: -2,  y: 1 },
    { id: "DT", x:  3,  y: 1 },
    { id: "DE", x:  8,  y: 1 },
    { id: "ML", x: -3,  y: 4.5 }, // Mike
    { id: "WL", x:  4,  y: 4.5 }, // Will
    { id: "NB", x:  9,  y: 5 },   // nickel/STAR over strong-side slot
    { id: "CB", x: -16, y: 6 },
    { id: "CB", x:  16, y: 6 },
    { id: "FS", x: -7,  y: 11 },  // quarters — split deep
    { id: "SS", x:  7,  y: 11 },
  ],
};

const T11_46_BEAR_COVER_1: DefensiveAlignment = {
  front: "46 Bear",
  coverage: "Cover 1",
  variant: "tackle_11",
  description:
    "Bear front — 4 down with both DTs in 3-techs, both DEs wide, strong safety walked " +
    "into the box. Cover 1 behind it — single-high FS, everyone else man. Crushes the run.",
  players: [
    { id: "DE", x: -10, y: 1 },
    { id: "DT", x: -3,  y: 1 },
    { id: "DT", x:  3,  y: 1 },
    { id: "DE", x: 10,  y: 1 },
    { id: "WL", x: -5,  y: 3 },   // stacked tight to D-line
    { id: "ML", x:  0,  y: 3 },
    { id: "SS", x:  5,  y: 3 },   // strong safety walked down — that's the 8th in the box
    { id: "SL", x:  9,  y: 4 },
    { id: "CB", x: -16, y: 6 },
    { id: "CB", x: 16,  y: 6 },
    { id: "FS", x:  0,  y: 13 },
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
    // Underneath — y≈4-6
    { id: "FL", x: -10, y: 4 },   // weak flat defender
    { id: "HL", x: -4,  y: 5 },   // weak hook
    { id: "HR", x:  4,  y: 5 },   // strong hook
    { id: "FR", x: 10,  y: 4 },   // strong flat defender
    // Deep thirds — y≈10-13
    { id: "CB", x: -12, y: 11 },
    { id: "FS", x:  0,  y: 13 },
    { id: "CB", x: 12,  y: 11 },
  ],
};

const F7_COVER_2: DefensiveAlignment = {
  front: "7v7 Zone",
  coverage: "Cover 2",
  variant: "flag_7v7",
  description:
    "7v7 Cover 2 — two safeties split the deep halves, five underneath in zones (two flats, three hooks).",
  players: [
    { id: "CB", x: -12, y: 5 },   // squat corners
    { id: "HL", x: -5,  y: 5 },
    { id: "HM", x:  0,  y: 5 },
    { id: "HR", x:  5,  y: 5 },
    { id: "CB", x: 12,  y: 5 },
    { id: "FS", x: -7,  y: 12 },  // split-half safeties
    { id: "SS", x:  7,  y: 12 },
  ],
};

const F7_COVER_1: DefensiveAlignment = {
  front: "7v7 Man",
  coverage: "Cover 1",
  variant: "flag_7v7",
  description:
    "7v7 man-free — six defenders in man on the six skill receivers, single-high FS over the top.",
  players: [
    { id: "CB", x: -12, y: 5 },
    { id: "NB", x: -6,  y: 5 },
    { id: "LB", x:  0,  y: 4 },   // matched on RB / inside
    { id: "NB", x:  6,  y: 5 },
    { id: "CB", x: 12,  y: 5 },
    { id: "SS", x:  4,  y: 6 },   // matched on TE/slot
    { id: "FS", x:  0,  y: 13 },  // single-high
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
    { id: "FL", x: -7,  y: 4 },
    { id: "FR", x:  7,  y: 4 },
    { id: "CB", x: -10, y: 10 },
    { id: "FS", x:  0,  y: 12 },
    { id: "CB", x: 10,  y: 10 },
  ],
};

const F5_COVER_1: DefensiveAlignment = {
  front: "5v5 Man",
  coverage: "Cover 1",
  variant: "flag_5v5",
  description:
    "5v5 man — four defenders in man on the four skill players, one free safety deep.",
  players: [
    { id: "CB", x: -8,  y: 5 },
    { id: "NB", x: -3,  y: 5 },
    { id: "NB", x:  3,  y: 5 },
    { id: "CB", x:  8,  y: 5 },
    { id: "FS", x:  0,  y: 12 },
  ],
};

export const DEFENSIVE_ALIGNMENTS: DefensiveAlignment[] = [
  T11_43_OVER_COVER_3,
  T11_43_OVER_COVER_2,
  T11_34_COVER_1,
  T11_NICKEL_425_COVER_4,
  T11_46_BEAR_COVER_1,
  F7_COVER_3,
  F7_COVER_2,
  F7_COVER_1,
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
 */
export function alignmentForStrength(
  alignment: DefensiveAlignment,
  strength: "left" | "right",
): DefensiveAlignmentPlayer[] {
  if (strength === "right") return alignment.players;
  return alignment.players.map((p) => ({ ...p, x: -p.x }));
}
