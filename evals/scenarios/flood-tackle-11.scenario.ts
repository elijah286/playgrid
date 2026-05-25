/**
 * Flood (Sail) in tackle_11 — THREE receivers stretching ONE SIDE of
 * the field at THREE depths: Corner (deep) + Out/Curl (mid) + Flat (low).
 *
 * Catalog enforces SAME-SIDE — every matched player's x must be on
 * the same side of center. Catalog output: Z=Corner (deep), S=Out
 * (mid), B=Flat (low), X=Go (backside clear), H=Drag.
 *
 * Added 2026-05-25 — Flood had no eval coverage anywhere.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import { fenceCount, fenceVariant, fenceHasNoIdleOffensivePlayers } from "../assertions/fence";

const scenario: Scenario = {
  name: "flood-tackle-11",
  description:
    "Flood Right in tackle_11 → compose_play emits 3-level same-side stretch (Corner + Out + Flat)",
  origin: "concept coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-flood-tackle",
    playbookName: "Eval — Tackle 11",
  },
  chat: [
    { role: "user", text: "Build a Flood Right play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      const s = typeof args.strength === "string" ? args.strength.toLowerCase() : "";
      return (c === "flood" || c === "sail") && (s === "right" || s === "");
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("tackle_11"),
    fenceHasNoIdleOffensivePlayers(),
    // The three same-side stretch routes must all end on the RIGHT
    // side of the field (x > 0). Backside Go (@X) can be anywhere.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ from?: string; route_kind?: string; path?: [number, number][] }> | undefined) ?? [];
      const stretchKinds = new Set(["corner", "out", "flat", "curl"]);
      const stretchRoutes = routes.filter((r) => stretchKinds.has((r.route_kind ?? "").toLowerCase()));
      if (stretchRoutes.length < 3) {
        return {
          ok: false as const,
          description: "Flood must have 3 same-side stretch routes (Corner + Out/Curl + Flat)",
          details: `stretch routes: ${stretchRoutes.length}; kinds: [${stretchRoutes.map((r) => r.route_kind).join(", ")}]`,
        };
      }
      const allRight = stretchRoutes.every((r) => {
        const lastPt = (r.path ?? [])[r.path?.length ? r.path.length - 1 : 0];
        return typeof lastPt?.[0] === "number" && lastPt[0] > 0;
      });
      if (!allRight) {
        return {
          ok: false as const,
          description: "Flood Right: all 3 stretch routes must end on the right side (x > 0)",
          details: `endpoints: ${stretchRoutes.map((r) => {
            const p = (r.path ?? [])[r.path?.length ? r.path.length - 1 : 0];
            return `${r.from}=(${p?.[0]},${p?.[1]})`;
          }).join(", ")}`,
        };
      }
      return { ok: true as const, description: "3-level same-side stretch on the right" };
    }),
  ],
};

export default scenario;
