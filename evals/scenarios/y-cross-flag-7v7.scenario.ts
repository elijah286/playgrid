/**
 * Y-Cross in flag_7v7 — triangle stretch (high/medium/low on same side).
 *
 * Catalog spec: Dig at 14-16 + Post at 12-18 + Flat at 0-4. The Dig is
 * the deep cross from Y/TE, the Post is the clear, the Flat is the
 * outlet.
 *
 * Added as part of the 2026-05-25 eval coverage expansion — Y-Cross
 * was one of the named concepts in the prompt cheat sheet but had no
 * end-to-end eval.
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
  name: "y-cross-flag-7v7",
  description:
    "Y-Cross in flag_7v7 → compose_play emits a triangle stretch (Dig + Post + Flat) with all 7 players covered",
  origin: "eval coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "flag_7v7",
    playbookId: "eval-y-cross-7v7",
    playbookName: "Eval — Flag 7v7",
  },
  chat: [
    { role: "user", text: "Draw me a Y-Cross play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c.includes("y-cross") || c.includes("y cross") || c === "ycross";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("flag_7v7"),
    fenceHasNoIdleOffensivePlayers(),
    // The triangle: Dig (deep cross), Post (clear), Flat (outlet).
    // We don't pin which player runs which (compose_play picks per
    // variant roster) — just that the route_kinds appear.
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
          description: "Y-Cross must include Dig + Post + Flat (catalog spec)",
          details: `missing route_kinds: [${missing.join(", ")}]; present: [${[...kinds].join(", ")}]`,
        };
      }
      return { ok: true as const, description: "all three Y-Cross route families present" };
    }),
  ],
};

export default scenario;
