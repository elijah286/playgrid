/**
 * Sweep in tackle_11 — outside run with a pulling guard / lead block.
 *
 * Catalog (buildSingleHandoffRun → "sweep"): QB hands to B; B runs
 * wide to the strong side. Requires handoff_chain capability.
 *
 * Added 2026-05-25 as part of the eval coverage expansion.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import { fenceCount, fenceVariant } from "../assertions/fence";

const scenario: Scenario = {
  name: "sweep-tackle-11",
  description:
    "Sweep in tackle_11 → compose_play emits B with a wide carry to the strong side",
  origin: "eval coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-sweep-11",
    playbookName: "Eval — Tackle 11",
  },
  chat: [
    // Pre-confirm capability so Cal doesn't pause for permission.
    { role: "user", text: "Build a Sweep play. Handoff chain is already enabled on the playbook." },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "sweep";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("tackle_11"),
    // Must have @B (or named ballcarrier) on a carry route.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ from?: string; route_kind?: string; path?: [number, number][] }> | undefined) ?? [];
      const carries = routes.filter((r) => r.route_kind === "carry" && r.from !== "QB");
      if (carries.length === 0) {
        return {
          ok: false as const,
          description: "Sweep must include at least one non-QB carry (the ballcarrier)",
          details: `route_kinds: [${routes.map((r) => `${r.from}=${r.route_kind ?? "?"}`).join(", ")}]`,
        };
      }
      // The carry must end OUTSIDE (|x| > 4 at end) — that's what
      // makes it a sweep vs a dive.
      const ballcarrier = carries[0];
      const lastPt = (ballcarrier.path ?? [])[ballcarrier.path?.length ? ballcarrier.path.length - 1 : 0];
      if (!lastPt || Math.abs(lastPt[0]) <= 4) {
        return {
          ok: false as const,
          description: "Sweep carry must end OUTSIDE the tackles (|x| > 4) — that's what distinguishes it from a dive",
          details: `${ballcarrier.from} carry ends at (${lastPt?.[0] ?? "?"}, ${lastPt?.[1] ?? "?"})`,
        };
      }
      return {
        ok: true as const,
        description: `@${ballcarrier.from} sweeps to (${lastPt[0]}, ${lastPt[1]})`,
      };
    }),
  ],
};

export default scenario;
