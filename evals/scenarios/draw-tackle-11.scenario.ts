/**
 * Draw in tackle_11 — delayed handoff disguised as a pass.
 *
 * Catalog (buildSingleHandoffRun → "draw"): QB drops back and pumps,
 * then hands to B who waits for the rush to commit upfield before
 * accepting. Requires handoff_chain capability.
 *
 * Added 2026-05-25 as part of the eval coverage expansion.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import { fenceCount, fenceVariant } from "../assertions/fence";

const scenario: Scenario = {
  name: "draw-tackle-11",
  description:
    "Draw in tackle_11 → compose_play emits B with a delayed inside carry",
  origin: "eval coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-draw-11",
    playbookName: "Eval — Tackle 11",
  },
  chat: [
    { role: "user", text: "Build a Draw play. Handoff chain is already enabled on the playbook." },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "draw";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("tackle_11"),
    // Draw should have a non-QB ballcarrier with a forward carry.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ from?: string; route_kind?: string; path?: [number, number][] }> | undefined) ?? [];
      const carries = routes.filter((r) => r.route_kind === "carry" && r.from !== "QB");
      if (carries.length === 0) {
        return {
          ok: false as const,
          description: "Draw must include at least one non-QB carry",
          details: `route_kinds: [${routes.map((r) => `${r.from}=${r.route_kind ?? "?"}`).join(", ")}]`,
        };
      }
      const ballcarrier = carries[0];
      const lastPt = (ballcarrier.path ?? [])[ballcarrier.path?.length ? ballcarrier.path.length - 1 : 0];
      // Must end forward (y > carrier's start y).
      if (!lastPt || lastPt[1] < 0) {
        return {
          ok: false as const,
          description: "Draw carry must end past the LOS (forward run)",
          details: `${ballcarrier.from} carry ends at (${lastPt?.[0] ?? "?"}, ${lastPt?.[1] ?? "?"})`,
        };
      }
      return {
        ok: true as const,
        description: `@${ballcarrier.from} draws to (${lastPt[0]}, ${lastPt[1]})`,
      };
    }),
  ],
};

export default scenario;
