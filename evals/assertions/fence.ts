/**
 * Assertions on the ```play fence(s) Cal emitted.
 *
 * The runner parses every ```play block in Cal's final reply and
 * feeds them into `cap.playFences`. These helpers inspect that array.
 *
 * Examples:
 *   fenceCount({ exact: 1 })
 *   fenceCount({ max: 3 })          // 3-fence cap
 *   fenceHasRouteFor("Y")
 *   fenceHasFormation("Trips Bunch")
 *   fenceVariant("flag_5v5")
 *   fenceHasNoIdlePlayers()         // every non-QB has a route/carry/block
 */

import type { Assertion, RunCapture } from "../types";

function firstFence(cap: RunCapture): Record<string, unknown> | null {
  return cap.playFences[0] ?? null;
}

/** Cal must have emitted the specified number of fences. */
export function fenceCount(bounds: { min?: number; max?: number; exact?: number }): Assertion {
  return (cap) => {
    const n = cap.playFences.length;
    if (bounds.exact !== undefined && n !== bounds.exact) {
      return {
        ok: false,
        description: `reply must contain exactly ${bounds.exact} fence(s)`,
        details: `actual: ${n}`,
      };
    }
    if (bounds.min !== undefined && n < bounds.min) {
      return { ok: false, description: `reply must contain ≥${bounds.min} fence(s)`, details: `actual: ${n}` };
    }
    if (bounds.max !== undefined && n > bounds.max) {
      return { ok: false, description: `reply must contain ≤${bounds.max} fence(s)`, details: `actual: ${n}` };
    }
    return { ok: true, description: `fence count = ${n}` };
  };
}

type FenceShape = {
  variant?: string;
  title?: string;
  players?: Array<{ id?: string; team?: string }>;
  routes?: Array<{ from?: string; route_kind?: string; path?: unknown }>;
};

function firstFenceTyped(cap: RunCapture): FenceShape | null {
  const f = firstFence(cap);
  return f as FenceShape | null;
}

/** The first fence's variant matches the expected string. */
export function fenceVariant(expected: string): Assertion {
  return (cap) => {
    const f = firstFenceTyped(cap);
    if (!f) return { ok: false, description: `expected fence variant ${expected}`, details: "no fence emitted" };
    if (f.variant !== expected) {
      return { ok: false, description: `fence variant should be ${expected}`, details: `actual: ${f.variant}` };
    }
    return { ok: true, description: `fence variant = ${expected}` };
  };
}

/** The first fence contains a route from the named player. */
export function fenceHasRouteFor(playerId: string, routeKind?: string): Assertion {
  return (cap) => {
    const f = firstFenceTyped(cap);
    if (!f) return { ok: false, description: `expected route for @${playerId}`, details: "no fence emitted" };
    const routes = f.routes ?? [];
    const match = routes.find((r) => r?.from === playerId);
    if (!match) {
      return {
        ok: false,
        description: `fence must have route for @${playerId}`,
        details: `routes present: ${routes.map((r) => `@${r?.from}`).join(", ") || "(none)"}`,
      };
    }
    if (routeKind !== undefined && match.route_kind !== routeKind) {
      return {
        ok: false,
        description: `@${playerId}'s route_kind should be ${routeKind}`,
        details: `actual: ${match.route_kind ?? "(none)"}`,
      };
    }
    return { ok: true, description: `fence has route for @${playerId}` };
  };
}

/** Every offensive non-QB player in the first fence has a route. The
 *  validator's missing-action gate enforces this server-side; this
 *  assertion catches "Cal shipped a fence that fails save-time" at
 *  eval time. */
export function fenceHasNoIdleOffensivePlayers(): Assertion {
  return (cap) => {
    const f = firstFenceTyped(cap);
    if (!f) return { ok: false, description: "fence must cover every offensive player", details: "no fence emitted" };
    const offense = (f.players ?? []).filter((p) => p?.team !== "D");
    const routedIds = new Set((f.routes ?? []).map((r) => r?.from));
    const idle = offense
      .filter((p) => p?.id && p.id !== "QB" && p.id !== "Q" && !routedIds.has(p.id))
      .map((p) => `@${p.id}`);
    if (idle.length > 0) {
      return {
        ok: false,
        description: "every non-QB offensive player should have a route",
        details: `idle players: ${idle.join(", ")}`,
      };
    }
    return { ok: true, description: "no idle offensive players" };
  };
}

/** The first fence's title matches the regex. Useful for catching
 *  "Cal labeled a Spread Doubles 'Bunch Right'" mismatches. */
export function fenceTitleMatches(re: RegExp): Assertion {
  return (cap) => {
    const f = firstFenceTyped(cap);
    if (!f) return { ok: false, description: `fence title must match ${re}`, details: "no fence emitted" };
    if (!f.title || !re.test(f.title)) {
      return { ok: false, description: `fence title must match ${re}`, details: `actual: ${f.title ?? "(none)"}` };
    }
    return { ok: true, description: `fence title matches ${re}` };
  };
}

/** The first fence contains a defender (team="D"). Catches "compose
 *  defense returned only offense" cases. */
export function fenceHasDefenders(): Assertion {
  return (cap) => {
    const f = firstFenceTyped(cap);
    if (!f) return { ok: false, description: "fence must contain defenders", details: "no fence emitted" };
    const defenders = (f.players ?? []).filter((p) => p?.team === "D");
    if (defenders.length === 0) {
      return {
        ok: false,
        description: "fence must contain defenders",
        details: `players: ${(f.players ?? []).map((p) => `@${p?.id}`).join(", ") || "(none)"}`,
      };
    }
    return { ok: true, description: `fence has ${defenders.length} defender(s)` };
  };
}
