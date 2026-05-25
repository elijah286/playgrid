/**
 * Slant-Flat in tackle_11 — quick-game pick play.
 *
 * Outside Slant + inside-out Flat creates a horizontal pick on the
 * flat defender. Catalog output: Z=Slant, B=Flat, S=Sit, X=Go, H=Drag.
 *
 * Added 2026-05-25 — Slant-Flat had no eval coverage anywhere.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import { fenceCount, fenceVariant, fenceHasNoIdleOffensivePlayers } from "../assertions/fence";

const scenario: Scenario = {
  name: "slant-flat-tackle-11",
  description:
    "Slant-Flat in tackle_11 → compose_play emits a Slant + Flat horizontal pick",
  origin: "concept coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-slant-flat-tackle",
    playbookName: "Eval — Tackle 11",
  },
  chat: [
    { role: "user", text: "Build a Slant-Flat play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "slant-flat" || c === "slant flat" || c === "slantflat";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("tackle_11"),
    fenceHasNoIdleOffensivePlayers(),
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ route_kind?: string }> | undefined) ?? [];
      const kinds = new Set(routes.map((r) => (r.route_kind ?? "").toLowerCase()));
      if (!kinds.has("slant") || !kinds.has("flat")) {
        return {
          ok: false as const,
          description: "Slant-Flat must include both Slant + Flat",
          details: `present: [${[...kinds].join(", ")}]`,
        };
      }
      return { ok: true as const, description: "Slant + Flat present" };
    }),
  ],
};

export default scenario;
