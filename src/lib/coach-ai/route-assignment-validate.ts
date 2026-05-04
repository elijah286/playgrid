/**
 * Route-assignment validator.
 *
 * Layer 2 of the Semantic-First Play Authoring (SFPA) gate. When Coach Cal
 * declares `route_kind: "slant"` on a CoachDiagramRoute, this validator
 * checks the route's geometry against the catalog's hard constraints
 * (depth range, side relative to player). A "12-yard slant" is rejected
 * here — slants cap at ~7 yards.
 *
 * Errors are structured strings safe to feed back to Cal as a one-shot
 * critique: each names the carrier, the declared kind, what failed, and a
 * suggestion of what families WOULD fit the geometry. Cal then re-emits
 * with the right family or the right depth.
 *
 * The validator is non-fatal for routes WITHOUT `route_kind` set — those
 * fall through to the existing get_route_template snapshot check in
 * diagram-validate.ts. Adding `route_kind` is opt-in for now; once the
 * agent prompt is updated to require it for catalog routes, the existing
 * snapshot check becomes redundant.
 */

import { findTemplate, ROUTE_TEMPLATES, type RouteTemplate, type BreakDirection } from "@/domain/play/routeTemplates";
import type { CoachDiagram, CoachDiagramPlayer, CoachDiagramRoute } from "@/features/coach-ai/coachDiagramConverter";

/** Tolerance applied when checking depth range membership (yards). Author
 *  intent is a band, and Cal sometimes rounds to a whole yard — strict
 *  bounds would reject a 7.1-yard slant against a [3, 7] range. */
const DEPTH_TOLERANCE_YDS = 0.5;

/** Tolerance applied when checking the route's side. A vertical-ish route
 *  may end with |x| up to this much without violating side="vertical". */
const VERTICAL_TOLERANCE_YDS = 1.5;

/** Minimum lateral movement (yards) to consider a route as having a
 *  declared side. Below this and even a "slant" looks vertical. Used only
 *  in error messages, not the rejection rule. */
const LATERAL_COMMIT_MIN_YDS = 1.5;

/** Player ids/labels that the diagram converter treats as the QB.
 *  Mirrors specParser's QB_IDS so the rule is identity-consistent
 *  across both surfaces. */
const QB_IDS = new Set(["Q", "QB"]);

/** Variants where the QB never runs a route — flag football. In tackle,
 *  QB sneak / scramble / draw are legal carry actions and should not be
 *  blocked by this validator. */
const FLAG_VARIANTS = new Set(["flag_5v5", "flag_7v7"]);

/**
 * Optional context for validation. Both fields are opt-in: legacy
 * callers that don't pass anything keep their prior behavior, and
 * variant can also be sourced from `diagram.variant` (handy for the
 * write-tool path which already stamps it).
 */
export type RouteAssignmentContext = {
  /** Sport variant for variant-specific rules (currently the QB-flag
   *  gate). When unset, falls back to `diagram.variant`. */
  variant?: string;
  /** Coach-stated maximum forward throw depth in yards. When set, every
   *  route's deepest forward waypoint must be ≤ this (within tolerance)
   *  unless the route has `nonCanonical: true`. Catches the "coach said
   *  max 10yds, Cal generated 18yd routes" failure mode. */
  maxRouteDepthYds?: number;
};

export type RouteAssignmentError = {
  /** Player id the route is attached to (e.g. "X", "Z2"). */
  carrier: string;
  /** The declared route_kind that failed validation. */
  declaredKind: string;
  /** Human-readable message safe to surface to Cal as a critique. */
  message: string;
};

export type RouteAssignmentValidation =
  | { ok: true }
  | { ok: false; errors: RouteAssignmentError[] };

/**
 * Validate every route on the diagram against three layers of rules:
 *
 *  1. **Variant-level rules** — fire regardless of route_kind. Currently
 *     the flag-football QB gate: in flag_5v5 / flag_7v7 the QB never
 *     runs a route. Catches hand-authored `create_play` diagrams that
 *     bypass `compose_play`'s `qbDropback()` skeleton.
 *
 *  2. **Coach-stated max throw depth** — when the coach has surfaced a
 *     cap (e.g. "10-year-olds, max 10 yards reliably"), every route's
 *     deepest forward waypoint must respect it. `nonCanonical: true` is
 *     the explicit-override escape hatch.
 *
 *  3. **Catalog route_kind constraints** — for routes with `route_kind`
 *     set, the path's depth + side must match the named family. Routes
 *     without `route_kind` skip this layer (custom shapes).
 */
export function validateRouteAssignments(
  diagram: CoachDiagram,
  context?: RouteAssignmentContext,
): RouteAssignmentValidation {
  const routes = diagram.routes ?? [];
  if (routes.length === 0) return { ok: true };

  const playerById = new Map<string, CoachDiagramPlayer>();
  for (const p of diagram.players) playerById.set(p.id, p);

  const errors: RouteAssignmentError[] = [];
  const variant = (context?.variant ?? diagram.variant ?? "").trim();
  const isFlag = FLAG_VARIANTS.has(variant);
  const maxDepth = context?.maxRouteDepthYds;

  for (const route of routes) {
    const carrier = playerById.get(route.from);
    if (!carrier) {
      // Unknown carrier — the existing diagram validator will already
      // catch this. Skip every check (no anchor to measure from).
      continue;
    }

    // ── Layer 1: variant-level rules ────────────────────────────────
    if (isFlag && isQbCarrier(carrier)) {
      errors.push({
        carrier: route.from,
        declaredKind: (route.route_kind ?? "").trim() || "(no route_kind)",
        message:
          `In ${variant}, the QB cannot have a route — quarterbacks throw or hand off, they don't run pass routes. ` +
          `Drop the route from @${route.from} (use compose_play, which leaves QB unspecified) or, if the coach explicitly asked for a designed QB run, model it as a carry on a different player and have @${route.from} stay put.`,
      });
      continue;
    }

    // ── Layer 2: coach-stated max throw depth ───────────────────────
    if (typeof maxDepth === "number" && Number.isFinite(maxDepth) && route.nonCanonical !== true) {
      const deepestForward = computeDeepestForwardDepth(route, carrier);
      if (deepestForward > maxDepth + DEPTH_TOLERANCE_YDS) {
        errors.push({
          carrier: route.from,
          declaredKind: (route.route_kind ?? "").trim() || "(no route_kind)",
          message:
            `Route depth ${formatYds(deepestForward)} yds exceeds the coach-stated max throw depth of ${formatYds(maxDepth)} yds. ` +
            `Either shorten the path so it finishes ≤ ${formatYds(maxDepth)} yds past @${route.from}'s start, swap to a catalog family that fits the cap, or — if the coach explicitly asked for a deeper shot on this play — set \`nonCanonical: true\` on this route to bypass the cap.`,
        });
        continue;
      }
    }

    // ── Layer 3: catalog route_kind constraints ─────────────────────
    const declared = (route.route_kind ?? "").trim();
    if (!declared) continue;

    const template = findTemplate(declared);
    if (!template) {
      errors.push({
        carrier: route.from,
        declaredKind: declared,
        message:
          `route_kind="${declared}" doesn't match any catalog route. ` +
          `Catalog families: ${ROUTE_TEMPLATES.map((t) => t.name.toLowerCase()).join(", ")}. ` +
          `Either pick a catalog family or omit route_kind for genuinely custom routes.`,
      });
      continue;
    }

    const error = checkRouteAgainstTemplate(route, template, carrier);
    if (error) errors.push(error);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function isQbCarrier(player: CoachDiagramPlayer): boolean {
  const label = (player.role ?? player.id).toUpperCase().replace(/\d+$/, "");
  return QB_IDS.has(label);
}

function computeDeepestForwardDepth(
  route: CoachDiagramRoute,
  carrier: CoachDiagramPlayer,
): number {
  const path = Array.isArray(route.path) ? route.path : [];
  let deepest = 0;
  for (const wp of path) {
    if (!Array.isArray(wp) || wp.length < 2) continue;
    const dy = wp[1] - carrier.y;
    if (dy > deepest) deepest = dy;
  }
  return deepest;
}

function checkRouteAgainstTemplate(
  route: CoachDiagramRoute,
  template: RouteTemplate,
  carrier: CoachDiagramPlayer,
): RouteAssignmentError | null {
  const path = Array.isArray(route.path) ? route.path : [];
  if (path.length === 0) return null; // nothing to measure

  // Depth = max |y - carrier.y| across waypoints. Use signed max for
  // bubble-style negative-depth routes so we don't double-count negatives.
  let deepestSigned = 0;
  for (const wp of path) {
    if (!Array.isArray(wp) || wp.length < 2) continue;
    const dy = wp[1] - carrier.y;
    if (Math.abs(dy) > Math.abs(deepestSigned)) deepestSigned = dy;
  }

  const { depthRangeYds, side } = template.constraints;
  const minWithTolerance = depthRangeYds.min - DEPTH_TOLERANCE_YDS;
  const maxWithTolerance = depthRangeYds.max + DEPTH_TOLERANCE_YDS;
  if (deepestSigned < minWithTolerance || deepestSigned > maxWithTolerance) {
    // Explicit user-requested override: the coach said "8-yard drag"
    // and Cal honored it by setting nonCanonical: true. The depth
    // bounds are advisory in this case — render the route anyway, no
    // error. The catalog still rejects Cal-authored mistakes (where
    // nonCanonical is unset), so the safety net is intact for the
    // hallucination case. This unblocks legitimate coach intent
    // without weakening protection against Cal's own bad picks.
    if (route.nonCanonical === true) {
      return null;
    }
    return {
      carrier: route.from,
      declaredKind: template.name,
      message:
        `route_kind="${template.name}" cannot be ${formatYds(deepestSigned)} yds — ` +
        `${template.name} routes finish in [${depthRangeYds.min}, ${depthRangeYds.max}] yds (constraint from catalog). ` +
        suggestAlternativesByDepth(deepestSigned, side) +
        ` If the coach EXPLICITLY asked for this unusual depth, set \`nonCanonical: true\` on the route to bypass this check.`,
    };
  }

  // Side check. Determine which direction is "inside" for this carrier:
  // x trends toward 0 (center of field) = inside; trends away from 0 = outside.
  // Final waypoint x relative to carrier x is what we compare.
  const lastWp = path[path.length - 1];
  if (!Array.isArray(lastWp) || lastWp.length < 2) return null;
  const finalX = lastWp[0];
  const dxFromCarrier = finalX - carrier.x;

  // Carrier-relative inside direction: +1 if carrier is on the LEFT (x<0)
  // — inside means moving toward x=0 i.e. dx > 0. -1 if carrier is on the
  // RIGHT (x>0). At dead center (x=0), inside is undefined; treat the
  // route as having no required inside/outside lean for vertical templates.
  const insideSign = carrier.x < 0 ? 1 : carrier.x > 0 ? -1 : 0;

  const sideError = checkSide({
    side,
    dxFromCarrier,
    insideSign,
    template,
    carrier: route.from,
  });
  if (sideError) return sideError;

  return null;
}

function checkSide(opts: {
  side: BreakDirection;
  dxFromCarrier: number;
  insideSign: number;
  template: RouteTemplate;
  carrier: string;
}): RouteAssignmentError | null {
  const { side, dxFromCarrier, insideSign, template, carrier } = opts;

  // Vertical template: final |dx| must be small.
  if (side === "vertical") {
    if (Math.abs(dxFromCarrier) > VERTICAL_TOLERANCE_YDS) {
      return {
        carrier,
        declaredKind: template.name,
        message:
          `route_kind="${template.name}" must finish vertically (within ${VERTICAL_TOLERANCE_YDS} yds of the player's x), ` +
          `but the path ends ${formatYds(dxFromCarrier)} yds laterally. Use a route family that breaks (out, in, slant, etc.) or straighten the path.`,
      };
    }
    return null;
  }

  // Carrier on the goal-line midline (x=0) — can't enforce inside/outside,
  // any horizontal break is allowed for non-vertical templates.
  if (insideSign === 0) return null;

  // Inside template ("toward_qb"): dx in the inside direction.
  if (side === "toward_qb") {
    const movesInside = Math.sign(dxFromCarrier) === insideSign && Math.abs(dxFromCarrier) >= LATERAL_COMMIT_MIN_YDS;
    if (!movesInside && Math.abs(dxFromCarrier) >= LATERAL_COMMIT_MIN_YDS) {
      return {
        carrier,
        declaredKind: template.name,
        message:
          `route_kind="${template.name}" must finish INSIDE (toward the QB / middle of the field), ` +
          `but the path breaks OUTSIDE (toward the sideline). ${suggestOutsideAlternative(template.name)}`,
      };
    }
    return null;
  }

  // Outside template ("toward_sideline"): dx in the outside direction.
  if (side === "toward_sideline") {
    const movesOutside = Math.sign(dxFromCarrier) === -insideSign && Math.abs(dxFromCarrier) >= LATERAL_COMMIT_MIN_YDS;
    if (!movesOutside && Math.abs(dxFromCarrier) >= LATERAL_COMMIT_MIN_YDS) {
      return {
        carrier,
        declaredKind: template.name,
        message:
          `route_kind="${template.name}" must finish OUTSIDE (toward the sideline), ` +
          `but the path breaks INSIDE (toward the QB / middle). ${suggestInsideAlternative(template.name)}`,
      };
    }
  }

  return null;
}

/** Suggest catalog families whose depth range contains `depthYds`, optionally
 *  filtered to a side. Used to turn "12-yard slant" into "Did you mean: dig
 *  (10-16 yds inside) or skinny post (10-18 yds inside)?" */
function suggestAlternativesByDepth(depthYds: number, side: BreakDirection): string {
  const candidates = ROUTE_TEMPLATES.filter((t) => {
    const { depthRangeYds, side: tSide } = t.constraints;
    if (tSide !== side) return false;
    return depthYds >= depthRangeYds.min - DEPTH_TOLERANCE_YDS && depthYds <= depthRangeYds.max + DEPTH_TOLERANCE_YDS;
  });
  if (candidates.length === 0) {
    return `No catalog family fits ${formatYds(depthYds)} yds with that side — the geometry may be a custom shape (omit route_kind).`;
  }
  const list = candidates
    .slice(0, 4)
    .map((t) => `${t.name.toLowerCase()} (${t.constraints.depthRangeYds.min}-${t.constraints.depthRangeYds.max} yds)`)
    .join(", ");
  return `Did you mean: ${list}? Or use the correct depth for ${candidates[0].name.toLowerCase()} and re-emit.`;
}

function suggestInsideAlternative(declared: string): string {
  return `If the receiver actually breaks inside, use ${insideAlternativeFor(declared)} instead.`;
}

function suggestOutsideAlternative(declared: string): string {
  return `If the receiver actually breaks outside, use ${outsideAlternativeFor(declared)} instead.`;
}

function insideAlternativeFor(declared: string): string {
  const d = declared.toLowerCase();
  if (d === "out") return "in";
  if (d === "quick out") return "slant or hitch";
  if (d === "corner") return "post";
  if (d === "comeback") return "curl";
  if (d === "fade") return "skinny post";
  if (d === "wheel") return "drag or whip";
  return "an inside-breaking family (in, dig, slant, post, curl)";
}

function outsideAlternativeFor(declared: string): string {
  const d = declared.toLowerCase();
  if (d === "in") return "out";
  if (d === "slant") return "quick out";
  if (d === "post") return "corner";
  if (d === "curl") return "comeback";
  if (d === "dig") return "out";
  return "an outside-breaking family (out, corner, comeback, fade, wheel)";
}

function formatYds(n: number): string {
  return Math.abs(n) < 0.05 ? "0" : (Math.round(n * 10) / 10).toString();
}
