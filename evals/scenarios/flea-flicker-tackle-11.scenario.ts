/**
 * Flea Flicker in tackle_11 — trick play, QB hands to carrier, then
 * carrier pitches the ball BACK to QB for a deep throw.
 *
 * Catalog (buildFleaFlicker): two-step ballPath where the ball returns
 * to the QB:
 *   1. QB → carrier (handoff behind LOS)
 *   2. carrier → QB (pitch back behind LOS)
 * Then QB throws deep to a Post or Go ≥ 15yd.
 *
 * Requires handoff_chain capability. Forward pitches are validator-
 * rejected — both mesh points must be behind the LOS.
 *
 * Added 2026-05-25 as part of the eval coverage expansion + as the
 * companion to the jet-reverse-tackle-11 scenario (same validator-
 * exemption class for handoff/carry route_kinds, fixed by the
 * 2026-05-25 commit on the same branch).
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import { fenceCount, fenceVariant } from "../assertions/fence";

const scenario: Scenario = {
  name: "flea-flicker-tackle-11",
  description:
    "Flea Flicker in tackle_11 → compose_play emits a 2-step ballPath returning to QB + at least one deep route",
  origin: "eval coverage expansion 2026-05-25",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-flea-flicker-11",
    playbookName: "Eval — Tackle 11",
  },
  chat: [
    { role: "user", text: "Build a Flea Flicker play. Handoff chain is already enabled on the playbook." },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "flea flicker" || c === "flea-flicker" || c === "fleaflicker";
    }),
    fenceCount({ exact: 1 }),
    fenceVariant("tackle_11"),
    // Flea Flicker MUST have a deep route (Post or Go ≥ 15yd) for
    // the QB to throw to after the pitch-back. Without it, the play
    // is just a botched handoff.
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const routes = (f.routes as Array<{ from?: string; route_kind?: string; path?: [number, number][] }> | undefined) ?? [];
      const deepRoutes = routes.filter((r) => {
        const kind = (r.route_kind ?? "").toLowerCase();
        if (kind !== "post" && kind !== "go") return false;
        const maxY = Math.max(...(r.path ?? []).map((p) => p[1]));
        return maxY >= 15;
      });
      if (deepRoutes.length === 0) {
        return {
          ok: false as const,
          description: "Flea Flicker must have a deep route (Post or Go ≥ 15yd) for the post-pitch throw",
          details: `routes: ${routes.map((r) => `${r.from}=${r.route_kind ?? "?"}@${Math.max(...(r.path ?? []).map((p) => p[1])).toFixed(0)}yd`).join(", ")}`,
        };
      }
      return {
        ok: true as const,
        description: `${deepRoutes.length} deep route(s) for QB's throw`,
      };
    }),
    // Behind-LOS mesh points should NOT have failed the forward-pass
    // validator (the bug fixed today for Jet Reverse — same class).
    // Just verify the fence shipped at all (no apology stripping).
    ((cap) => {
      const prose = cap.assistantText.replace(/```[\s\S]*?```/g, "");
      if (/couldn'?t compose this play correctly|geometry didn'?t pass internal validation/i.test(prose)) {
        return {
          ok: false as const,
          description: "Flea Flicker fence must SHIP (no 'couldn't compose' apology)",
          details: `validator stripped the fence — likely a handoff/carry exemption regression`,
        };
      }
      return { ok: true as const, description: "fence shipped cleanly (no validator strip)" };
    }),
  ],
};

export default scenario;
