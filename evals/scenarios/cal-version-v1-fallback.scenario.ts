/**
 * Verifies the Cal v1 fallback path end-to-end. When the site admin
 * flips `coach_cal_version` to "v1":
 * - The Phase 2b provenance gate does NOT enforce.
 * - The Task #35 rescue path does NOT substitute Cal's fence with
 *   the tool's canonical output (pre-rescue strip-only behavior
 *   remains as the fallback).
 * - The Task #36 server-side label aliasing does NOT apply.
 *
 * This scenario is the COMPANION proof to coach-preference-defender-label:
 * - That v2 scenario succeeds only because rescue substitutes a
 *   canonical fence with @TE applied. It exercises the full v2 stack.
 * - This v1 scenario asks for the same canonical concept (Snag in
 *   flag_5v5) and asserts the call shape is unchanged — Cal still
 *   reaches for compose_play. We don't require a fence to SHIP,
 *   because rescue is off and Cal's hand-authored fences may hit the
 *   pre-Task #35 strip path on validator failure. The structural
 *   proof is: (a) compose_play was called, (b) NO @TE appears in
 *   any fence (aliasing off), (c) IF a fence shipped, its players
 *   are canonical (no rename).
 *
 * Aliasing-off in v1 is also covered structurally at the unit-test
 * layer (`src/lib/site/coach-cal-version.test.ts`) and by code
 * inspection: every alias call site in `src/lib/coach-ai/tools.ts`
 * is gated on `(ctx.calVersion ?? "v2") !== "v1"`.
 *
 * Origin: Site admin toggle ship 2026-05-25 — needed end-to-end
 * verification that the version flag actually flips the agent's
 * behavior, not just the DB value.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";

const scenario: Scenario = {
  name: "cal-version-v1-fallback",
  description:
    "calVersion='v1' → gate + rescue + aliasing all off; compose_play call shape unchanged",
  origin: "Site admin toggle 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "flag_5v5",
    playbookId: "eval-cal-v1-fallback",
    playbookName: "Eval — Cal v1 fallback",
    calVersion: "v1",
    // Preferences set so that IF aliasing leaked into v1, we'd see
    // @Y renamed to @TE. The assertion below confirms that did NOT
    // happen — structural proof aliasing is off in v1.
    preferences: [
      { key: "offense_label_Y", value: "TE" },
    ],
  },
  chat: [
    { role: "user", text: "Build a Snag play" },
  ],
  assertions: [
    // Cal's tool affinity is unchanged in v1 — the prompt still
    // points at compose_play for catalog concepts.
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "snag";
    }),
    // No fence in the reply may contain @TE — that would mean
    // server-side aliasing leaked into v1. (If no fence shipped,
    // this passes vacuously, which is the correct v1 behavior
    // when Cal's fence hit the strip path.)
    ((cap) => {
      for (const fence of cap.playFences) {
        const players = (fence.players as Array<{ id?: string }> | undefined) ?? [];
        const tePlayer = players.find((p) => p?.id === "TE");
        if (tePlayer) {
          return {
            ok: false as const,
            description: "v1: server-side aliasing should NOT rename @Y → @TE",
            details: `fence has @TE; players: ${players.map((p) => `@${p?.id}`).join(", ")}`,
          };
        }
      }
      return { ok: true as const, description: "v1: no @TE found (aliasing correctly off)" };
    }),
    // IF a fence shipped, it must use canonical @Y for the Spot
    // receiver (positive proof, not just "no @TE"). Passes vacuously
    // when the strip path ran.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) {
        return { ok: true as const, description: "v1: no fence shipped (acceptable when strip path ran)" };
      }
      const players = (f.players as Array<{ id?: string }> | undefined) ?? [];
      if (!players.find((p) => p?.id === "Y")) {
        return {
          ok: false as const,
          description: "v1: shipped fence should have canonical @Y",
          details: `players: ${players.map((p) => `@${p?.id ?? "?"}`).join(", ")}`,
        };
      }
      return { ok: true as const, description: "v1: shipped fence has canonical @Y" };
    }),
  ],
};

export default scenario;
