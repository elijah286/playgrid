/**
 * Mesh in flag_5v5 — cross-variant coverage.
 *
 * 5v5 roster (Q, C, X, Y, Z) with center-eligible. The 5v5 Mesh
 * skeleton has @Y + @C both running Drags (the two crossing drags)
 * with @X on a Curl and @Z on a Go.
 *
 * Added 2026-05-25 — fills the Mesh × variant matrix. We already
 * had mesh-flag-7v7, mesh-flag-6v6, and mesh-tackle-11.
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
  name: "mesh-flag-5v5",
  description:
    "Mesh in flag_5v5 → compose_play emits two Drags (Y + C) with all 4 non-QB players routed (center IS eligible in 5v5)",
  origin: "cross-variant Mesh coverage 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "flag_5v5",
    playbookId: "eval-mesh-5v5",
    playbookName: "Eval — Flag 5v5",
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
    fenceVariant("flag_5v5"),
    // In 5v5, center IS eligible — fenceHasNoIdleOffensivePlayers
    // enforces this. The Mesh skeleton must route @C.
    fenceHasNoIdleOffensivePlayers(),
    fenceHasRouteFor("Y"),
    fenceHasRouteFor("C"),
    fenceHasRouteFor("X"),
    fenceHasRouteFor("Z"),
    // Two Drags at differentiated depths (the cross).
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ route_kind?: string; path?: [number, number][] }> | undefined) ?? [];
      const drags = routes.filter((r) => (r.route_kind ?? "").toLowerCase() === "drag");
      if (drags.length < 2) {
        return {
          ok: false as const,
          description: "5v5 Mesh must have ≥2 Drag routes (Y + C)",
          details: `drags: ${drags.length}`,
        };
      }
      return { ok: true as const, description: `${drags.length} Drag routes` };
    }),
  ],
};

export default scenario;
