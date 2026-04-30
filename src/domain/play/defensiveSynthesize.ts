/**
 * Synthesize a defensive alignment from a front name + coverage when the
 * canonical catalog (defensiveAlignments.ts) doesn't have an exact match.
 *
 * The catalog encodes the schemes most coaches actually run; this module
 * is the safety net for everything else (6-2, 5-3, 5-2 Eagle, 8-3 goal
 * line, etc.) so Coach Cal can still produce a structurally-correct
 * diagram with the right player count, depths, and zones — without
 * freelancing.
 *
 * Strategy: parse the front into an `<dl>-<lb>` pair, place the D-line
 * evenly across the LOS, place the LBs evenly across LB depth, then fill
 * the secondary based on the coverage shell (Cover 1/2/3/4 each have a
 * canonical deep + underneath structure). Total count is enforced to
 * match the variant.
 */

import type { Point2 } from "./types";

export type SynthAlignmentPlayer = {
  id: string;
  x: number;
  y: number;
};

export type SynthAlignmentZone = {
  kind: "rectangle" | "ellipse";
  center: Point2;
  size: Point2;
  label: string;
};

export type SynthAlignment = {
  front: string;
  coverage: string;
  variant: "tackle_11" | "flag_7v7" | "flag_5v5";
  description: string;
  players: SynthAlignmentPlayer[];
  zones: SynthAlignmentZone[];
  manCoverage: boolean;
};

/* ------------------------------------------------------------------ */
/*  Parsers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Parse an `N-M` front name (with optional adjective like "Stack",
 * "Over", "Eagle", "Bear"). Returns dl + lb counts when matched.
 *
 * Examples: "6-2", "5-3 Stack", "5-2 Eagle", "4-4 Over", "8-3 goal line".
 */
export function parseFront(raw: string): { dl: number; lb: number; modifier: string | null } | null {
  const m = /(\d+)\s*[-–]\s*(\d+)/.exec(raw);
  if (!m) return null;
  const dl = parseInt(m[1], 10);
  const lb = parseInt(m[2], 10);
  if (!Number.isFinite(dl) || !Number.isFinite(lb)) return null;
  if (dl < 1 || dl > 9 || lb < 0 || lb > 8) return null;
  // Modifier = whatever's left after the digits.
  const modifier = raw.replace(m[0], "").trim() || null;
  return { dl, lb, modifier };
}

/**
 * Parse a coverage name into a canonical shell. Loosely matches "Cover N"
 * variants and a few common synonyms.
 */
export type CoverageShell =
  | { kind: "cover_0" }     // 0 deep, all DBs man
  | { kind: "cover_1" }     // 1 deep FS, rest man
  | { kind: "cover_2" }     // 2 deep halves, 5 underneath
  | { kind: "cover_3" }     // 3 deep thirds, 4 underneath
  | { kind: "cover_4" }     // 4 deep quarters, 3 underneath
  | { kind: "tampa_2" }     // Cover 2 with MLB carrying middle deep
  | { kind: "unknown" };

export function parseCoverage(raw: string): CoverageShell {
  const s = raw.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (/(^|\s)(cover\s*0|man.?free.?0|all.?out.?man)(\s|$)/.test(s)) return { kind: "cover_0" };
  if (/(^|\s)(cover\s*1|man.?free|robber)(\s|$)/.test(s)) return { kind: "cover_1" };
  if (/tampa.?2/.test(s)) return { kind: "tampa_2" };
  if (/(^|\s)(cover\s*2|2.?high)(\s|$)/.test(s)) return { kind: "cover_2" };
  if (/(^|\s)(cover\s*3|3.?deep|sky|cloud)(\s|$)/.test(s)) return { kind: "cover_3" };
  if (/(^|\s)(cover\s*4|quarters|2.?man.?under)(\s|$)/.test(s)) return { kind: "cover_4" };
  return { kind: "unknown" };
}

/* ------------------------------------------------------------------ */
/*  Player placement helpers                                           */
/* ------------------------------------------------------------------ */

/**
 * Evenly distribute N players across an x-range. Returns the x-positions.
 * For odd N, the middle player sits at center.
 */
function spreadEvenly(n: number, xLeft: number, xRight: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [(xLeft + xRight) / 2];
  const step = (xRight - xLeft) / (n - 1);
  return Array.from({ length: n }, (_, i) => xLeft + i * step);
}

/**
 * Variant total defenders.
 */
function totalDefenders(variant: SynthAlignment["variant"]): number {
  switch (variant) {
    case "tackle_11": return 11;
    case "flag_7v7":  return 7;
    case "flag_5v5":  return 5;
  }
}

/* ------------------------------------------------------------------ */
/*  Tackle 11 synthesizer                                              */
/* ------------------------------------------------------------------ */

function placeTackle11Front(dl: number, lb: number): {
  dline: SynthAlignmentPlayer[];
  linebackers: SynthAlignmentPlayer[];
} {
  // Clamp to sensible bounds. The box is roughly x ∈ [-10, 10] for the
  // D-line and slightly wider for LBs.
  const dlX = spreadEvenly(dl, -10, 10);
  const lbX = spreadEvenly(lb, -8, 8);
  const dline: SynthAlignmentPlayer[] = dlX.map((x, i) => ({
    id: i === 0 || i === dlX.length - 1 ? "DE" : "DT",
    x: Math.round(x * 10) / 10,
    y: 1,
  }));
  // 4-LB conventions: WL/ML/BK/SL (matches the catalog 4-4 stack).
  // 3-LB: WL/ML/SL. 2-LB: WL/ML. 1-LB: ML. 0-LB: none.
  const fourLb = ["WL", "ML", "BK", "SL"];
  const threeLb = ["WL", "ML", "SL"];
  const twoLb = ["WL", "ML"];
  const oneLb = ["ML"];
  const lbLabels =
    lb >= 4 ? fourLb.slice(0, lb)
    : lb === 3 ? threeLb
    : lb === 2 ? twoLb
    : lb === 1 ? oneLb
    : [];
  const linebackers: SynthAlignmentPlayer[] = lbX.map((x, i) => ({
    id: lbLabels[i] ?? `LB${i + 1}`,
    x: Math.round(x * 10) / 10,
    y: 4,
  }));
  return { dline, linebackers };
}

function placeTackle11Secondary(
  dbCount: number,
  shell: CoverageShell,
): { players: SynthAlignmentPlayer[]; zones: SynthAlignmentZone[]; manCoverage: boolean } {
  if (dbCount <= 0) {
    return { players: [], zones: [], manCoverage: false };
  }

  // Shell-driven placement. Most defenses run with 3-5 DBs.
  switch (shell.kind) {
    case "cover_0": {
      // No deep help, all DBs in man at LB-ish depth across the formation.
      const xs = spreadEvenly(dbCount, -16, 16);
      return {
        players: xs.map((x, i) => ({
          id: i === 0 || i === xs.length - 1 ? "CB" : i === Math.floor(xs.length / 2) ? "SS" : "NB",
          x: Math.round(x * 10) / 10,
          y: 6,
        })),
        zones: [],
        manCoverage: true,
      };
    }
    case "cover_1": {
      // Single-high FS, rest in man.
      const players: SynthAlignmentPlayer[] = [];
      players.push({ id: "FS", x: 0, y: 13 });
      const remaining = dbCount - 1;
      // Two corners on the edges; everyone else nickel/safety underneath.
      if (remaining >= 1) players.push({ id: "CB", x: -16, y: 6 });
      if (remaining >= 2) players.push({ id: "CB", x:  16, y: 6 });
      if (remaining >= 3) players.push({ id: "SS", x:   6, y: 6 });
      const interiorXs = spreadEvenly(Math.max(0, remaining - 3), -6, 6);
      for (let i = 0; i < interiorXs.length; i++) {
        players.push({ id: "NB", x: Math.round(interiorXs[i] * 10) / 10, y: 6 });
      }
      return { players, zones: [], manCoverage: true };
    }
    case "cover_2": {
      // Two deep halves, corners squat, 3 underneath hooks (no overlap).
      // Traditional Cover 2 has 5 underneath: 2 squat CBs in the flats +
      // 2 OLBs in the hook/curl zones + 1 MLB in the middle hole. The
      // zone WIDTHS are tuned so adjacent zones don't overlap (otherwise
      // labels stack on top of each other and the field looks junky).
      const players: SynthAlignmentPlayer[] = [];
      players.push({ id: "CB", x: -16, y: 5 });
      players.push({ id: "CB", x:  16, y: 5 });
      players.push({ id: "FS", x: -8,  y: 13 });
      players.push({ id: "SS", x:  8,  y: 13 });
      const extras = Math.max(0, dbCount - 4);
      const xs = spreadEvenly(extras, -6, 6);
      for (let i = 0; i < xs.length; i++) {
        players.push({ id: "NB", x: Math.round(xs[i] * 10) / 10, y: 6 });
      }
      return {
        players,
        zones: [
          // Two deep halves
          { kind: "rectangle", center: { x: -10, y: 17 }, size: { x: 14, y: 16 }, label: "Deep 1/2 L" },
          { kind: "rectangle", center: { x:  10, y: 17 }, size: { x: 14, y: 16 }, label: "Deep 1/2 R" },
          // 5 underneath, non-overlapping spans:
          //   Flat L  : -18 .. -10  (size 8, center -14)
          //   Hook L  : -10 ..  -3  (size 7, center -6.5)
          //   Mid Hole:  -3 ..   3  (size 6, center 0)
          //   Hook R  :   3 ..  10  (size 7, center 6.5)
          //   Flat R  :  10 ..  18  (size 8, center 14)
          { kind: "rectangle", center: { x: -14,  y: 4 }, size: { x: 8, y: 8 }, label: "Flat L" },
          { kind: "rectangle", center: { x:  -6.5,y: 5 }, size: { x: 7, y: 8 }, label: "Hook L" },
          { kind: "rectangle", center: { x:   0,  y: 5 }, size: { x: 6, y: 8 }, label: "Mid" },
          { kind: "rectangle", center: { x:   6.5,y: 5 }, size: { x: 7, y: 8 }, label: "Hook R" },
          { kind: "rectangle", center: { x:  14,  y: 4 }, size: { x: 8, y: 8 }, label: "Flat R" },
        ],
        manCoverage: false,
      };
    }
    case "tampa_2": {
      // Same secondary as Cover 2 but the MLB carries the deep middle.
      const c2 = placeTackle11Secondary(dbCount, { kind: "cover_2" });
      return {
        ...c2,
        zones: [
          ...c2.zones.filter((z) => !z.label.startsWith("Deep") && !z.label.startsWith("Hook M")),
          { kind: "rectangle", center: { x: -10, y: 17 }, size: { x: 12, y: 16 }, label: "Deep 1/2 L" },
          { kind: "rectangle", center: { x:   0, y: 17 }, size: { x:  8, y: 16 }, label: "Deep M (MLB)" },
          { kind: "rectangle", center: { x:  10, y: 17 }, size: { x: 12, y: 16 }, label: "Deep 1/2 R" },
        ],
      };
    }
    case "cover_3": {
      const players: SynthAlignmentPlayer[] = [];
      players.push({ id: "CB", x: -16, y: 6 });
      players.push({ id: "CB", x:  16, y: 6 });
      players.push({ id: "FS", x:   0, y: 13 });
      const extras = Math.max(0, dbCount - 3);
      if (extras >= 1) players.push({ id: "SS", x: 6, y: 9 });
      const remXs = spreadEvenly(Math.max(0, extras - 1), -6, 6);
      for (let i = 0; i < remXs.length; i++) {
        players.push({ id: "NB", x: Math.round(remXs[i] * 10) / 10, y: 6 });
      }
      // Underneath spans (4 zones, non-overlapping):
      //   Flat L  : -18 .. -10  (size 8, center -14)
      //   Hook L  : -10 ..   0  (size 10, center -5)
      //   Hook R  :   0 ..  10  (size 10, center  5)
      //   Flat R  :  10 ..  18  (size 8, center 14)
      // Deep thirds: width 11 each, centered at -11, 0, 11 — no overlap.
      return {
        players,
        zones: [
          { kind: "rectangle", center: { x: -11, y: 17 }, size: { x: 11, y: 16 }, label: "Deep 1/3 L" },
          { kind: "rectangle", center: { x:   0, y: 17 }, size: { x: 11, y: 16 }, label: "Deep 1/3 M" },
          { kind: "rectangle", center: { x:  11, y: 17 }, size: { x: 11, y: 16 }, label: "Deep 1/3 R" },
          { kind: "rectangle", center: { x: -14, y: 4 }, size: { x: 8, y: 8 }, label: "Flat L" },
          { kind: "rectangle", center: { x:  -5, y: 5 }, size: { x: 10, y: 8 }, label: "Hook L" },
          { kind: "rectangle", center: { x:   5, y: 5 }, size: { x: 10, y: 8 }, label: "Hook R" },
          { kind: "rectangle", center: { x:  14, y: 4 }, size: { x: 8, y: 8 }, label: "Flat R" },
        ],
        manCoverage: false,
      };
    }
    case "cover_4": {
      const players: SynthAlignmentPlayer[] = [];
      players.push({ id: "CB", x: -16, y: 8 });
      players.push({ id: "CB", x:  16, y: 8 });
      players.push({ id: "FS", x:  -6, y: 12 });
      players.push({ id: "SS", x:   6, y: 12 });
      const extras = Math.max(0, dbCount - 4);
      const xs = spreadEvenly(extras, -4, 4);
      for (let i = 0; i < xs.length; i++) {
        players.push({ id: "NB", x: Math.round(xs[i] * 10) / 10, y: 6 });
      }
      // Quarters: width 9 each, centers at -13.5, -4.5, 4.5, 13.5 → no overlap.
      // Underneath: 3 zones (Flat L / Mid / Flat R), widths sized to not overlap.
      return {
        players,
        zones: [
          { kind: "rectangle", center: { x: -13.5, y: 17 }, size: { x: 9, y: 16 }, label: "Deep 1/4 L" },
          { kind: "rectangle", center: { x:  -4.5, y: 17 }, size: { x: 9, y: 16 }, label: "Deep 1/4 ML" },
          { kind: "rectangle", center: { x:   4.5, y: 17 }, size: { x: 9, y: 16 }, label: "Deep 1/4 MR" },
          { kind: "rectangle", center: { x:  13.5, y: 17 }, size: { x: 9, y: 16 }, label: "Deep 1/4 R" },
          { kind: "rectangle", center: { x: -12, y: 4 }, size: { x: 12, y: 8 }, label: "Flat L" },
          { kind: "rectangle", center: { x:   0, y: 5 }, size: { x: 12, y: 8 }, label: "Mid" },
          { kind: "rectangle", center: { x:  12, y: 4 }, size: { x: 12, y: 8 }, label: "Flat R" },
        ],
        manCoverage: false,
      };
    }
    case "unknown":
    default: {
      // Fall back to a Cover 3 shell — it's the most common base coverage
      // for unspecified looks. Caller can override if they have better info.
      return placeTackle11Secondary(dbCount, { kind: "cover_3" });
    }
  }
}

/**
 * Produce a tackle_11 alignment for `<front>` + `<coverage>` when the
 * catalog has no exact match. Returns null if the front can't be parsed.
 */
function synthesizeTackle11(front: string, coverage: string): SynthAlignment | null {
  const parsed = parseFront(front);
  if (!parsed) return null;
  const total = totalDefenders("tackle_11");
  // dbCount is whatever's left after dl+lb. Clamp to ≥ 0.
  const dbCount = Math.max(0, total - parsed.dl - parsed.lb);
  if (dbCount > 7) {
    // A 1-1-9 front isn't a real defense. Reject so the caller knows.
    return null;
  }

  const { dline, linebackers } = placeTackle11Front(parsed.dl, parsed.lb);
  const shell = parseCoverage(coverage);
  const sec = placeTackle11Secondary(dbCount, shell);

  return {
    front: front,
    coverage: coverage,
    variant: "tackle_11",
    description:
      `Synthesized ${parsed.dl}-${parsed.lb} front with ${dbCount} DB(s) — ` +
      `${parsed.dl} on the line, ${parsed.lb} at LB depth, ` +
      `secondary in a ${shell.kind === "unknown" ? "Cover 3" : shell.kind.replace("_", " ")} shell. ` +
      `Not a catalog match — Coach Cal generated this from the front + coverage names. ` +
      `Coaches reviewing should sanity-check that the look matches what they teach.`,
    players: [...dline, ...linebackers, ...sec.players],
    zones: sec.zones,
    manCoverage: sec.manCoverage,
  };
}

/* ------------------------------------------------------------------ */
/*  Public entry                                                       */
/* ------------------------------------------------------------------ */

/**
 * Try to synthesize an alignment for a (variant, front, coverage) combo
 * not present in the catalog. Returns null if synthesis isn't possible
 * for the variant or the front string can't be parsed — in that case
 * the caller should fall back to the catalog list error.
 */
export function synthesizeAlignment(
  variant: string,
  front: string,
  coverage: string,
): SynthAlignment | null {
  if (variant === "tackle_11") return synthesizeTackle11(front, coverage);
  // Flag variants don't have a D-line; their fronts ("7v7 Zone", "5v5 Man")
  // are catalog-only. If we ever want to synthesize for flag, we'd need a
  // separate strategy (e.g., parse rusher count). Out of scope for now —
  // flag catalogs already cover the common cases.
  return null;
}
