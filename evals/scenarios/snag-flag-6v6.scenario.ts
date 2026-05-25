/**
 * Snag in flag_6v6 — cross-variant coverage.
 *
 * 6v6 roster (Q, C, X, Z, H, B). Snag skeleton in 6v6 produces:
 *   @Z Corner (deep), @B Flat (outlet), @X Go (clear), @H Drag.
 *
 * Added 2026-05-25 as part of the variant-coverage expansion. Pairs
 * with snag-flag-5v5 to lock down Snag across both flag variants.
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
  name: "snag-flag-6v6",
  description:
    "Snag in flag_6v6 → compose_play returns a 4-route adaptation including Corner + Flat (the canonical Snag pair)",
  origin: "variant coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "flag_6v6",
    playbookId: "eval-snag-6v6",
    playbookName: "Eval — Flag 6v6",
  },
  chat: [
    { role: "user", text: "Build a Snag play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "snag";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("flag_6v6"),
    fenceHasNoIdleOffensivePlayers(),
    fenceHasRouteFor("Z"),
    fenceHasRouteFor("B"),
    // Snag's defining feature: Corner deep + Flat outlet.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ route_kind?: string }> | undefined) ?? [];
      const kinds = new Set(routes.map((r) => (r.route_kind ?? "").toLowerCase()));
      if (!kinds.has("corner") || !kinds.has("flat")) {
        return {
          ok: false as const,
          description: "Snag must include Corner + Flat",
          details: `present: [${[...kinds].join(", ")}]`,
        };
      }
      return { ok: true as const, description: "Corner + Flat present" };
    }),
  ],
};

export default scenario;
