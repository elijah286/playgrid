/**
 * Snag in tackle_11 — cross-variant coverage.
 *
 * Tackle Snag triangle: S=Spot (sit underneath), Z=Corner (deep),
 * B=Flat (outlet). X=Go (backside clear), H=Drag.
 *
 * Added 2026-05-25 as part of the cross-variant Snag coverage. Pairs
 * with snag-flag-5v5 + snag-flag-6v6 to catch catalog regressions
 * across all three variants.
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
  name: "snag-tackle-11",
  description:
    "Snag in tackle_11 → compose_play emits the canonical triangle (Spot + Corner + Flat)",
  origin: "cross-variant coverage 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-snag-tackle",
    playbookName: "Eval — Tackle 11",
  },
  chat: [
    { role: "user", text: "Build a Snag play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "snag";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("tackle_11"),
    fenceHasNoIdleOffensivePlayers(),
    fenceHasRouteFor("Z"),
    fenceHasRouteFor("B"),
    // The Snag triangle: Spot + Corner + Flat.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ route_kind?: string }> | undefined) ?? [];
      const kinds = new Set(routes.map((r) => (r.route_kind ?? "").toLowerCase()));
      const need = ["spot", "corner", "flat"];
      const missing = need.filter((k) => !kinds.has(k));
      if (missing.length > 0) {
        return {
          ok: false as const,
          description: "Snag must include Spot + Corner + Flat (the triangle)",
          details: `missing: [${missing.join(", ")}]; present: [${[...kinds].join(", ")}]`,
        };
      }
      return { ok: true as const, description: "triangle present: Spot + Corner + Flat" };
    }),
  ],
};

export default scenario;
