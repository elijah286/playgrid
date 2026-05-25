/**
 * Drive in tackle_11 — Drag at 2-4yd (under, the rub) + Dig at 10-14yd
 * (over, the void route). Two crossers attacking the middle at
 * differentiated depths. Often paired with a backside clear.
 *
 * Catalog output: H=Drag, X=Dig, Z=Go, S=Sit, B=Flat.
 *
 * Added 2026-05-25 — Drive had no eval coverage anywhere.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import { fenceCount, fenceVariant, fenceHasNoIdleOffensivePlayers } from "../assertions/fence";

const scenario: Scenario = {
  name: "drive-tackle-11",
  description:
    "Drive in tackle_11 → compose_play emits Drag + Dig at differentiated depths",
  origin: "concept coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-drive-tackle",
    playbookName: "Eval — Tackle 11",
  },
  chat: [
    { role: "user", text: "Build a Drive play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "drive";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("tackle_11"),
    fenceHasNoIdleOffensivePlayers(),
    // Drive's signature: Drag + Dig at differentiated depths.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ route_kind?: string; path?: [number, number][] }> | undefined) ?? [];
      const drag = routes.find((r) => (r.route_kind ?? "").toLowerCase() === "drag");
      const dig = routes.find((r) => (r.route_kind ?? "").toLowerCase() === "dig");
      if (!drag || !dig) {
        return {
          ok: false as const,
          description: "Drive must include both Drag + Dig (the two crossers)",
          details: `present: [${[...new Set(routes.map((r) => r.route_kind))].join(", ")}]`,
        };
      }
      const dragDepth = Math.max(...(drag.path ?? []).map((p) => p[1]));
      const digDepth = Math.max(...(dig.path ?? []).map((p) => p[1]));
      if (digDepth - dragDepth < 4) {
        return {
          ok: false as const,
          description: "Drive's Dig must be ≥4yd deeper than its Drag (differentiated crossers)",
          details: `Drag@${dragDepth.toFixed(1)}yd, Dig@${digDepth.toFixed(1)}yd`,
        };
      }
      return { ok: true as const, description: `Drag@${dragDepth.toFixed(1)}yd + Dig@${digDepth.toFixed(1)}yd` };
    }),
  ],
};

export default scenario;
