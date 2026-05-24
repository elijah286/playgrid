/**
 * Coach asks for the canonical Mesh concept in flag_7v7. Cal must
 * call compose_play with concept="Mesh", drop the returned fence,
 * and ship a play with both drags at differentiated depths (the
 * 2yd + 8yd split that makes the cross visually unambiguous).
 *
 * Origin: 2026-05-02 regression — Mesh's two drags were rendering
 * at the same depth ("both at 2 yards"), making the cross
 * indistinguishable from a collision. Fixed by the 2+8 depth split
 * in buildMesh. This scenario pins that fix end-to-end.
 *
 * In 7v7 the canonical Mesh has H@2 (under) + S@8 (over) + X Curl
 * + Z Go + B Flat. The eval verifies the fence contains routes for
 * all of those players.
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
  name: "mesh-flag-7v7",
  description:
    "Mesh concept in flag_7v7 → compose_play emits a complete play with differentiated drag depths and all 7 players covered",
  origin: "regression 2026-05-02 (Mesh drags-at-same-depth fix in buildMesh)",
  type: "positive",
  context: {
    sportVariant: "flag_7v7",
    playbookId: "eval-mesh-7v7",
    playbookName: "Eval — Flag 7v7",
  },
  chat: [
    { role: "user", text: "Draw me a Mesh play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "mesh";
    }),
    // Hard cap on the per-reply fence count.
    fenceCount({ exact: 1 }),
    fenceVariant("flag_7v7"),
    // Every non-QB player on the field must have a route — the Mesh
    // skeleton produces 5 routes (H, S, X, Z, B) in 7v7.
    fenceHasNoIdleOffensivePlayers(),
    fenceHasRouteFor("H"),
    fenceHasRouteFor("S"),
    fenceHasRouteFor("X"),
    fenceHasRouteFor("Z"),
    fenceHasRouteFor("B"),
    // Single compose_play call — Cal must not loop.
    toolCallCount("compose_play", { max: 1 }),
  ],
};

export default scenario;
