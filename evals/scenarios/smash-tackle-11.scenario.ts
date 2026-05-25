/**
 * Smash in tackle_11 — cross-variant coverage.
 *
 * Tackle Smash combo: Z=Hitch (low) + S=Corner (high) — the classic
 * high-low on the flat defender. X=Go (clear), B=Flat, H=Drag.
 *
 * Added 2026-05-25 as part of the cross-variant Smash coverage.
 * Pairs with smash-flag-6v6.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import {
  fenceCount,
  fenceVariant,
  fenceHasRouteFor,
  fenceHasNoIdleOffensivePlayers,
} from "../assertions/fence";

const scenario: Scenario = {
  name: "smash-tackle-11",
  description:
    "Smash in tackle_11 → compose_play emits the canonical Hitch + Corner high-low",
  origin: "cross-variant coverage 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-smash-tackle",
    playbookName: "Eval — Tackle 11",
  },
  chat: [
    { role: "user", text: "Build a Smash play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "smash";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("tackle_11"),
    fenceHasNoIdleOffensivePlayers(),
    // Smash signature: Hitch (low) + Corner (high), same side.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ from?: string; route_kind?: string; path?: [number, number][] }> | undefined) ?? [];
      const hitch = routes.find((r) => (r.route_kind ?? "").toLowerCase() === "hitch");
      const corner = routes.find((r) => (r.route_kind ?? "").toLowerCase() === "corner");
      if (!hitch || !corner) {
        return {
          ok: false as const,
          description: "Smash must include Hitch + Corner",
          details: `route_kinds present: [${[...new Set(routes.map((r) => r.route_kind))].join(", ")}]`,
        };
      }
      // Corner must be deeper than Hitch (high-low).
      const hitchY = Math.max(...(hitch.path ?? []).map((p) => p[1]));
      const cornerY = Math.max(...(corner.path ?? []).map((p) => p[1]));
      if (cornerY <= hitchY) {
        return {
          ok: false as const,
          description: "Smash Corner must be DEEPER than the Hitch (high-low on the flat defender)",
          details: `Hitch depth=${hitchY.toFixed(1)}yd; Corner depth=${cornerY.toFixed(1)}yd`,
        };
      }
      return { ok: true as const, description: `Hitch@${hitchY.toFixed(1)}yd + Corner@${cornerY.toFixed(1)}yd (stacked)` };
    }),
  ],
};

export default scenario;
