/**
 * Jet Reverse in tackle_11 — the catalog skeleton should compose cleanly
 * and ship a fence with the reverse carrier (X, the WEAK-side WR when
 * strength=right) running back to the LEFT.
 *
 * Production bug 2026-05-25: coach asked "make a reverse jet sweep play"
 * (recognized by Cal as Jet Reverse). compose_play({concept: "Jet Reverse"})
 * FAILED route-assignment validation in tackle_11 because the QB's
 * handoff arrow (route_kind: "handoff") ended at the mesh point y=-4,
 * tripping Layer 4's "forward pass behind LOS" check. Cal fell back to
 * hand-authoring and shipped two consecutive nonsense fences — Z (the
 * RIGHT WR) running further right, no actual reverse direction.
 *
 * Fix (2026-05-25): Layer 3 + Layer 4 of validateRouteAssignments now
 * exempt route_kind="handoff" and route_kind="carry" (also zone_drop
 * and react_* for completeness). Handoffs ARE behind the LOS by
 * definition; ball-carriers' tracks start there. Neither is a pass.
 *
 * This eval pins the END-TO-END behavior: Cal must call compose_play
 * for the Jet Reverse, AND the resulting fence must have the reverse
 * carrier running to the OPPOSITE side from the initial fake.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import { fenceCount, fenceVariant } from "../assertions/fence";

const scenario: Scenario = {
  name: "jet-reverse-tackle-11",
  description:
    "Jet Reverse in tackle_11 → compose_play returns a clean fence with the LEFT WR running the reverse to the left side",
  origin: "production bug 2026-05-25 (Layer 4 mis-fired on handoff arrow)",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-jet-reverse",
    playbookName: "Eval — Tackle 11",
  },
  chat: [
    // Pre-confirm the capability so Cal doesn't pause for the "should
    // I enable handoff_chain?" confirmation it offers ~1/3 of the
    // time. We're testing the COMPOSE path, not the confirmation
    // flow.
    { role: "user", text: "Build a Jet Reverse play. Handoff chain is already enabled on the playbook." },
  ],
  assertions: [
    // Cal must call compose_play for this catalog concept — the
    // anti-pattern that surfaced the bug was Cal hand-authoring after
    // compose_play returned an error.
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return /jet.?reverse/.test(c);
    }),

    fenceCount({ exact: 1 }),
    fenceVariant("tackle_11"),

    // The CORE assertion: the reverse carrier (the WEAK-side WR per
    // the skeleton, which for default strength=right is @X on the
    // left) must have a carry path that ENDS on the left side of the
    // field (x < -5). That's the structural proof that the play is a
    // genuine reverse — the ball ends up on the opposite side from
    // the initial fake.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ from?: string; route_kind?: string; path?: [number, number][] }> | undefined) ?? [];
      const carries = routes.filter((r) => r?.route_kind === "carry");
      if (carries.length < 2) {
        return {
          ok: false as const,
          description: "Jet Reverse must have ≥2 carry routes (initial RB + reverse WR)",
          details: `carry routes found: ${carries.length}; route_kinds: [${routes.map((r) => r?.route_kind ?? "?").join(", ")}]`,
        };
      }
      // The reverse carrier is the one whose path ENDS on the
      // opposite side from where the initial fake went. Default
      // strength=right means initial fake is right (positive x); the
      // reverse must end on the left (negative x).
      const reverseCarrier = carries.find((c) => {
        const path = c.path ?? [];
        const lastX = path[path.length - 1]?.[0];
        return typeof lastX === "number" && lastX < -5;
      });
      if (!reverseCarrier) {
        return {
          ok: false as const,
          description: "Jet Reverse must have a carry ENDING on the left side (x < -5) — the actual reverse direction",
          details: `carry endpoints: ${carries.map((c) => {
            const p = (c.path ?? [])[c.path?.length ? c.path.length - 1 : 0];
            return `${c.from}@(${p?.[0] ?? "?"}, ${p?.[1] ?? "?"})`;
          }).join(", ")}`,
        };
      }
      return {
        ok: true as const,
        description: `@${reverseCarrier.from} runs the reverse to the left (end x < -5)`,
      };
    }),

    // Bonus: the QB should have a handoff route (route_kind="handoff"),
    // proving the catalog ballPath ledger rendered correctly.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: true as const, description: "no fence to check (covered by other assertion)" };
      const routes = (f.routes as Array<{ from?: string; route_kind?: string }> | undefined) ?? [];
      const handoffs = routes.filter((r) => r?.route_kind === "handoff");
      if (handoffs.length === 0) {
        return {
          ok: false as const,
          description: "Jet Reverse must include at least one handoff arrow (the QB→B mesh exchange)",
          details: `route_kinds: [${routes.map((r) => r?.route_kind ?? "?").join(", ")}]`,
        };
      }
      return { ok: true as const, description: `${handoffs.length} handoff arrow(s) emitted` };
    }),
  ],
};

export default scenario;
