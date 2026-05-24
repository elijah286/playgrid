/**
 * "Cut at X" terminology — Cal must interpret it as the BREAK depth,
 * not the catch point.
 *
 * Surfaced 2026-05-25 production feedback: coach had a play anchored
 * with @X on a route. Coach said "make X a Post that cuts at 8
 * yards". Cal called `modify_play_route` (or `revise_play`) with
 * `set_depth_yds: 8`. set_depth_yds applies to the CATCH point —
 * the deepest waypoint of the route. For a Post with break:catch
 * ratio ~0.73, that meant the BREAK landed at ~6 yards. The result
 * looked like a slant.
 *
 * Right interpretation: "cut at 8" = the BREAK at 8 yds. For a Post
 * (catch ~1.4x deeper than break), `set_depth_yds: 11` produces a
 * break at 8yd. Cal must do this conversion silently — the coach
 * said "8" once; Cal shouldn't pop a clarification.
 *
 * The new prompt rule (added 2026-05-25) tells Cal the mapping per
 * route family. This scenario locks it in for the Post case.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";

// Anchored 7v7 play with @X on a generic Hitch. Coach will ask for
// a Post cut at 8 — the structural assertion is that Cal's edit
// targets @X with set_depth_yds in the 10-12 range (catch point
// matching an 8-yd break for the Post template's ratio).
const ANCHOR_FENCE = JSON.stringify({
  title: "Spread Doubles — Hitches",
  variant: "flag_7v7",
  focus: "O",
  players: [
    { id: "QB", x: 0, y: -5, team: "O" },
    { id: "C", x: 0, y: 0, team: "O" },
    { id: "X", x: -12, y: 0, team: "O" },
    { id: "Z", x: 12, y: 0, team: "O" },
    { id: "H", x: -7, y: 0, team: "O" },
    { id: "S", x: 7, y: 0, team: "O" },
    { id: "B", x: 4, y: -5, team: "O" },
  ],
  routes: [
    { from: "X", path: [[-12, 5]], route_kind: "Hitch", curve: true },
    { from: "Z", path: [[12, 5]], route_kind: "Hitch", curve: true },
    { from: "H", path: [[-4, 8]], route_kind: "Drag" },
    { from: "S", path: [[10, 6]], route_kind: "Out" },
    { from: "B", path: [[6, -3], [10, -1]], route_kind: "Flat" },
  ],
});

const scenario: Scenario = {
  name: "cut-at-yards-post",
  description:
    "Coach says 'make X a Post that cuts at 8 yards' → Cal sets set_depth_yds in the 10-12 range (catch matches an 8-yd break), not 8 directly",
  origin: "production feedback 2026-05-25 ('cut at 8' produced break at 6yd, looked slant-like)",
  type: "positive",
  context: {
    sportVariant: "flag_7v7",
    playbookId: "eval-cut-at-yards",
    playbookName: "Eval — Flag 7v7",
    playId: "eval-post-cut",
    anchoredPlayDiagramText: ANCHOR_FENCE,
  },
  chat: [
    { role: "user", text: "Change @X to a Post that cuts at about 8 yards" },
  ],
  assertions: [
    // Cal must call an edit tool.
    ((cap) => {
      const calls = cap.toolCalls.map((c) => c.name);
      if (!calls.includes("revise_play") && !calls.includes("modify_play_route")) {
        return {
          ok: false as const,
          description: "Cal must call revise_play or modify_play_route",
          details: `tools called: ${calls.join(", ") || "(none)"}`,
        };
      }
      return { ok: true as const, description: "Cal called an edit tool" };
    }),

    // The edit must target @X and request a Post family.
    // `revise_play` uses `mods: [{player, set_family, set_depth_yds}]`;
    // `modify_play_route` uses top-level `{player, set_family, set_depth_yds}`.
    ((cap) => {
      const editCalls = cap.toolCalls.filter(
        (c) => c.name === "revise_play" || c.name === "modify_play_route",
      );
      for (const call of editCalls) {
        // revise_play path
        const mods = call.input["mods"] as Array<{ player?: string; set_family?: string }> | undefined;
        if (Array.isArray(mods)) {
          for (const m of mods) {
            if (m.player === "X" && typeof m.set_family === "string" && /post/i.test(m.set_family)) {
              return { ok: true as const, description: "edit targets @X with Post family" };
            }
          }
        }
        // modify_play_route path
        const pid = call.input["player"];
        const setFamily = call.input["set_family"];
        if (pid === "X" && typeof setFamily === "string" && /post/i.test(setFamily)) {
          return { ok: true as const, description: "modify_play_route targets @X with Post" };
        }
      }
      return {
        ok: false as const,
        description: "edit must target @X with a Post family change",
        details: `edit calls: ${JSON.stringify(editCalls.map((c) => c.input)).slice(0, 240)}`,
      };
    }),

    // The CORE assertion: depth applied must reflect break-at-8, not
    // catch-at-8. For Post (catch:break ratio ≈ 1.4), an 8-yd break
    // means a catch around 11 yards. Accept anything in the 9-13
    // range (gives Cal some interpretive flexibility but excludes
    // the "set_depth_yds: 8" wrong-interpretation case that produces
    // a slant-like 6-yd break).
    ((cap) => {
      const editCalls = cap.toolCalls.filter(
        (c) => c.name === "revise_play" || c.name === "modify_play_route",
      );
      const depthsApplied: number[] = [];
      for (const call of editCalls) {
        const mods = call.input["mods"] as Array<{ player?: string; set_depth_yds?: number }> | undefined;
        if (Array.isArray(mods)) {
          for (const m of mods) {
            if (m.player === "X" && typeof m.set_depth_yds === "number") {
              depthsApplied.push(m.set_depth_yds);
            }
          }
        }
        const pid = call.input["player"];
        const depth = call.input["set_depth_yds"];
        if (pid === "X" && typeof depth === "number") {
          depthsApplied.push(depth);
        }
      }
      if (depthsApplied.length === 0) {
        // Allowed: Cal might not pass depth at all if it trusts the
        // template default. The Post template's natural depth after
        // 2026-05-25 catalog change is 11-yd catch / 8-yd break —
        // exactly what the coach asked for, so no override needed.
        return {
          ok: true as const,
          description: "no explicit depth override — template default (catch=11, break=8) matches request",
        };
      }
      const d = depthsApplied[0];
      if (d >= 9 && d <= 13) {
        return {
          ok: true as const,
          description: `set_depth_yds=${d} produces a break in the 7-9yd range (target: 8)`,
        };
      }
      return {
        ok: false as const,
        description: "set_depth_yds for the Post must produce a break around 8yd (catch in 9-13 range, NOT set_depth_yds=8 which gives break=6)",
        details: `depths applied to @X: [${depthsApplied.join(", ")}]; for break-at-8 on Post, expected catch in 9-13`,
      };
    }),
  ],
};

export default scenario;
