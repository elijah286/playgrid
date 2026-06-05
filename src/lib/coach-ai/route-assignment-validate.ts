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

/** Layer 4 threshold: the deepest forward waypoint of any offensive route
 *  must reach at least this y position (in yards from the LOS). The
 *  typical legitimate bubble screen catches at y=-1 (1 yard behind LOS),
 *  so a -3 yard threshold accepts every legitimate bubble (and even
 *  generously-scaled ones) while rejecting the "Cal mirrored a Hitch
 *  and accidentally negated y too" case (X's bug had waypoints at
 *  -4.5 and -3.5, well past this threshold).
 *
 *  Routes that legitimately need to catch deeper than 3 yards behind
 *  the LOS can opt out via `nonCanonical: true` — the coach explicitly
 *  accepted an off-catalog shape (e.g. a deep RB dump). */
const BACKWARDS_ROUTE_THRESHOLD_YDS = -3;

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

/** Variants where the QB never runs a route — flag football + touch.
 *  In tackle, QB sneak / scramble / draw are legal carry actions and
 *  should not be blocked by this validator. Touch_7v7 follows flag's
 *  forward-pass-only rule even though the contact mechanic (two-hand-
 *  touch vs flag-pull) differs. */
const FLAG_VARIANTS = new Set([
  "flag_4v4",
  "flag_5v5",
  "flag_6v6",
  "flag_7v7",
  "touch_7v7",
]);

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
 * Validate every route on the diagram against four layers of rules:
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
 *
 *  4. **Forward-pass legality** — fires for ALL offensive routes (with
 *     or without route_kind). A receiver running a route whose deepest
 *     forward waypoint is significantly behind the LOS (more than the
 *     bubble-screen tolerance) cannot legally be the target of a forward
 *     pass. Catches the "Cal hand-authored a backwards route" failure
 *     mode surfaced 2026-05-04: a Hitch on @X (outside receiver) was
 *     authored with negative y-deltas (sign error when mirroring from
 *     the right side), placing the catch point 3.5 yards behind the LOS.
 *     A forward pass to that route is illegal in NFL flag football.
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
    //
    // QB pass routes are illegal in flag (quarterbacks throw or hand
    // off, they don't catch their own pass). But QB CARRIES are
    // legitimate visualizations — the mesh footwork on a Sweep, the
    // QB→handoff→catch path on a Flea Flicker, the QB Draw track
    // (gated behind the `designed_qb_run` capability). The renderer
    // emits `route_kind: "carry"` on every ballcarrier path
    // (specRenderer.ts case "carry") precisely so the validator can
    // distinguish carries from pass routes here.
    //
    // Bare `{from, path}` with NO route_kind is REJECTED — that's the
    // hand-authored shape (Cal writing JSON by hand). Phase 2b mostly
    // blocks hand-authoring upstream, but this layer is the
    // structural safety net (and the existing pre-2b regression
    // tests on this rule continue to pass).
    //
    // Surfaced 2026-05-24: the cross-variant route-assignment test
    // found 12 pre-existing failures across flag run concepts
    // (Sweep/Dive/Power/Counter/Draw + Flea Flicker × 5v5+7v7)
    // because Layer 1 fired on every QB carry. Capability-gated
    // QB Draw hit the same bug.
    const declaredKind = (route.route_kind ?? "").trim();
    const isCarryMarker = declaredKind === "carry";
    if (isFlag && isQbCarrier(carrier) && !isCarryMarker) {
      errors.push({
        carrier: route.from,
        declaredKind: declaredKind || "(no route_kind)",
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

    // ── Layer 4: forward-pass legality ──────────────────────────────
    //
    // Catch routes whose deepest forward waypoint is significantly
    // BEHIND the LOS — a forward pass to that catch point is illegal
    // in flag football (the catch must happen at or past the LOS,
    // unless the pass is intended as a backwards/lateral).
    //
    // Tolerance: -4 yards (matches the catalog's deepest legitimate
    // bubble screen). Routes deeper than this are either Cal's sign
    // errors (the original 2026-05-04 bug) or genuinely off-the-rails
    // hand-authored paths.
    //
    // Skipped when:
    //   - `nonCanonical: true` — the coach explicitly accepted an
    //     off-catalog shape.
    //   - `route_kind === "handoff"` — handoff arrows ARE behind the
    //     LOS by definition; they're not forward passes. Production
    //     bug 2026-05-25: Jet Reverse in tackle_11 failed compose_play
    //     because the QB→B handoff arrow at the mesh point (y=-4) hit
    //     this layer. Cal then hand-authored a fence as fallback.
    //   - `route_kind === "carry"` — ballcarriers' paths track their
    //     movement with the ball; starting / ending behind LOS is
    //     normal for sweeps, reverses, mesh-points. Task #32 added a
    //     similar exemption in Layer 1 for QB carries in flag; this
    //     extends it to ANY carrier in Layer 4.
    const layer4Kind = (route.route_kind ?? "").trim();
    const layer4IsBallExchange = layer4Kind === "handoff" || layer4Kind === "carry";
    if (route.nonCanonical !== true && !layer4IsBallExchange) {
      const deepestForwardY = computeDeepestForwardWaypointY(route);
      if (deepestForwardY !== null && deepestForwardY < BACKWARDS_ROUTE_THRESHOLD_YDS) {
        errors.push({
          carrier: route.from,
          declaredKind: layer4Kind || "(no route_kind)",
          message:
            `Route from @${route.from} has its deepest forward waypoint at ${formatYds(deepestForwardY)} yds (behind the LOS). ` +
            `A forward pass to this catch point would be illegal in flag football — receivers must catch a forward pass at or past the LOS. ` +
            `If this is a catalog route (Hitch, Slant, Curl, Out, etc.), call \`get_route_template\` and copy its path verbatim; do NOT hand-author waypoints — Cal's freelance geometry has produced wrong-direction routes (sign errors when mirroring across formations). ` +
            `If this is a genuine backwards/lateral pass play (bubble screen, swing, dump), set \`nonCanonical: true\` on this route to acknowledge the off-catalog shape AND make sure the prose describes it as a screen/lateral.`,
        });
        continue;
      }
    }

    // ── Layer 3: catalog route_kind constraints ─────────────────────
    const declared = (route.route_kind ?? "").trim();
    // Internal ball-movement / defender-reaction route kinds that
    // aren't pass-route families and shouldn't be looked up in the
    // catalog. These are visualization markers emitted by the
    // renderer / compose_defense, not coach-authored pass routes:
    //   - "carry"      — ballcarrier path (sweeps, draws, reverses)
    //   - "handoff"    — handoff indicator arrow at the mesh point
    //   - "zone_drop"  — defender's zone-drop arrow (compose_defense)
    //   - "react_*"    — defender reactor pattern (CB carries Go, etc.)
    if (declared.startsWith("react_")) continue;
    // Skip empty (genuine custom routes), the "carry" marker, the
    // "handoff" marker, and "zone_drop" — none are pass-route families;
    // ballcarrier paths aren't pass-route families and the template
    // catalog doesn't include them. The Layer 1 check above already
    // OK'd carries when they came from a recognized carrier (QB or
    // the named back), so by this point a "carry"-marked route is
    // legitimate by construction.
    if (!declared || declared === "carry" || declared === "handoff" || declared === "zone_drop") continue;

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

/**
 * Return the absolute y position (yards from LOS) of the route's
 * FURTHEST FORWARD waypoint — i.e. the largest y in the path. Used by
 * Layer 4 to detect routes whose entire path is deep in the offensive
 * backfield (a sign-error pattern Cal hits when mirroring routes
 * across formations).
 *
 * Returns null when the route has no path (motion-only or empty).
 */
function computeDeepestForwardWaypointY(route: CoachDiagramRoute): number | null {
  const path = Array.isArray(route.path) ? route.path : [];
  if (path.length === 0) return null;
  let maxY: number | null = null;
  for (const wp of path) {
    if (!Array.isArray(wp) || wp.length < 2) continue;
    const y = wp[1];
    if (!Number.isFinite(y)) continue;
    if (maxY === null || y > maxY) maxY = y;
  }
  return maxY;
}

function checkRouteAgainstTemplate(
  route: CoachDiagramRoute,
  template: RouteTemplate,
  carrier: CoachDiagramPlayer,
): RouteAssignmentError | null {
  const path = Array.isArray(route.path) ? route.path : [];
  if (path.length === 0) return null; // nothing to measure

  // Depth = max |y| across waypoints (LOS is y=0 in field coords).
  // CORRECTED 2026-05-26 (user audit). Prior version measured
  // `wp[1] - carrier.y` — the receiver's travel distance from start.
  // For a back at y=-5 running a Sit @ 6, travel = 11yd which fell
  // outside Sit's catalog range [3,7] and falsely failed validation.
  // Coaches read depth as "yards past LOS where the route catches"
  // — an absolute reference point. The catalog ranges are in that
  // same convention, so the validator now measures the same way.
  //
  // Signed max preserves the bubble-style negative-depth case
  // (routes that catch behind the LOS).
  let deepestSigned = 0;
  for (const wp of path) {
    if (!Array.isArray(wp) || wp.length < 2) continue;
    const dy = wp[1];
    if (Math.abs(dy) > Math.abs(deepestSigned)) deepestSigned = dy;
  }

  const { depthRangeYds, side } = template.constraints;
  // Per-route slack (defaults to the global 0.5 when the route doesn't
  // set one). Latitude routes (deep verticals, settle/zone) carry a
  // wider tolerance so a play a yard outside the canonical band still
  // saves; sharp timing routes keep the tight default.
  const tolerance = template.constraints.toleranceYds ?? DEPTH_TOLERANCE_YDS;
  const minWithTolerance = depthRangeYds.min - tolerance;
  const maxWithTolerance = depthRangeYds.max + tolerance;
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
    const tol = t.constraints.toleranceYds ?? DEPTH_TOLERANCE_YDS;
    return depthYds >= depthRangeYds.min - tol && depthYds <= depthRangeYds.max + tol;
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
