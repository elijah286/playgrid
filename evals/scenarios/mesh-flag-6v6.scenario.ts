/**
 * Mesh in flag_6v6 — cross-variant coverage.
 *
 * 6v6 has a 6-player roster (Q, C, X, Z, H, B) — no @S or @Y. The
 * skeleton produces a Mesh-like pattern: @H Drag, @X Curl, @Z Go,
 * @B Flat. Note this is NOT a strict 2-crossing-drags Mesh (the
 * variant doesn't have enough inside receivers for that) — it's the
 * 6v6 adaptation.
 *
 * Added 2026-05-25 as part of the variant-coverage expansion. Pairs
 * with mesh-flag-7v7 to catch any regressions where a Mesh skeleton
 * change in one variant breaks another.
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
  name: "mesh-flag-6v6",
  description:
    "Mesh in flag_6v6 → compose_play returns the 6-player adaptation with all skill players routed",
  origin: "variant coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "flag_6v6",
    playbookId: "eval-mesh-6v6",
    playbookName: "Eval — Flag 6v6",
  },
  chat: [
    { role: "user", text: "Draw me a Mesh play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "mesh";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("flag_6v6"),
    fenceHasNoIdleOffensivePlayers(),
    fenceHasRouteFor("X"),
    fenceHasRouteFor("Z"),
    fenceHasRouteFor("H"),
    fenceHasRouteFor("B"),
  ],
};

export default scenario;
