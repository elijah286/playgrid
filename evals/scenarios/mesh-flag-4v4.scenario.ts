/**
 * Mesh in flag_4v4 — cross-variant coverage.
 *
 * 4v4 roster (Q, X, Y, Z) — no center. Mesh skeleton in 4v4 reduces
 * the canonical 2-drag mesh to a 1-drag adaptation:
 *   @Y under-drag @ 2yd, @X curl @ 8yd, @Z go @ 12yd.
 *
 * The lenient pattern matcher (LENIENT_PATTERN_VARIANTS set) accepts
 * the 1-drag variant as a Mesh because flag_4v4 only has 3 eligibles
 * and can't field the full 2-drag shape.
 *
 * Added 2026-05-25 as part of the flag_4v4 + touch_7v7 expansion.
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
  name: "mesh-flag-4v4",
  description:
    "Mesh in flag_4v4 → compose_play returns the 1-drag adaptation (3 eligibles)",
  origin: "variant coverage expansion 2026-05-25 (flag_4v4 plumbing)",
  type: "positive",
  context: {
    sportVariant: "flag_4v4",
    playbookId: "eval-mesh-4v4",
    playbookName: "Eval — Flag 4v4",
  },
  chat: [
    { role: "user", text: "Build a Mesh play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c.includes("mesh");
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("flag_4v4"),
    fenceHasNoIdleOffensivePlayers(),
    // The 3 eligibles all need routes in a 4v4 Mesh.
    fenceHasRouteFor("X"),
    fenceHasRouteFor("Y"),
    fenceHasRouteFor("Z"),
    // No C in 4v4 — assertion that no @C player appears on the fence.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const players = (f.players as Array<{ id?: string; team?: string }> | undefined) ?? [];
      const hasC = players.some((p) => p?.team === "O" && p?.id === "C");
      if (hasC) {
        return {
          ok: false as const,
          description: "flag_4v4 should NOT have a center (canonical roster is {Q, X, Y, Z})",
          details: `found @C in roster: [${players.filter((p) => p?.team === "O").map((p) => p?.id).join(", ")}]`,
        };
      }
      return { ok: true as const, description: "no @C in 4v4 roster (correct)" };
    }),
    // Must have at least 1 Drag route (the mesh point).
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ route_kind?: string }> | undefined) ?? [];
      const dragCount = routes.filter((r) => (r.route_kind ?? "").toLowerCase() === "drag").length;
      if (dragCount < 1) {
        return {
          ok: false as const,
          description: "Mesh in 4v4 must have ≥1 Drag route (the crossing element)",
          details: `route_kinds: [${routes.map((r) => r.route_kind).join(", ")}]`,
        };
      }
      return { ok: true as const, description: `${dragCount} Drag route (mesh point intact)` };
    }),
  ],
};

export default scenario;
