/**
 * Snag in flag_4v4 — cross-variant coverage.
 *
 * 4v4 Snag is a pure 3-receiver triangle (Spot + Corner + Flat) with
 * no extra clear route — only 3 eligibles total. Drops the Spot-Corner-
 * Flat-Go shape that 5v5/7v7 use into the 3-receiver-only adaptation:
 *   @Y Spot @ 5yd, @Z Corner @ 10yd, @X Flat @ 4yd.
 *
 * Lenient pattern matcher accepts as Snag (LENIENT_PATTERN_VARIANTS).
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import {
  fenceCount,
  fenceVariant,
  fenceHasNoIdleOffensivePlayers,
} from "../assertions/fence";

const scenario: Scenario = {
  name: "snag-flag-4v4",
  description:
    "Snag in flag_4v4 → 3-receiver triangle (no Go clear, no Spot drop)",
  origin: "variant coverage expansion 2026-05-25 (flag_4v4 plumbing)",
  type: "positive",
  context: {
    sportVariant: "flag_4v4",
    playbookId: "eval-snag-4v4",
    playbookName: "Eval — Flag 4v4",
  },
  chat: [
    { role: "user", text: "Build a Snag play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c.includes("snag");
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("flag_4v4"),
    fenceHasNoIdleOffensivePlayers(),
    // The triangle must include a Corner-family route (the high
    // element) and either a Spot or Sit (the inside element) and a
    // Flat (the low element).
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ route_kind?: string }> | undefined) ?? [];
      const kinds = new Set(routes.map((r) => (r.route_kind ?? "").toLowerCase()));
      const hasCorner = kinds.has("corner");
      const hasInside = kinds.has("spot") || kinds.has("sit");
      const hasFlat = kinds.has("flat");
      if (!(hasCorner && hasInside && hasFlat)) {
        return {
          ok: false as const,
          description: "Snag triangle requires Corner + (Spot|Sit) + Flat",
          details: `kinds present: [${[...kinds].join(", ")}]; corner=${hasCorner}, inside=${hasInside}, flat=${hasFlat}`,
        };
      }
      return { ok: true as const, description: "Snag triangle (Corner + Spot/Sit + Flat) intact" };
    }),
    // 4v4 roster should be 4 offensive players, no C.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const players = (f.players as Array<{ id?: string; team?: string }> | undefined) ?? [];
      const offense = players.filter((p) => p?.team === "O");
      if (offense.length !== 4) {
        return {
          ok: false as const,
          description: "flag_4v4 offense must have exactly 4 players",
          details: `got ${offense.length}: [${offense.map((p) => p?.id).join(", ")}]`,
        };
      }
      return { ok: true as const, description: `4-player offense (correct for 4v4)` };
    }),
  ],
};

export default scenario;
