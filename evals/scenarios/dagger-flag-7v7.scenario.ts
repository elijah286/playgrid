/**
 * Dagger in flag_7v7 — Seam clears the safety; Dig hits the vacated zone.
 *
 * Catalog spec: Seam at 14+ (the vertical clear) + Dig at 14-16 (the
 * void route). Best vs single-high — the seam pulls the deep safety;
 * the dig hits behind the LB and in front of the safety's vacated zone.
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
  name: "dagger-flag-7v7",
  description:
    "Dagger in flag_7v7 → compose_play emits Seam (vertical clear) + Dig (void route) on the same side",
  origin: "eval coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "flag_7v7",
    playbookId: "eval-dagger-7v7",
    playbookName: "Eval — Flag 7v7",
  },
  chat: [
    { role: "user", text: "Build a Dagger play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "dagger";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("flag_7v7"),
    fenceHasNoIdleOffensivePlayers(),
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ route_kind?: string; path?: [number, number][] }> | undefined) ?? [];
      const kinds = new Set(routes.map((r) => (r.route_kind ?? "").toLowerCase()));
      if (!kinds.has("seam") || !kinds.has("dig")) {
        return {
          ok: false as const,
          description: "Dagger must include both Seam and Dig",
          details: `route_kinds present: [${[...kinds].join(", ")}]`,
        };
      }
      return { ok: true as const, description: "Seam + Dig present" };
    }),
  ],
};

export default scenario;
