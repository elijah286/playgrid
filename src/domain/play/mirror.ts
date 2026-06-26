/**
 * Whole-diagram mirror transform — the geometric core of `flip_play`.
 *
 * "Flip this play" is ambiguous (a coach can mean three different things),
 * so the tool exposes three MODES. Each is a pure, deterministic transform
 * on a CoachDiagram. The field coordinate system makes this simple:
 *
 *   x = yards from the CENTER of the field (negative = LEFT, positive = RIGHT)
 *   y = yards from the LOS (unchanged by every flip — we never flip downfield)
 *
 * so a left↔right mirror is just `x → -x`. This is the same reflection the
 * offensive/defensive synthesizers already apply for `strength: "left"`
 * (see offensiveSynthesize.ts / defensiveAlignments.ts) — we're exposing it
 * as an edit on an existing play instead of only at synthesis time.
 *
 * The three modes (matching the coach-facing clarifying question):
 *
 *   "full"      Mirror the WHOLE play across the field center. Every player
 *               moves to the opposite side AND every route mirrors. This is
 *               the football-vernacular "run it to the other side / flip it."
 *               Mirror²  = identity.
 *
 *   "routes"    Keep every player where they are; mirror each route about its
 *               OWN player's x (an out becomes an in, etc.). The formation /
 *               alignment is untouched.
 *
 *   "formation" Mirror player POSITIONS (the formation flips, Trips Right →
 *               Trips Left) but each route keeps its field-absolute shape and
 *               direction, re-anchored to follow its player. Geometrically the
 *               odd one out, but a coach who wants "same routes, mirrored
 *               personnel" means this.
 *
 * Defenders/zones: "full" mirrors them too (the whole play reflects). The
 * offense-shaping modes ("routes" / "formation") leave the defense untouched
 * — those modes are about reshaping the offense, with the defense as context.
 *
 * Rule 10 (AGENTS.md): the output is sanitized before it can reach a coach,
 * exactly like every other render boundary.
 */

import { sanitizeCoachDiagram, type SanitizeWarning } from "./sanitize";
import type { SportVariant } from "./types";
import type {
  CoachDiagram,
  CoachDiagramPlayer,
  CoachDiagramRoute,
  CoachDiagramZone,
} from "@/features/coach-ai/coachDiagramConverter";

export type FlipMode = "full" | "routes" | "formation";

export type MirrorResult = {
  diagram: CoachDiagram;
  warnings: SanitizeWarning[];
};

/** Reflect a scalar across the field center, normalizing -0 → 0 so the
 *  output is stable for tests and round-trips through JSON cleanly. */
const neg = (n: number): number => (n === 0 ? 0 : -n);

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

const swapDirection = (
  d: CoachDiagramRoute["direction"],
): CoachDiagramRoute["direction"] =>
  d === "left" ? "right" : d === "right" ? "left" : d;

const mapWaypoints = (
  pts: [number, number][] | undefined,
  fx: (x: number) => number,
): [number, number][] | undefined =>
  pts ? pts.map(([x, y]) => [isNum(x) ? fx(x) : x, y] as [number, number]) : pts;

const isDefender = (p: CoachDiagramPlayer): boolean => p.team === "D";

/** Mirror a single route by reflecting/translating its geometry with `fx`.
 *
 *  `breakSidePreserved` distinguishes the two geometric cases:
 *   - "full" mirror (player AND route reflect across center): a route's
 *     inside/outside relationship to its receiver is UNCHANGED — an Out
 *     stays an Out, just to the other sideline. We keep `route_kind` and
 *     swap the lateral `direction` label so it still describes the play.
 *   - "routes"/"formation" mirror (route flips relative to its receiver):
 *     the break side INVERTS — an Out becomes an In, a Corner a Post, and
 *     several families have no clean mirror name at all. Rather than encode
 *     the catalog's family taxonomy here (Rule 1/6: the catalog is the
 *     single source of truth), we DROP the now-inaccurate `route_kind` and
 *     mark the route `nonCanonical` — it's an honest custom mirrored shape.
 *     The geometry is exact; we just stop claiming a family that no longer
 *     matches (which would otherwise fail the route-direction validator,
 *     and lie to notes/KB).
 */
function mirrorRoute(
  route: CoachDiagramRoute,
  fx: (x: number) => number,
  breakSidePreserved: boolean,
): CoachDiagramRoute {
  const next: CoachDiagramRoute = {
    ...route,
    path: mapWaypoints(route.path, fx) ?? route.path,
  };
  if (route.motion) next.motion = mapWaypoints(route.motion, fx);
  if (breakSidePreserved) {
    if (route.direction) next.direction = swapDirection(route.direction);
  } else if (route.route_kind !== undefined) {
    // Break side inverted — the named family no longer describes this route.
    delete next.route_kind;
    delete next.direction;
    next.nonCanonical = true;
  }
  return next;
}

function mirrorZone(zone: CoachDiagramZone): CoachDiagramZone {
  const [cx, cy] = zone.center;
  return { ...zone, center: [isNum(cx) ? neg(cx) : cx, cy] };
}

/**
 * Mirror a CoachDiagram according to `mode`. Pure + deterministic. The
 * result is sanitized (Rule 10) before return; `warnings` surfaces anything
 * the sanitizer clamped/dropped (should be empty for a well-formed input —
 * a mirror of an in-bounds play stays in bounds).
 */
export function mirrorCoachDiagram(
  input: CoachDiagram,
  mode: FlipMode,
  variantOverride?: SportVariant,
): MirrorResult {
  const players = Array.isArray(input.players) ? input.players : [];
  const routes = Array.isArray(input.routes) ? input.routes : [];
  const zones = Array.isArray(input.zones) ? input.zones : [];

  // Per-player x lookup so "routes"/"formation" modes can reflect/translate
  // each route relative to its carrier.
  const playerX = new Map<string, number>();
  for (const p of players) if (isNum(p.x)) playerX.set(p.id, p.x);

  let nextPlayers: CoachDiagramPlayer[];
  let nextRoutes: CoachDiagramRoute[];
  let nextZones: CoachDiagramZone[];

  if (mode === "full") {
    // Reflect everything across the field center.
    nextPlayers = players.map((p) => (isNum(p.x) ? { ...p, x: neg(p.x) } : p));
    nextRoutes = routes.map((r) => mirrorRoute(r, neg, true));
    nextZones = zones.map(mirrorZone);
  } else if (mode === "routes") {
    // Players stay put; mirror each OFFENSE route about its own player's x.
    // Defense (players, routes, zones) is left untouched.
    nextPlayers = players;
    nextRoutes = routes.map((r) => {
      const carrier = players.find((p) => p.id === r.from);
      if (!carrier || isDefender(carrier)) return r;
      const px = playerX.get(r.from);
      if (px === undefined) return r;
      return mirrorRoute(r, (x) => 2 * px - x, false);
    });
    nextZones = zones;
  } else {
    // "formation" — mirror OFFENSE positions; routes keep their field-
    // absolute shape/direction, translated to follow the moved player.
    // Defense is left untouched.
    nextPlayers = players.map((p) =>
      isNum(p.x) && !isDefender(p) ? { ...p, x: neg(p.x) } : p,
    );
    nextRoutes = routes.map((r) => {
      const carrier = players.find((p) => p.id === r.from);
      if (!carrier || isDefender(carrier)) return r;
      const px = playerX.get(r.from);
      if (px === undefined) return r;
      // new carrier x = -px, so every waypoint shifts by (-px - px) = -2px.
      return mirrorRoute(r, (x) => x - 2 * px, false);
    });
    nextZones = zones;
  }

  const mirrored: CoachDiagram = {
    ...input,
    players: nextPlayers,
    ...(input.routes !== undefined ? { routes: nextRoutes } : {}),
    ...(input.zones !== undefined ? { zones: nextZones } : {}),
  };

  const variant =
    variantOverride ?? (typeof input.variant === "string" ? (input.variant as SportVariant) : undefined);
  const sanitized = sanitizeCoachDiagram(mirrored, variant);
  return { diagram: sanitized.diagram, warnings: sanitized.warnings };
}
