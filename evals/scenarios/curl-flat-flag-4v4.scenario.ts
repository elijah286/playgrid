/**
 * Curl-Flat in flag_4v4 — cross-variant coverage.
 *
 * 4v4 Curl-Flat: outside @Z curl @ 5yd (high), @Y flat @ 4yd (low,
 * absorbing the C-flat role from 5v5), @X go @ 12yd to clear. The
 * key adaptation: with no @C in the roster, @Y becomes the flat
 * outlet — the high-low remains intact.
 *
 * This scenario locks in the "@Y as flat" decision so a future refactor
 * doesn't silently drop the low element of the concept.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import {
  fenceCount,
  fenceVariant,
  fenceHasNoIdleOffensivePlayers,
} from "../assertions/fence";

const scenario: Scenario = {
  name: "curl-flat-flag-4v4",
  description:
    "Curl-Flat in flag_4v4 → high-low intact, @Y absorbs the flat role (no @C in 4v4 roster)",
  origin: "variant coverage expansion 2026-05-25 (flag_4v4 plumbing)",
  type: "positive",
  context: {
    sportVariant: "flag_4v4",
    playbookId: "eval-curl-flat-4v4",
    playbookName: "Eval — Flag 4v4",
  },
  chat: [
    { role: "user", text: "Build a Curl-Flat play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c.includes("curl-flat") || c.includes("curl flat");
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("flag_4v4"),
    fenceHasNoIdleOffensivePlayers(),
    // High-low: Curl (high) + Flat (low) both present.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ route_kind?: string }> | undefined) ?? [];
      const kinds = new Set(routes.map((r) => (r.route_kind ?? "").toLowerCase()));
      const hasCurl = kinds.has("curl");
      const hasFlat = kinds.has("flat");
      if (!(hasCurl && hasFlat)) {
        return {
          ok: false as const,
          description: "Curl-Flat high-low requires both Curl and Flat",
          details: `kinds: [${[...kinds].join(", ")}]; curl=${hasCurl}, flat=${hasFlat}`,
        };
      }
      return { ok: true as const, description: "Curl-Flat high-low intact" };
    }),
  ],
};

export default scenario;
