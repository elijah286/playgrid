/**
 * Coach asks Cal to build a Snag concept in flag_5v5. Expected: Cal
 * calls compose_play with concept="Snag", drops the returned fence,
 * and every non-QB player gets a route. The Snag triangle (Spot
 * + Corner + Flat) maps to {Y, Z, C} in 5v5; @X is the backside
 * clear (Go).
 *
 * Origin: production 2026-05-24. Coach prompt:
 *   "Build a Snag out of Bunch"
 * Cal correctly fell back to the canonical Trips Bunch formation
 * (Bunch in 5v5 doesn't have enough receivers for the Snag triangle),
 * but compose_play's flag_5v5 output had only 2 routes (Z:Corner,
 * X:Go) — @C and @Y were idle. Fixed in commit 9691fae3 by adding a
 * 5v5 branch to `buildSnag`. This eval ensures Cal still produces a
 * complete play here.
 */

import type { Scenario } from "../types";
import { toolCalled, toolCallCount } from "../assertions/tools";
import {
  fenceCount,
  fenceVariant,
  fenceHasRouteFor,
  fenceHasNoIdleOffensivePlayers,
} from "../assertions/fence";

const scenario: Scenario = {
  name: "snag-flag-5v5",
  description:
    "Snag concept in flag_5v5 produces a complete play (all 4 non-QB players have routes)",
  origin: "regression 2026-05-24 (commit 9691fae3 — variant-roster fix)",
  type: "positive",
  context: {
    sportVariant: "flag_5v5",
    playbookId: "eval-snag-5v5",
    playbookName: "Eval — Flag 5v5",
  },
  chat: [
    { role: "user", text: "Build a Snag play" },
  ],
  assertions: [
    // Cal must reach for compose_play, not hand-author the fence.
    // (Phase 2b would reject hand-authoring anyway, but the eval is
    // about whether Cal CHOOSES the right tool on the first attempt.)
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "snag";
    }),
    // Hard cap: 3 catalog-concept fences per reply (AGENTS.md). For
    // this single-play prompt the cap should be 1.
    fenceCount({ exact: 1 }),
    fenceVariant("flag_5v5"),
    // Every non-QB player must have a route — this is what failed in
    // the original regression.
    fenceHasNoIdleOffensivePlayers(),
    // Spot-check the canonical Snag triangle players in 5v5.
    fenceHasRouteFor("Y"),
    fenceHasRouteFor("Z"),
    fenceHasRouteFor("C"),
    fenceHasRouteFor("X"),
    // Cal should NOT also fire compose_play a second time for the
    // same play (the 3-fence cap + per-fence skeleton gate already
    // structurally prevents this, but an eval flag is cheap).
    toolCallCount("compose_play", { max: 1 }),
  ],
};

export default scenario;
