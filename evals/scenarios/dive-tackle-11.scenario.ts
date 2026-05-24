/**
 * Dive in tackle_11 — straight-ahead inside run between the guards.
 *
 * Catalog (buildSingleHandoffRun → "dive"): QB hands to B; B attacks
 * the A-gap or B-gap (interior). Distinguishes from Sweep by ending
 * INSIDE the tackles. Requires handoff_chain capability.
 *
 * Added 2026-05-25 as part of the eval coverage expansion.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import { fenceCount, fenceVariant } from "../assertions/fence";

const scenario: Scenario = {
  name: "dive-tackle-11",
  description:
    "Dive in tackle_11 → compose_play emits B with a tight inside carry between the guards",
  origin: "eval coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-dive-11",
    playbookName: "Eval — Tackle 11",
  },
  chat: [
    { role: "user", text: "Build a Dive play. Handoff chain is already enabled on the playbook." },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "dive";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("tackle_11"),
    // Dive ends INSIDE — the carry's final x must be near the
    // center (|x| ≤ 4, between the tackles).
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ from?: string; route_kind?: string; path?: [number, number][] }> | undefined) ?? [];
      const carries = routes.filter((r) => r.route_kind === "carry" && r.from !== "QB");
      if (carries.length === 0) {
        return {
          ok: false as const,
          description: "Dive must include at least one non-QB carry (the ballcarrier)",
          details: `route_kinds: [${routes.map((r) => `${r.from}=${r.route_kind ?? "?"}`).join(", ")}]`,
        };
      }
      const ballcarrier = carries[0];
      const lastPt = (ballcarrier.path ?? [])[ballcarrier.path?.length ? ballcarrier.path.length - 1 : 0];
      if (!lastPt || Math.abs(lastPt[0]) > 4) {
        return {
          ok: false as const,
          description: "Dive carry must end INSIDE the tackles (|x| ≤ 4) — distinguishes it from Sweep",
          details: `${ballcarrier.from} carry ends at (${lastPt?.[0] ?? "?"}, ${lastPt?.[1] ?? "?"})`,
        };
      }
      return {
        ok: true as const,
        description: `@${ballcarrier.from} dives to (${lastPt[0]}, ${lastPt[1]})`,
      };
    }),
  ],
};

export default scenario;
