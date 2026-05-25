/**
 * Y-Cross in flag_5v5 — cross-variant coverage.
 *
 * 5v5 roster (Q, C, X, Y, Z) with center-eligible. The 5v5 Y-Cross
 * skeleton: @Y on the Dig (the deep cross), @X on the Post (clear),
 * @C on the Flat (eligible center outlet), @Z on the Go.
 *
 * Added 2026-05-25 — fills the Y-Cross × variant matrix. We had
 * 7v7, 6v6, tackle_11 already.
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
  name: "y-cross-flag-5v5",
  description:
    "Y-Cross in flag_5v5 → compose_play emits the triangle (Dig + Post + Flat) with center routed",
  origin: "cross-variant Y-Cross coverage 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "flag_5v5",
    playbookId: "eval-y-cross-5v5",
    playbookName: "Eval — Flag 5v5",
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
    fenceVariant("flag_5v5"),
    fenceHasNoIdleOffensivePlayers(),
    fenceHasRouteFor("Y", "Dig"),
    fenceHasRouteFor("C"),  // center must have a route in 5v5
    // Triangle: Dig + Post + Flat.
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
          description: "Y-Cross must include Dig + Post + Flat",
          details: `missing: [${missing.join(", ")}]; present: [${[...kinds].join(", ")}]`,
        };
      }
      return { ok: true as const, description: "Dig + Post + Flat present" };
    }),
  ],
};

export default scenario;
