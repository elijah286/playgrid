/**
 * When the coach references players by color and the lookup is
 * unambiguous (exactly one player per color), Cal should apply the
 * edits directly — no clarification round-trip.
 *
 * Surfaced 2026-05-25 production feedback: coach had a Flood Right
 * play anchored (@X red, @Z blue, @H yellow, @S purple, @B orange,
 * @C green, @Q white — all distinct hues, the no-color-clash gate
 * guarantees this). Coach asked "make blue a go and red a post".
 * Cal correctly identified @Z as blue and @X as red in its reply,
 * but then asked the coach to CONFIRM which players they meant
 * before applying the edit. Wasted round-trip — when there's only
 * one blue and one red on the field, Cal has the answer.
 *
 * Eval setup: anchor a flag_7v7 play with canonical colors. Coach
 * asks for a color-keyed edit. Assert:
 *  - Cal called revise_play or modify_play_route on this turn.
 *  - The call's mods reference @X and @Z (the resolved players).
 *  - Cal's prose does NOT contain a clarification question (no
 *    "which player do you mean" / "can you confirm" phrasing).
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import { proseAvoids } from "../assertions/prose";

const FLOOD_FENCE = JSON.stringify({
  title: "Flood Right",
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
    { from: "X", path: [[-12, 18]], route_kind: "Go" },
    { from: "Z", path: [[14, 8], [16, 14]], route_kind: "Corner" },
    { from: "H", path: [[-4, 8]], route_kind: "Drag" },
    { from: "S", path: [[10, 6]], route_kind: "Out" },
    { from: "B", path: [[6, -3], [10, -1]], route_kind: "Flat" },
  ],
});

const scenario: Scenario = {
  name: "color-reference-unambiguous",
  description:
    "Coach references players by color in an anchored play with no color clash → Cal resolves silently and applies the edit, no clarification ping",
  origin: "production feedback 2026-05-25 (Flood Right + 'make blue a go and red a post')",
  type: "positive",
  context: {
    sportVariant: "flag_7v7",
    playbookId: "eval-color-reference",
    playbookName: "Eval — Flag 7v7",
    playId: "eval-flood-play",
    anchoredPlayDiagramText: FLOOD_FENCE,
  },
  chat: [
    { role: "user", text: "hey, can you make blue a go and red a post?" },
  ],
  assertions: [
    // Cal must reach for an edit tool. Either revise_play (the
    // canonical batched-mod path) or modify_play_route (the
    // single-route surgical path) is acceptable here — both apply
    // the edit identity-preservingly. The structural ask is just
    // "Cal acted, didn't ping".
    ((cap) => {
      const calls = cap.toolCalls.map((c) => c.name);
      if (!calls.includes("revise_play") && !calls.includes("modify_play_route")) {
        return {
          ok: false as const,
          description: "Cal must call revise_play or modify_play_route to apply the color-keyed edit",
          details: `tools called: ${calls.join(", ") || "(none)"}`,
        };
      }
      return { ok: true as const, description: "Cal called an edit tool" };
    }),

    // Cal's prose must NOT include a clarification question — that's
    // the wasted round-trip we're pinning out.
    proseAvoids(
      /\b(which (player|one|of these)|can you (clarify|confirm)|do you mean|is that @\w+|are you referring to)\b/i,
      "clarification ping",
    ),
    proseAvoids(
      /\b(blue.*is that|red.*is that)\b/i,
      "'blue/red — is that @X' style ping",
    ),

    // Sanity: an edit tool call must reference @X and @Z (the
    // resolved color → player mapping). This pins that Cal not only
    // skipped the ping but ALSO applied the edit to the right
    // players. Robust to either revise_play or modify_play_route.
    ((cap) => {
      const editCalls = cap.toolCalls.filter(
        (c) => c.name === "revise_play" || c.name === "modify_play_route",
      );
      const seen = new Set<string>();
      for (const call of editCalls) {
        // revise_play takes `mods: [{player, ...}]`; modify_play_route
        // takes `player_id` (or `player`) directly.
        const mods = call.input["mods"] as Array<{ player?: string }> | undefined;
        if (Array.isArray(mods)) {
          for (const m of mods) if (typeof m.player === "string") seen.add(m.player);
        }
        const pid = call.input["player_id"] ?? call.input["player"];
        if (typeof pid === "string") seen.add(pid);
      }
      if (!seen.has("X") || !seen.has("Z")) {
        return {
          ok: false as const,
          description: "edit tool calls must target @X (red) and @Z (blue)",
          details: `players targeted: [${[...seen].join(", ")}]`,
        };
      }
      return { ok: true as const, description: `edit tools targeted @X and @Z (${[...seen].join(", ")})` };
    }),
  ],
};

export default scenario;
