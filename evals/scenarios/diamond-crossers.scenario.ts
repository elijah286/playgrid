/**
 * Coach asks Cal for a "Diamond Crossers" play. The original regression
 * (production 2026-05-24) had Cal hand-authoring a Spread Doubles
 * fence with the WRONG formation, only 2 of 4 required routes, and
 * the title "Bunch Right" or similar — anything but the actual
 * Diamond formation with crossers. Phase 2b's gate now catches the
 * hand-authored attempt and forces a retry through compose_play.
 *
 * Origin: production 2026-05-24 (Phase 2b motivator). Coach prompt:
 *   "Draw a Diamond Crossers play"
 *
 * Cal must call compose_play with concept="Mesh" + formation="Diamond"
 * (Crossers is a Mesh-family concept run from Diamond), or use a
 * concept name the catalog accepts and overrides for the Diamond
 * formation. The exact tool args are less important than the fence
 * shape: variant=flag_5v5, formation=Diamond (in the fence's
 * implicit formation), crossing routes present.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import {
  fenceCount,
  fenceVariant,
  fenceHasNoIdleOffensivePlayers,
} from "../assertions/fence";

const scenario: Scenario = {
  name: "diamond-crossers",
  description:
    "Diamond Crossers play in flag_5v5 produces a real Diamond formation with crossing routes (not Spread Doubles)",
  origin: "production regression 2026-05-24 (Phase 2b motivator)",
  type: "positive",
  context: {
    sportVariant: "flag_5v5",
    playbookId: "eval-diamond-crossers",
    playbookName: "Eval — Flag 5v5",
  },
  chat: [
    { role: "user", text: "Draw a Diamond Crossers play" },
  ],
  assertions: [
    // Cal must reach for compose_play with the Diamond formation. We
    // accept ANY catalog concept that has crossing-route DNA (Mesh,
    // Drive, Levels, Y-Cross) — "Diamond Crossers" is coach
    // shorthand that maps reasonably to any of these. The structural
    // requirement is "compose_play, Diamond formation, complete
    // play"; the specific concept name is Cal's call.
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      const f = typeof args.formation === "string" ? args.formation.toLowerCase() : "";
      const isCrossingConcept =
        c === "mesh" || c === "drive" || c === "levels" || c === "y-cross" || c.includes("cross");
      const isDiamond = f.includes("diamond");
      return isCrossingConcept && isDiamond;
    }),
    fenceCount({ min: 1, max: 1 }),
    fenceVariant("flag_5v5"),
    fenceHasNoIdleOffensivePlayers(),
  ],
};

export default scenario;
