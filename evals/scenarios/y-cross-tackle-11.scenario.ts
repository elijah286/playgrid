/**
 * Y-Cross in tackle_11 — cross-variant coverage.
 *
 * Tackle Y-Cross: Y=Dig (the TE's deep cross), X=Post (clear),
 * B=Flat (outlet), Z=Go, H=Drag. The triangle stretch (Dig + Post + Flat).
 *
 * Added 2026-05-25 as part of the cross-variant Y-Cross coverage.
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
  name: "y-cross-tackle-11",
  description:
    "Y-Cross in tackle_11 → compose_play emits the canonical triangle (Dig + Post + Flat) with @Y running the Dig",
  origin: "cross-variant coverage 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-y-cross-tackle",
    playbookName: "Eval — Tackle 11",
  },
  chat: [
    { role: "user", text: "Build a Y-Cross play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c.includes("y-cross") || c.includes("y cross") || c === "ycross";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("tackle_11"),
    fenceHasNoIdleOffensivePlayers(),
    fenceHasRouteFor("Y", "Dig"),
    // The triangle: Dig + Post + Flat.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ route_kind?: string }> | undefined) ?? [];
      const kinds = new Set(routes.map((r) => (r.route_kind ?? "").toLowerCase()));
      const need = ["dig", "post", "flat"];
      const missing = need.filter((k) => !kinds.has(k));
      if (missing.length > 0) {
        return {
          ok: false as const,
          description: "Y-Cross must include Dig + Post + Flat (the triangle)",
          details: `missing: [${missing.join(", ")}]; present: [${[...kinds].join(", ")}]`,
        };
      }
      return { ok: true as const, description: "triangle present: Dig + Post + Flat" };
    }),
  ],
};

export default scenario;
