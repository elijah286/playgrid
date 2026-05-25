/**
 * Smash in flag_6v6 — cross-variant coverage.
 *
 * 6v6 roster (Q, C, X, Z, H, B). Smash skeleton in 6v6:
 *   @Z Hitch (low), @B Flat, @X Go (clear), @H Drag.
 *
 * Note: 6v6 Smash adapts the canonical hitch + corner combo. The
 * concept produces a low-level hitch + a deep clear with underneath
 * outlet routes — close to but not identical to the standard Smash.
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
  name: "smash-flag-6v6",
  description:
    "Smash in flag_6v6 → compose_play returns the 6-player adaptation including Hitch + perimeter outlet",
  origin: "variant coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "flag_6v6",
    playbookId: "eval-smash-6v6",
    playbookName: "Eval — Flag 6v6",
  },
  chat: [
    { role: "user", text: "Build me a Smash play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "smash";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("flag_6v6"),
    fenceHasNoIdleOffensivePlayers(),
    fenceHasRouteFor("Z"),
    fenceHasRouteFor("X"),
    // Smash's signature: a Hitch.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ route_kind?: string }> | undefined) ?? [];
      const kinds = new Set(routes.map((r) => (r.route_kind ?? "").toLowerCase()));
      if (!kinds.has("hitch")) {
        return {
          ok: false as const,
          description: "Smash must include a Hitch route",
          details: `present: [${[...kinds].join(", ")}]`,
        };
      }
      return { ok: true as const, description: "Hitch present" };
    }),
  ],
};

export default scenario;
