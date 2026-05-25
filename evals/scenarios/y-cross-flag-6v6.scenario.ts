/**
 * Y-Cross in flag_6v6 — cross-variant coverage.
 *
 * 6v6 roster (Q, C, X, Z, H, B). Y-Cross skeleton in 6v6 produces:
 *   @X Post (clear), @B Flat (outlet), @Z Go, @H Drag.
 *
 * Note: 6v6 does NOT have @Y in the roster, so the "Y-Cross" name
 * is a misnomer for this variant — the actual deep cross is on @H
 * (the inside slot) or substituted with a different route. The
 * skeleton's choice here is @X Post + @H Drag rather than a true
 * deep cross. This eval pins the 6v6 adaptation as-is.
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
  name: "y-cross-flag-6v6",
  description:
    "Y-Cross in flag_6v6 → compose_play returns the 6-player adaptation (no @Y in roster; substitutes)",
  origin: "variant coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "flag_6v6",
    playbookId: "eval-y-cross-6v6",
    playbookName: "Eval — Flag 6v6",
  },
  chat: [
    { role: "user", text: "Draw me a Y-Cross play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c.includes("y-cross") || c.includes("y cross") || c === "ycross";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("flag_6v6"),
    fenceHasNoIdleOffensivePlayers(),
    fenceHasRouteFor("X"),
    fenceHasRouteFor("Z"),
  ],
};

export default scenario;
