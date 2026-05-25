/**
 * Smash in touch_7v7 — touch composition reuses flag_7v7 catalog.
 *
 * touch_7v7 is composition-identical to flag_7v7 (same 7-player
 * roster, same catalog, same defensive templates). The difference is
 * RULES (two-hand-touch instead of flag-pull) which lives in the KB,
 * not the composition pipeline. This scenario locks in that promise:
 * a Smash compose in touch_7v7 should produce a 7-player diagram with
 * the same Smash shape as flag_7v7.
 *
 * Added 2026-05-25 as part of the flag_4v4 + touch_7v7 expansion.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import {
  fenceCount,
  fenceVariant,
  fenceHasNoIdleOffensivePlayers,
} from "../assertions/fence";

const scenario: Scenario = {
  name: "smash-touch-7v7",
  description:
    "Smash in touch_7v7 → compose_play produces the 7v7 shape (touch = flag_7v7 alias)",
  origin: "variant coverage expansion 2026-05-25 (touch_7v7 plumbing)",
  type: "positive",
  context: {
    sportVariant: "touch_7v7",
    playbookId: "eval-smash-touch-7v7",
    playbookName: "Eval — Touch 7v7",
  },
  chat: [
    { role: "user", text: "Build a Smash play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c.includes("smash");
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("touch_7v7"),
    fenceHasNoIdleOffensivePlayers(),
    // touch_7v7 roster matches flag_7v7: 7 offensive players.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const players = (f.players as Array<{ id?: string; team?: string }> | undefined) ?? [];
      const offense = players.filter((p) => p?.team === "O");
      if (offense.length !== 7) {
        return {
          ok: false as const,
          description: "touch_7v7 offense must have exactly 7 players (same as flag_7v7)",
          details: `got ${offense.length}: [${offense.map((p) => p?.id).join(", ")}]`,
        };
      }
      return { ok: true as const, description: `7-player offense (correct for touch_7v7)` };
    }),
    // Smash high-low: Hitch (low) + Corner (high).
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ route_kind?: string }> | undefined) ?? [];
      const kinds = new Set(routes.map((r) => (r.route_kind ?? "").toLowerCase()));
      const hasHitch = kinds.has("hitch");
      const hasCorner = kinds.has("corner");
      if (!(hasHitch && hasCorner)) {
        return {
          ok: false as const,
          description: "Smash requires Hitch (low) + Corner (high)",
          details: `kinds: [${[...kinds].join(", ")}]; hitch=${hasHitch}, corner=${hasCorner}`,
        };
      }
      return { ok: true as const, description: "Smash high-low (Hitch + Corner) intact" };
    }),
  ],
};

export default scenario;
