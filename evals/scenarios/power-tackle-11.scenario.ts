/**
 * Power in tackle_11 — gap-scheme run behind a pulling backside guard.
 *
 * Catalog (buildSingleHandoffRun → "power"): QB hands to B; backside
 * guard pulls; B follows through the playside B-gap. Aliases include
 * "Power O", "Strong Power", "Down G". Requires handoff_chain.
 *
 * Added 2026-05-25 as part of the eval coverage expansion.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import { fenceCount, fenceVariant } from "../assertions/fence";

const scenario: Scenario = {
  name: "power-tackle-11",
  description:
    "Power in tackle_11 → compose_play emits a gap-scheme run with B carrying playside",
  origin: "eval coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-power-11",
    playbookName: "Eval — Tackle 11",
  },
  chat: [
    { role: "user", text: "Build a Power play. Handoff chain is already enabled on the playbook." },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      // Power's aliases per prompt cheat sheet: "Power O", "Strong Power", "Down G"
      return c === "power" || c.startsWith("power ") || c === "power o" || c === "strong power" || c === "down g";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("tackle_11"),
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ from?: string; route_kind?: string; path?: [number, number][] }> | undefined) ?? [];
      const carries = routes.filter((r) => r.route_kind === "carry" && r.from !== "QB");
      if (carries.length === 0) {
        return {
          ok: false as const,
          description: "Power must include a non-QB ballcarrier (B)",
          details: `route_kinds: [${routes.map((r) => `${r.from}=${r.route_kind ?? "?"}`).join(", ")}]`,
        };
      }
      return {
        ok: true as const,
        description: `@${carries[0].from} runs Power`,
      };
    }),
  ],
};

export default scenario;
