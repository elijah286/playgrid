/**
 * With a Mesh play anchored, coach asks "make the under-drag deeper".
 * Cal must call revise_play (or modify_play_route) with a depth
 * change on @H, NOT compose_play with a new concept. The
 * surgical-edit gate enforces this: any new fence in a turn where
 * the prior turn had a fence MUST come from a modify-tool call.
 *
 * Origin: 2026-05-02 regression — coach asked Cal to deepen a route
 * and Cal redrew the entire play with a different formation. The
 * surgical-edit gate now rejects this; Cal must use revise_play to
 * preserve offense identity.
 */

import type { Scenario } from "../types";
import { toolCalled, toolNotCalled, toolCallCount } from "../assertions/tools";
import {
  fenceCount,
  fenceHasRouteFor,
  fenceHasNoIdleOffensivePlayers,
} from "../assertions/fence";

// A minimal Mesh play in flag_7v7. Used as the anchored play diagram
// so Cal sees "this play" without a DB fetch.
const MESH_FENCE = JSON.stringify({
  title: "Mesh",
  variant: "flag_7v7",
  focus: "O",
  players: [
    { id: "QB", x: 0, y: -5, team: "O" },
    { id: "C", x: 0, y: 0, team: "O" },
    { id: "X", x: -12, y: 0, team: "O" },
    { id: "Z", x: 12, y: 0, team: "O" },
    { id: "H", x: -7, y: 0, team: "O" },
    { id: "S", x: 7, y: 0, team: "O" },
    { id: "B", x: 4, y: -5, team: "O" },
  ],
  routes: [
    { from: "H", path: [[-7, 2], [12, 2]], route_kind: "Drag" },
    { from: "S", path: [[7, 8], [-12, 8]], route_kind: "Drag" },
    { from: "X", path: [[-12, 12]], route_kind: "Curl" },
    { from: "Z", path: [[12, 18]], route_kind: "Go" },
    { from: "B", path: [[6, -3], [10, -1]], route_kind: "Flat" },
  ],
});

const scenario: Scenario = {
  name: "revise-play-deepen-drag",
  description:
    "With a Mesh play anchored, 'make the under-drag deeper' uses revise_play (NOT compose_play) and preserves formation",
  origin: "regression 2026-05-02 (surgical-edit gate)",
  type: "positive",
  context: {
    sportVariant: "flag_7v7",
    playbookId: "eval-revise-mesh",
    playbookName: "Eval — Flag 7v7",
    playId: "eval-mesh-play",
    anchoredPlayDiagramText: MESH_FENCE,
  },
  chat: [
    { role: "assistant", text: "Here's a Mesh play.\n```play\n" + MESH_FENCE + "\n```" },
    { role: "user", text: "Make the under-drag deeper — try 4 yards instead of 2." },
  ],
  assertions: [
    // Cal must reach for a modify tool, not compose_play.
    toolCalled("revise_play"),
    toolNotCalled("compose_play"),
    // Exactly one fence in the reply.
    fenceCount({ exact: 1 }),
    fenceHasNoIdleOffensivePlayers(),
    // @H must still have a route (we asked to MODIFY it, not remove it).
    fenceHasRouteFor("H"),
    // Other players must still be present — formation preservation.
    fenceHasRouteFor("S"),
    fenceHasRouteFor("X"),
    fenceHasRouteFor("Z"),
    fenceHasRouteFor("B"),
    // Single revise call — Cal must not loop.
    toolCallCount("revise_play", { max: 1 }),
  ],
};

export default scenario;
