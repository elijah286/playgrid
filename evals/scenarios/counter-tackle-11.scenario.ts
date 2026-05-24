/**
 * Counter in tackle_11 — misdirection run with backside pulling
 * blockers (a guard + a tackle, classically Counter Trey).
 *
 * Catalog (buildSingleHandoffRun → "counter"): QB hands to B; B steps
 * opposite direction first to sell flow, then cuts back behind the
 * pulling blockers. Requires handoff_chain capability.
 *
 * Added 2026-05-25 as part of the eval coverage expansion.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import { fenceCount, fenceVariant } from "../assertions/fence";

const scenario: Scenario = {
  name: "counter-tackle-11",
  description:
    "Counter in tackle_11 → compose_play emits B carrying with a misdirection step (path bends)",
  origin: "eval coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-counter-11",
    playbookName: "Eval — Tackle 11",
  },
  chat: [
    { role: "user", text: "Build a Counter play. Handoff chain is already enabled on the playbook." },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "counter";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("tackle_11"),
    // Counter's carry should have multiple waypoints (the
    // misdirection bend). At least 2 waypoints in the path.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ from?: string; route_kind?: string; path?: [number, number][] }> | undefined) ?? [];
      const carries = routes.filter((r) => r.route_kind === "carry" && r.from !== "QB");
      if (carries.length === 0) {
        return {
          ok: false as const,
          description: "Counter must include at least one non-QB carry",
          details: `route_kinds: [${routes.map((r) => `${r.from}=${r.route_kind ?? "?"}`).join(", ")}]`,
        };
      }
      const ballcarrier = carries[0];
      const pathLen = (ballcarrier.path ?? []).length;
      if (pathLen < 2) {
        return {
          ok: false as const,
          description: "Counter carry should have a multi-step path (misdirection bend)",
          details: `${ballcarrier.from} path length=${pathLen}`,
        };
      }
      return {
        ok: true as const,
        description: `@${ballcarrier.from} counter carry has ${pathLen} waypoints`,
      };
    }),
  ],
};

export default scenario;
