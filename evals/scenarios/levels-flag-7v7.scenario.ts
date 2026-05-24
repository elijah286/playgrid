/**
 * Levels in flag_7v7 — high-low on the underneath LB.
 *
 * Catalog spec: In at 6-8 (low) + Dig at 10-14 (high), both breaking
 * inside on the same side. The shallow In sucks the LB up; the Dig
 * hits the void behind him.
 *
 * Added 2026-05-25 as part of the eval coverage expansion.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import {
  fenceCount,
  fenceVariant,
  fenceHasNoIdleOffensivePlayers,
} from "../assertions/fence";

const scenario: Scenario = {
  name: "levels-flag-7v7",
  description:
    "Levels in flag_7v7 → compose_play emits the In/Dig combo at differentiated depths",
  origin: "eval coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "flag_7v7",
    playbookId: "eval-levels-7v7",
    playbookName: "Eval — Flag 7v7",
  },
  chat: [
    { role: "user", text: "Build me a Levels play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "levels";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("flag_7v7"),
    fenceHasNoIdleOffensivePlayers(),
    // Both an In AND a Dig must appear, AND the Dig must be deeper
    // than the In (the whole point of the high-low concept).
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ from?: string; route_kind?: string; path?: [number, number][] }> | undefined) ?? [];
      const inRoute = routes.find((r) => (r.route_kind ?? "").toLowerCase() === "in");
      const digRoute = routes.find((r) => (r.route_kind ?? "").toLowerCase() === "dig");
      if (!inRoute || !digRoute) {
        return {
          ok: false as const,
          description: "Levels must include both an In and a Dig",
          details: `route_kinds: [${routes.map((r) => r.route_kind ?? "?").join(", ")}]`,
        };
      }
      const maxY = (r: { path?: [number, number][] }) =>
        Math.max(...(r.path ?? []).map((p) => p[1]));
      const inDepth = maxY(inRoute);
      const digDepth = maxY(digRoute);
      if (digDepth <= inDepth) {
        return {
          ok: false as const,
          description: "Levels Dig must be DEEPER than the In (high/low on the LB)",
          details: `In depth=${inDepth.toFixed(1)}yd; Dig depth=${digDepth.toFixed(1)}yd`,
        };
      }
      return {
        ok: true as const,
        description: `In@${inDepth.toFixed(1)}yd + Dig@${digDepth.toFixed(1)}yd (stacked correctly)`,
      };
    }),
  ],
};

export default scenario;
