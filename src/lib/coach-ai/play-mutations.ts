/**
 * Shared route-mutation primitives used by every play-edit tool
 * (`modify_play_route`, `revise_play`, `compose_play`'s overrides).
 *
 * Architectural rationale (AGENTS.md hard-rule layer 5 — "Make it
 * impossible, then validate"):
 *   - Every tool that edits a route must produce coach-canonical
 *     geometry. There is exactly ONE function (`applyRouteMod`) that
 *     knows how to do that. New edit tools wrap it; they never
 *     reimplement path recomputation.
 *   - Identity-preservation (player IDs/positions unchanged across an
 *     edit) is enforced by `applyRouteMods` rather than each caller —
 *     so any future edit tool gets the guarantee for free.
 *
 * What this module does NOT do:
 *   - Persist anything (no DB writes).
 *   - Decide whether a mod is "allowed" by concept fidelity (that's
 *     the chat-time validator's job).
 *   - Render players or zones (handled by specRenderer).
 *
 * If you find yourself writing route-recomputation in a tool handler,
 * STOP — call `applyRouteMod` instead. That's the load-bearing
 * invariant this module exists for.
 */

import { findTemplate } from "@/domain/play/routeTemplates";
import { sanitizeCoachDiagram } from "@/domain/play/sanitize";
import type { CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";
import type { SportVariant } from "@/domain/play/types";

/** A single intent-level route change. The shape mirrors
 *  `modify_play_route`'s input fields so existing call sites can
 *  migrate without rewriting their input shapes. */
export type RouteMod = {
  player: string;
  set_family?: string;
  set_depth_yds?: number;
  set_non_canonical?: boolean;
  /** Force the route's lateral direction. Use when the route's intended
   *  side is logically decoupled from the carrier's natural x (e.g. RB's
   *  flat to the flood side, regardless of whether the back lines up
   *  left or right of the QB). Skip for receivers whose alignment
   *  determines side. */
  set_direction?: "left" | "right";
};

/** A play fence shape — same as CoachDiagram with a permissive index
 *  signature so unknown fields (`tip`, `motion`, `startDelaySec`,
 *  `nonCanonical`, etc.) round-trip without loss. */
type Fence = CoachDiagram & Record<string, unknown>;

export type ApplyRouteModResult =
  | { ok: true; fence: Fence; appliedSummary: string }
  | { ok: false; error: string };

const FIELD_LENGTH_YDS = 25;

function fieldWidthFor(variant: string): number {
  switch (variant) {
    case "tackle_11": return 53;
    case "flag_7v7":  return 30;
    case "flag_5v5":  return 25;
    default:          return 40;
  }
}

/** Apply ONE intent-level route mod to a fence. Returns a NEW fence
 *  (the input is not mutated). Recomputes path from the catalog
 *  template — the only place in the codebase that does this for
 *  edit tools. */
export function applyRouteMod(fence: Fence, mod: RouteMod): ApplyRouteModResult {
  const playersArr = Array.isArray(fence.players) ? fence.players : [];
  const routesArr = Array.isArray(fence.routes) ? fence.routes : [];
  const carrier = playersArr.find((p) => p && (p as { id?: unknown }).id === mod.player) as
    | { x?: number; y?: number; id?: string }
    | undefined;
  if (!carrier) {
    return {
      ok: false,
      error: `player "${mod.player}" not in fence.players (available: ${playersArr.map((p) => (p as { id?: string }).id).join(", ")}).`,
    };
  }
  const routeIdx = routesArr.findIndex((r) => r && (r as { from?: unknown }).from === mod.player);
  if (routeIdx < 0) {
    return {
      ok: false,
      error: `player "${mod.player}" has no existing route in fence.routes (a route from @${mod.player} must already exist for this mod to apply).`,
    };
  }

  const setFamily = typeof mod.set_family === "string" && mod.set_family.trim() !== ""
    ? mod.set_family.trim()
    : null;
  const setDepth = typeof mod.set_depth_yds === "number" && Number.isFinite(mod.set_depth_yds)
    ? mod.set_depth_yds
    : null;
  const setNonCanonical = typeof mod.set_non_canonical === "boolean" ? mod.set_non_canonical : null;
  const setDirection = mod.set_direction === "left" || mod.set_direction === "right" ? mod.set_direction : null;

  if (!setFamily && setDepth === null && setNonCanonical === null && setDirection === null) {
    return { ok: false, error: `mod for @${mod.player} has no changes; specify at least one of set_family / set_depth_yds / set_non_canonical / set_direction.` };
  }

  const variantStr = typeof fence.variant === "string" ? fence.variant : "flag_7v7";
  const oldRoute = routesArr[routeIdx] as Record<string, unknown>;
  const newRoute: Record<string, unknown> = { ...oldRoute };

  const resolvedFamily = setFamily ?? (typeof oldRoute.route_kind === "string" ? oldRoute.route_kind : null);
  // Resolve direction: explicit mod override wins, else preserve the
  // route's existing direction field (so depth-only edits don't lose
  // it), else null (template default applies).
  const resolvedDirection: "left" | "right" | null =
    setDirection ?? (oldRoute.direction === "left" || oldRoute.direction === "right" ? oldRoute.direction : null);

  if ((setFamily || setDepth !== null || setDirection !== null) && resolvedFamily) {
    const template = findTemplate(resolvedFamily);
    if (!template) {
      return { ok: false, error: `unknown route family "${resolvedFamily}" — use a catalog name (Slant, Curl, Drag, Dig, etc.).` };
    }
    const carrierX = typeof carrier.x === "number" ? carrier.x : 0;
    const carrierY = typeof carrier.y === "number" ? carrier.y : 0;
    const fieldWidthYds = fieldWidthFor(variantStr);
    const xSign = resolvedDirection === "left" ? -1
      : resolvedDirection === "right" ? 1
      : template.directional !== false ? (carrierX >= 0 ? 1 : -1)
      : 1;
    const templateMaxYNorm = Math.max(...template.points.map((p) => p.y));
    const templateMaxYds = templateMaxYNorm * FIELD_LENGTH_YDS;
    const yScale = setDepth !== null && templateMaxYds > 0.5 ? setDepth / templateMaxYds : 1;
    const waypoints = template.points[0]?.x === 0 && template.points[0]?.y === 0
      ? template.points.slice(1)
      : template.points;
    const path = waypoints.map(({ x, y }) => {
      const xYds = carrierX + x * fieldWidthYds * xSign;
      const yYds = carrierY + y * yScale * FIELD_LENGTH_YDS;
      return [Math.round(xYds * 10) / 10, Math.round(yYds * 10) / 10] as [number, number];
    });
    newRoute.path = path;
    newRoute.route_kind = template.name;
    newRoute.curve = (template.shapes ?? []).some((s) => s === "curve");
    if (resolvedDirection) newRoute.direction = resolvedDirection;
  }
  if (setNonCanonical !== null) {
    if (setNonCanonical) newRoute.nonCanonical = true;
    else delete newRoute.nonCanonical;
  }

  const newRoutes = [...routesArr] as Array<Record<string, unknown>>;
  newRoutes[routeIdx] = newRoute;
  const summary: string[] = [];
  if (setFamily) summary.push(`family→${setFamily}`);
  if (setDepth !== null) summary.push(`depth→${setDepth}yd`);
  if (setNonCanonical !== null) summary.push(`nonCanonical→${setNonCanonical}`);
  if (setDirection !== null) summary.push(`direction→${setDirection}`);

  return {
    ok: true,
    fence: { ...fence, routes: newRoutes as Fence["routes"] },
    appliedSummary: `@${mod.player}: ${summary.join(", ")}`,
  };
}

/** A snapshot of player identity used to verify identity-preservation
 *  across a batch of mods. Two snapshots are "identical" when every
 *  player has the same id, x, y, and team. */
type PlayerIdentity = { id: string; x: number; y: number; team: string };
function snapshotIdentity(fence: Fence): PlayerIdentity[] {
  const out: PlayerIdentity[] = [];
  for (const p of (Array.isArray(fence.players) ? fence.players : []) as Array<Record<string, unknown>>) {
    if (typeof p?.id !== "string") continue;
    out.push({
      id: p.id,
      x: typeof p.x === "number" ? p.x : NaN,
      y: typeof p.y === "number" ? p.y : NaN,
      team: typeof p.team === "string" ? p.team : "O",
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

function identitiesEqual(a: PlayerIdentity[], b: PlayerIdentity[], tolerance = 0.05): string | null {
  if (a.length !== b.length) {
    return `player count changed (${a.length} → ${b.length}). Mods cannot add or remove players.`;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) {
      return `player set changed (id "${a[i].id}" → "${b[i].id}"). Mods cannot rename players.`;
    }
    if (a[i].team !== b[i].team) {
      return `@${a[i].id}'s team changed ("${a[i].team}" → "${b[i].team}"). Mods cannot reassign players to a different side.`;
    }
    if (Math.abs(a[i].x - b[i].x) > tolerance || Math.abs(a[i].y - b[i].y) > tolerance) {
      return `@${a[i].id}'s position changed ((${a[i].x}, ${a[i].y}) → (${b[i].x}, ${b[i].y})). Mods cannot reposition players — call place_offense to change formation.`;
    }
  }
  return null;
}

export type ApplyRouteModsResult =
  | { ok: true; fence: Fence; appliedSummaries: string[] }
  | { ok: false; errors: string[] };

/** Apply a batch of mods to a fence with identity-preservation
 *  enforcement. Returns ok+fence on success, or ok=false with the
 *  per-mod errors. The fence is sanitized at the end so any clamping
 *  the mods introduced gets cleaned up before the caller sees it. */
export function applyRouteMods(
  priorFenceJson: string,
  mods: RouteMod[],
  variantOverride?: SportVariant,
): ApplyRouteModsResult {
  if (!priorFenceJson || priorFenceJson.trim() === "") {
    return { ok: false, errors: ["prior_play_fence is required (copy the previous ```play fence verbatim)."] };
  }
  let fence: Fence;
  try {
    fence = JSON.parse(priorFenceJson) as Fence;
  } catch (e) {
    return { ok: false, errors: [`could not parse prior_play_fence as JSON: ${(e as Error).message}`] };
  }
  if (!Array.isArray(fence.players) || fence.players.length === 0) {
    return { ok: false, errors: ["prior_play_fence has no players[] — nothing to revise."] };
  }
  if (!Array.isArray(mods) || mods.length === 0) {
    return { ok: false, errors: ["mods array is empty — pass at least one route mod."] };
  }

  const beforeIdentity = snapshotIdentity(fence);
  const errors: string[] = [];
  const summaries: string[] = [];
  let working: Fence = fence;
  for (const mod of mods) {
    const r = applyRouteMod(working, mod);
    if (!r.ok) {
      errors.push(r.error);
      continue;
    }
    working = r.fence;
    summaries.push(r.appliedSummary);
  }
  if (errors.length > 0) return { ok: false, errors };

  const afterIdentity = snapshotIdentity(working);
  const identityIssue = identitiesEqual(beforeIdentity, afterIdentity);
  if (identityIssue) {
    // This should be impossible given applyRouteMod doesn't touch
    // players[] — but if a future change adds player-mutating logic,
    // this guard catches it. Better to fail loudly than silently
    // ship a play with shifted players.
    return { ok: false, errors: [`identity-preservation violated: ${identityIssue}`] };
  }

  // Sanitize at the boundary — drop/clamp any corrupt elements the
  // upstream fence had OR that mods could have introduced (e.g. a
  // mod with set_depth_yds=1000 producing a route waypoint outside
  // the field). This is the same sanitizer the renderer uses, so
  // tools and renderer stay in sync.
  const sanitized = sanitizeCoachDiagram(
    working as CoachDiagram,
    variantOverride ?? (typeof working.variant === "string" ? (working.variant as SportVariant) : undefined),
  );

  const finalFence: Fence = {
    ...working,
    players: sanitized.diagram.players,
    routes: sanitized.diagram.routes,
    zones: sanitized.diagram.zones,
  };

  return { ok: true, fence: finalFence, appliedSummaries: summaries };
}
