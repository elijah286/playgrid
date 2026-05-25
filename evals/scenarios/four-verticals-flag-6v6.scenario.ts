/**
 * Four Verticals in flag_6v6 — cross-variant coverage.
 *
 * 6v6 roster (Q, C, X, Z, H, B). 4 Verticals skeleton in 6v6:
 *   @X Go, @Z Go, @H Seam, @B Flat.
 *
 * Note: 6v6 doesn't have a 4th vertical receiver (no @S or @Y), so
 * @B runs a Flat instead of a 4th vertical. The "Four Verticals"
 * concept name is preserved but the actual pattern is 3 verticals +
 * 1 underneath flat in 6v6.
 *
 * Added 2026-05-25 as part of the variant-coverage expansion.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import {
  fenceCount,
  fenceVariant,
  fenceHasRouteFor,
  fenceHasNoIdleOffensivePlayers,
} from "../assertions/fence";

const scenario: Scenario = {
  name: "four-verticals-flag-6v6",
  description:
    "4 Verts in flag_6v6 → compose_play returns the 6-player adaptation (3 verticals + underneath outlet)",
  origin: "variant coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "flag_6v6",
    playbookId: "eval-4verts-6v6",
    playbookName: "Eval — Flag 6v6",
  },
  chat: [
    { role: "user", text: "Build a Four Verticals play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c.includes("four vertical") || c.includes("4 verts") || c.includes("4 vertical");
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("flag_6v6"),
    fenceHasNoIdleOffensivePlayers(),
    fenceHasRouteFor("X"),
    fenceHasRouteFor("Z"),
    // Must have at least 2 Go routes (the outside-vertical pair).
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ route_kind?: string }> | undefined) ?? [];
      const goCount = routes.filter((r) => (r.route_kind ?? "").toLowerCase() === "go").length;
      const seamCount = routes.filter((r) => (r.route_kind ?? "").toLowerCase() === "seam").length;
      if (goCount + seamCount < 3) {
        return {
          ok: false as const,
          description: "4 Verts must have ≥3 vertical routes (Go + Seam)",
          details: `Go=${goCount}, Seam=${seamCount}; route_kinds: [${routes.map((r) => r.route_kind).join(", ")}]`,
        };
      }
      return { ok: true as const, description: `${goCount} Go + ${seamCount} Seam = ${goCount + seamCount} verticals` };
    }),
  ],
};

export default scenario;
