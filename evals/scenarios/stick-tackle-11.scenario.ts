/**
 * Stick in tackle_11 — slot Sit (5-7yd) + back/slot Flat (0-4yd).
 *
 * Per the catalog cheat sheet: "Stick: slot Sit at 5-7 yds + back/slot
 * Flat at 0-4 yds." High-low on the underneath defender from a slot
 * receiver. Catalog output: S=Sit, B=Flat, X+Z=Go (clears), H=Drag.
 *
 * Added 2026-05-25 — Stick had no eval coverage anywhere.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import { fenceCount, fenceVariant, fenceHasNoIdleOffensivePlayers } from "../assertions/fence";

const scenario: Scenario = {
  name: "stick-tackle-11",
  description:
    "Stick in tackle_11 → compose_play emits the slot Sit + Flat combo",
  origin: "concept coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-stick-tackle",
    playbookName: "Eval — Tackle 11",
  },
  chat: [
    { role: "user", text: "Build a Stick play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "stick";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("tackle_11"),
    fenceHasNoIdleOffensivePlayers(),
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ route_kind?: string }> | undefined) ?? [];
      const kinds = new Set(routes.map((r) => (r.route_kind ?? "").toLowerCase()));
      if (!kinds.has("sit") || !kinds.has("flat")) {
        return {
          ok: false as const,
          description: "Stick must include Sit + Flat (the high-low combo)",
          details: `present: [${[...kinds].join(", ")}]`,
        };
      }
      return { ok: true as const, description: "Sit + Flat present" };
    }),
  ],
};

export default scenario;
