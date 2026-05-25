/**
 * Curl-Flat in tackle_11 — cross-variant coverage.
 *
 * Tackle Curl-Flat combo: Z=Curl (4-7yd) + B=Flat (0-4yd) — the
 * canonical high-low on the flat defender from the strong side.
 * X=Go, S=Sit, H=Drag.
 *
 * Note: the catalog's Curl-Flat concept enforces a SHORTER Curl
 * (4-7yd) than the standalone Curl family (8-13yd) — the play needs
 * the curl to be at the same level as the flat defender to stress
 * him high/low.
 *
 * Added 2026-05-25 as part of the cross-variant pass-concept coverage.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import {
  fenceCount,
  fenceVariant,
  fenceHasNoIdleOffensivePlayers,
} from "../assertions/fence";

const scenario: Scenario = {
  name: "curl-flat-tackle-11",
  description:
    "Curl-Flat in tackle_11 → compose_play emits Curl + Flat on the same side (high-low)",
  origin: "cross-variant coverage 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-curl-flat-tackle",
    playbookName: "Eval — Tackle 11",
  },
  chat: [
    { role: "user", text: "Build a Curl-Flat play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "curl-flat" || c === "curl flat" || c === "curlflat";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("tackle_11"),
    fenceHasNoIdleOffensivePlayers(),
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ route_kind?: string; path?: [number, number][] }> | undefined) ?? [];
      const curl = routes.find((r) => (r.route_kind ?? "").toLowerCase() === "curl");
      const flat = routes.find((r) => (r.route_kind ?? "").toLowerCase() === "flat");
      if (!curl || !flat) {
        return {
          ok: false as const,
          description: "Curl-Flat must include both Curl + Flat",
          details: `route_kinds present: [${[...new Set(routes.map((r) => r.route_kind))].join(", ")}]`,
        };
      }
      // Curl must be in the 4-7yd "short curl" range (concept-specific).
      const curlDepth = Math.max(...(curl.path ?? []).map((p) => p[1]));
      if (curlDepth < 3 || curlDepth > 9) {
        return {
          ok: false as const,
          description: "Curl-Flat's Curl must be 4-7yd (shorter than catalog default), got " + curlDepth.toFixed(1),
          details: `curl depth: ${curlDepth.toFixed(1)}yd`,
        };
      }
      return { ok: true as const, description: `Curl@${curlDepth.toFixed(1)}yd + Flat present` };
    }),
  ],
};

export default scenario;
