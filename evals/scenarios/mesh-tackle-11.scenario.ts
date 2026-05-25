/**
 * Mesh in tackle_11 — cross-variant coverage.
 *
 * Tackle Mesh: H+S both run Drags (the two crossing drags), X=Curl,
 * Z=Go, B=Flat. The drags should be at differentiated depths so the
 * cross reads clearly above the OL.
 *
 * Added 2026-05-25 as part of the cross-variant Mesh coverage. Pairs
 * with mesh-flag-7v7 (and mesh-flag-6v6) to catch any catalog
 * change that breaks Mesh in tackle.
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
  name: "mesh-tackle-11",
  description:
    "Mesh in tackle_11 → compose_play emits two Drags at differentiated depths + Curl + Go + Flat",
  origin: "cross-variant coverage 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-mesh-tackle",
    playbookName: "Eval — Tackle 11",
  },
  chat: [
    { role: "user", text: "Draw me a Mesh play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "mesh";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("tackle_11"),
    fenceHasNoIdleOffensivePlayers(),
    fenceHasRouteFor("H"),
    fenceHasRouteFor("S"),
    fenceHasRouteFor("X"),
    fenceHasRouteFor("Z"),
    fenceHasRouteFor("B"),
    // Two Drags at meaningfully different depths (the cross must
    // read clearly above the OL).
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ from?: string; route_kind?: string; path?: [number, number][] }> | undefined) ?? [];
      const drags = routes.filter((r) => (r.route_kind ?? "").toLowerCase() === "drag");
      if (drags.length < 2) {
        return {
          ok: false as const,
          description: "Mesh must have ≥2 Drag routes (the cross)",
          details: `drags: ${drags.length}`,
        };
      }
      const depths = drags.map((d) => Math.max(...(d.path ?? []).map((p) => p[1])));
      const diff = Math.abs(depths[0] - depths[1]);
      if (diff < 3) {
        return {
          ok: false as const,
          description: "Mesh drags must be ≥3yd apart in depth for visual differentiation",
          details: `depths: [${depths.map((d) => d.toFixed(1)).join(", ")}]; diff=${diff.toFixed(1)}`,
        };
      }
      return { ok: true as const, description: `drag depths: [${depths.map((d) => d.toFixed(1)).join(", ")}], diff=${diff.toFixed(1)}yd` };
    }),
  ],
};

export default scenario;
