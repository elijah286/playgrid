import type { Point2, RouteNode, RouteSegment, SegmentShape, StrokePattern, Route, RouteStyle } from "./types";
import { uid } from "./factory";
import { projectRoutesToLegacy } from "@/domain/football-kg/legacy-projections";

/**
 * Canonical route catalog — SINGLE SOURCE OF TRUTH for every named route's
 * geometry, break shape, break direction, and prose definition.
 *
 * The KB seed (supabase/migrations/0144_seed_routes_global.sql, patched by
 * 0184_seed_routes_canonical.sql) intentionally mirrors the `description`
 * field below so Coach Cal's words and the rendered diagram stay consistent.
 *
 * Coordinate system for `points` (offsets from player start):
 *   x: fraction of FIELD WIDTH (per variant). xSign flips at runtime so
 *      "inside"/"outside" tracks the receiver's actual side of the formation.
 *      In TEMPLATE coords: positive x = OUTSIDE (toward sideline);
 *                          negative x = INSIDE (toward middle / where QB is).
 *   y: fraction of FIELD LENGTH (the 25-yard chat / editor window).
 *      0.04 ≈ 1 yd; 0.12 ≈ 3 yds; 0.20 ≈ 5 yds; 0.40 ≈ 10 yds.
 *
 * Segment shapes (per route's `shapes[i]`, segment from points[i] → points[i+1]):
 *   "straight" — sharp corner where two straight segments meet (slants, outs,
 *                ins, posts, digs — anything with a hard 90°/45° break).
 *   "curve"    — Bezier-curve segment, used for routes that round (curl
 *                back to QB, hitch settle, comeback, wheel turnup, fade arc).
 *
 * Angle convention (matches agent prompt + KB): break angles are measured
 * FROM HORIZONTAL (the LOS / sideline-to-sideline axis) unless explicitly
 * stated otherwise. So a "25° slant" runs mostly across with a shallow
 * upfield component.
 *
 * Direction convention: route NAMES imply direction relative to the QB.
 * "Curl", "Hitch", "Sit", "Hook", "In", "Dig", "Slant", "Drag", "Snag",
 * "Whip" all imply the receiver finishes TOWARD THE QB — settle/break
 * point's template-x must be ≤ 0 (inside, toward middle).
 * "Out", "Quick Out", "Corner", "Fade", "Wheel", "Flat", "Arrow",
 * "Comeback", "Bubble" all imply TOWARD THE SIDELINE — final-x must be ≥ 0.
 * "Go", "Seam", "Stop & Go" are vertical — final |x| ≤ 0.10.
 * The assertBreakDirInvariants() function below enforces these at module
 * load — any new template that violates the convention crashes the build,
 * so the bug class "curl drawn going outward" cannot ship.
 *
 * Adding/changing a template? Update three things in lockstep:
 *   1. The template here (geometry + shapes + breakStyle + breakDir + description).
 *   2. The KB entry in 0144_seed_routes_global.sql (so fresh DBs match).
 *   3. A new migration that UPDATEs the live DB row (so existing DBs match).
 */

export type BreakStyle =
  | "none"          // no break — straight line (Go, Seam, Drag, Flat)
  | "sharp"         // single sharp corner (Slant, Out, In, Post, Corner, Dig, Quick Out)
  | "rounded"       // round/curving turn (Curl, Comeback, Hitch, Wheel turnup, Fade)
  | "multi";        // double moves (Out & Up, Stop & Go, Whip)

/**
 * Direction the route's break/finish goes RELATIVE TO THE QB.
 *
 * Enforced at module load by assertBreakDirInvariants(). The check rules:
 *   "toward_qb"       → final point's template-x ≤ 0   (inside / toward middle)
 *   "toward_sideline" → final point's template-x ≥ 0   (outside)
 *   "vertical"        → final point's |template-x| ≤ 0.10 (essentially up the field)
 *   "varies"          → no constraint (used only for routes whose name doesn't
 *                       imply a direction, which is none of our current set)
 *
 * If the invariant fails, the module throws on import. This keeps the
 * "curl that breaks toward the sideline" bug from ever shipping again.
 */
export type BreakDirection =
  | "toward_qb"        // settles inside / faces QB (Curl, Hitch, Sit, In, Dig, Slant, Drag, Snag, Skinny Post, Post, Whip, Z-In)
  | "toward_sideline"  // breaks outside (Out, Quick Out, Corner, Fade, Wheel, Flat, Arrow, Comeback, Bubble, Z-Out, Out & Up)
  | "vertical"         // through the middle / no lateral commitment (Go, Seam, Stop & Go)
  | "varies";          // reserved for future double-moves whose direction is config-dependent

/**
 * Hard constraints for a route family. Used by the diagram-level validator
 * (validateRouteAssignments) to reject impossible combinations BEFORE they
 * persist — e.g. a "12-yard slant" (slants top out around 7 yds) or a
 * "slant outside" (slants always finish toward the QB).
 *
 * Authored in YARDS measured from the player's start, since coaches and the
 * LLM both reason about routes in yards, not normalized field fractions.
 * fieldLengthYds is 25 across every variant (see sportProfileForVariant), so
 * yards convert cleanly with `template_y_norm * 25`.
 */
export type RouteConstraints = {
  /** Inclusive yard range for the route's deepest waypoint, measured from
   *  the player's start. A 12-yard slant violates `slant`'s [3, 7] range. */
  depthRangeYds: { min: number; max: number };
  /** Required final-waypoint side relative to the player's start.
   *  Mirrors `breakDir` semantically but is what the validator checks
   *  against the assignment's geometry. */
  side: BreakDirection;
  /** Per-route slack (yds) the validator allows beyond [min, max] before
   *  rejecting. Defaults to DEPTH_TOLERANCE_YDS (0.5) when unset. Higher
   *  for latitude routes (deep verticals, settle/zone); default for sharp
   *  timing routes. Authored in the KG def (defs/routes.ts). */
  toleranceYds?: number;
};

export type RouteTemplate = {
  /** Display name. Lookup is case-insensitive. */
  name: string;
  /** Alternate names that should resolve to this template (case-insensitive). */
  aliases?: string[];
  /** When true, x-offsets follow: positive x = toward outside, negative x = toward inside.
   *  The xSign is determined by the player's field position. */
  directional?: boolean;
  /** Relative offsets from the player position (field coords, y-up). */
  points: Point2[];
  /** Per-segment shape overrides. Length should be points.length - 1.
   *  Defaults to all-"straight" if omitted. ALWAYS set this explicitly for
   *  any route with a curved segment. */
  shapes?: SegmentShape[];
  /** Coarse semantic label for the route's break shape. */
  breakStyle: BreakStyle;
  /** Direction of the break/finish relative to the QB. Enforced at module
   *  load by assertBreakDirInvariants() — required so the route's NAME
   *  (which implies direction) matches its GEOMETRY (which the renderer
   *  draws). Mismatches throw on import. */
  breakDir: BreakDirection;
  /** Hard constraints checked at diagram-validation time. See RouteConstraints. */
  constraints: RouteConstraints;
  /** Canonical written definition. MUST mirror the KB entry (subtopic
   *  matches `kbSubtopic`). Format: "STEM (if any) → BREAK shape/angle/
   *  direction → CATCH depth. When-to-use. Route tree # if applicable." */
  description: string;
  /** rag_documents subtopic for this route (e.g. "route_slant"). */
  kbSubtopic: string;
};

/* ------------------------------------------------------------------ */
/*  Standard route templates (offsets relative to player position)     */
/* ------------------------------------------------------------------ */
//
// Sourced from the Football Knowledge Graph (Phase 1d, 2026-05-24).
// The 26 route entries used to live inline here as a TypeScript array;
// they now live as KG defs in src/domain/football-kg/defs/routes.ts
// and are projected to legacy-shape via `projectRoutesToLegacy()`.
// Byte-equality with the prior inline data is verified by
// `src/domain/football-kg/defs/legacy-byte-equality.test.ts`.
//
// To add or modify a route: edit the KG def file. The
// `assertBreakDirInvariants` + `assertConstraintsMatchGeometry`
// checks below still run on the projected output, so any geometry
// drift fails at module load.

export const ROUTE_TEMPLATES: RouteTemplate[] = projectRoutesToLegacy() as unknown as RouteTemplate[];

// ── Legacy inline data removed 2026-05-24 — see Football KG ──────────

/* ------------------------------------------------------------------ */
/*  Direction invariant — runs at module load                          */
/* ------------------------------------------------------------------ */

/**
 * Verifies every template's geometry matches its declared `breakDir`.
 *
 * Why: route NAMES imply direction (Curl = toward QB, Out = toward sideline)
 * and coaches expect the diagram to match. A previous bug had the curl
 * settle 1.2 yds OUTSIDE — visually wrong, though the prose said "toward
 * QB". This invariant catches that class of mistake at module load so the
 * bug can never ship.
 *
 * Rules (applied to the FINAL waypoint in template coords):
 *   toward_qb       → x ≤ 0          (inside, since template +x = outside)
 *   toward_sideline → x ≥ 0          (outside)
 *   vertical        → |x| ≤ 0.10     (essentially up the field, no commit)
 *   varies          → no constraint
 */
function assertBreakDirInvariants(): void {
  const VERTICAL_TOLERANCE = 0.10;
  for (const t of ROUTE_TEMPLATES) {
    const last = t.points[t.points.length - 1];
    if (!last) {
      throw new Error(`Route template "${t.name}" has no points.`);
    }
    const fx = last.x;
    switch (t.breakDir) {
      case "toward_qb":
        if (fx > 0) {
          throw new Error(
            `Route template "${t.name}" declared breakDir="toward_qb" but its final point has x=${fx} (positive = OUTSIDE). ` +
            `Toward-QB routes must finish with x ≤ 0 (inside, toward the middle where the QB is). Fix the template's last point or change breakDir.`,
          );
        }
        break;
      case "toward_sideline":
        if (fx < 0) {
          throw new Error(
            `Route template "${t.name}" declared breakDir="toward_sideline" but its final point has x=${fx} (negative = INSIDE). ` +
            `Sideline routes must finish with x ≥ 0 (outside). Fix the template's last point or change breakDir.`,
          );
        }
        break;
      case "vertical":
        if (Math.abs(fx) > VERTICAL_TOLERANCE) {
          throw new Error(
            `Route template "${t.name}" declared breakDir="vertical" but its final point has |x|=${Math.abs(fx)} (> ${VERTICAL_TOLERANCE}). ` +
            `Vertical routes must finish near the same x as the start. Fix the template or use "toward_qb"/"toward_sideline".`,
          );
        }
        break;
      case "varies":
        // No constraint.
        break;
    }
  }
}

// Run immediately so a bad template crashes at import time, not at runtime.
assertBreakDirInvariants();

/**
 * Verifies every template's `constraints.depthRangeYds` actually contains
 * its canonical geometry's deepest waypoint, AND that `constraints.side`
 * agrees with `breakDir`. Catches the class of bug where a coach widens a
 * template's break point without updating the constraint, or where the
 * declared side flips out from under the geometry.
 *
 * fieldLengthYds is 25 for every variant (see sportProfileForVariant), so
 * yards = template_y_norm * 25.
 */
function assertConstraintsMatchGeometry(): void {
  const FIELD_LENGTH_YDS = 25;
  for (const t of ROUTE_TEMPLATES) {
    if (!t.constraints) {
      throw new Error(`Route template "${t.name}" is missing constraints.`);
    }
    const { depthRangeYds, side } = t.constraints;
    if (side !== t.breakDir) {
      throw new Error(
        `Route template "${t.name}" has constraints.side="${side}" but breakDir="${t.breakDir}". They MUST agree — side is what the diagram validator checks against; breakDir is what the geometry validator checks against. Set them to the same value.`,
      );
    }
    // The "deepest" yard for the constraint = max y across the route's
    // template points (yards from start). Most routes finish at their max,
    // but curl/sit settle back so check the whole path.
    let maxYds = 0;
    let minYds = 0;
    for (const p of t.points) {
      const yds = p.y * FIELD_LENGTH_YDS;
      if (yds > maxYds) maxYds = yds;
      if (yds < minYds) minYds = yds;
    }
    // The canonical depth is the deepest point reached. Allow 0.5yd of
    // slack on each side — author intent is a band, not a hairline.
    const canonical = Math.max(Math.abs(maxYds), Math.abs(minYds)) === Math.abs(minYds) && minYds < 0
      ? minYds
      : maxYds;
    if (canonical < depthRangeYds.min - 0.5 || canonical > depthRangeYds.max + 0.5) {
      throw new Error(
        `Route template "${t.name}" canonical depth ${canonical.toFixed(1)} yds falls outside its declared depthRangeYds [${depthRangeYds.min}, ${depthRangeYds.max}]. Either widen the range or move the template's break point.`,
      );
    }
    if (depthRangeYds.min > depthRangeYds.max) {
      throw new Error(
        `Route template "${t.name}" has inverted depth range [${depthRangeYds.min}, ${depthRangeYds.max}].`,
      );
    }
  }
}

assertConstraintsMatchGeometry();

/* ------------------------------------------------------------------ */
/*  Lookup helpers                                                     */
/* ------------------------------------------------------------------ */

/** Case-insensitive lookup that respects aliases. Returns null if no match. */
export function findTemplate(rawName: string): RouteTemplate | null {
  const q = rawName.trim().toLowerCase();
  if (!q) return null;
  for (const t of ROUTE_TEMPLATES) {
    if (t.name.toLowerCase() === q) return t;
    if (t.aliases?.some((a) => a.toLowerCase() === q)) return t;
  }
  return null;
}

/**
 * Raise a requested past-LOS depth (yards) UP to a route family's
 * canonical floor when it falls below it. This is the structural
 * counterpart to the route-assignment validator's depth check for the
 * too-SHALLOW direction: instead of REJECTING a named route that's
 * shorter than its family allows (a Seam asked for at 8yd when Seams
 * run [10, 25]), the write path snaps it to the floor so the play SAVES.
 *
 * The asymmetry is deliberate. Too-shallow means "I want THIS route,
 * just shorter than it goes" → snap to the shortest legal version and
 * keep the family. Too-DEEP is intentionally left alone here: a route
 * asked for DEEPER than its family allows (a 30yd Drag, a 12yd Slant)
 * usually means the coach wants a DIFFERENT, deeper family — so that
 * case keeps the validator's reject + suggest-alternative path
 * (route-assignment-validate.ts) rather than silently shrinking 30yd
 * down to 5yd, which would be nonsense.
 *
 * Coach-explicit off-catalog depths (`nonCanonical`) pass through
 * untouched — the validator tolerates them the same way.
 *
 * See AGENTS.md Rule 5 ("make it impossible, then validate"): derive the
 * right geometry deterministically rather than validate-and-reject.
 * Mirrors `autoCapSpecDepthsToMaxThrow` (tools.ts) for the floor the
 * max-throw cap doesn't cover. Reported 2026-06-04 (coach hit repeated
 * "can't save — a seam can't be 8 yards" on Cal-composed plays).
 *
 * Returns the depth to render plus, when a raise happened, the original
 * value so callers can tell the coach ("set to 10 — Seams run 10–25").
 */
export function clampDepthToFamilyMin(
  template: RouteTemplate,
  depthYds: number,
  nonCanonical: boolean,
): { depthYds: number; raisedFrom: number | null } {
  if (nonCanonical) return { depthYds, raisedFrom: null };
  const min = template.constraints.depthRangeYds.min;
  if (!Number.isFinite(depthYds) || depthYds >= min) return { depthYds, raisedFrom: null };
  return { depthYds: min, raisedFrom: depthYds };
}

/* ------------------------------------------------------------------ */
/*  Instantiate a template for a player                               */
/* ------------------------------------------------------------------ */

export function instantiateTemplate(
  template: RouteTemplate,
  playerPosition: Point2,
  playerId: string,
  style?: Partial<RouteStyle>,
): Route {
  // Determine which direction "outside" is for this player
  const xSign = template.directional
    ? playerPosition.x >= 0.5 ? 1 : -1
    : 1;

  const nodes: RouteNode[] = template.points.map((offset) => ({
    id: uid("node"),
    position: {
      x: Math.min(1, Math.max(0, playerPosition.x + offset.x * xSign)),
      y: Math.min(1, Math.max(0, playerPosition.y + offset.y)),
    },
  }));

  const segments: RouteSegment[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    segments.push({
      id: uid("seg"),
      fromNodeId: nodes[i].id,
      toNodeId: nodes[i + 1].id,
      shape: template.shapes?.[i] ?? "straight",
      strokePattern: "solid" as StrokePattern,
      controlOffset: null,
    });
  }

  return {
    id: uid("route"),
    carrierPlayerId: playerId,
    semantic: null,
    nodes,
    segments,
    style: {
      stroke: style?.stroke ?? "#FFFFFF",
      strokeWidth: style?.strokeWidth ?? 2.5,
      ...style,
    },
  };
}
