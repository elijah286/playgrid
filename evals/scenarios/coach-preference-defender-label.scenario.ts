/**
 * Phase 3 — coach context personalization, end-to-end.
 *
 * Coach has set `defender_label_FS = "Free"` as a preference. When
 * Cal draws a defense, the free safety must be labeled @Free (not
 * the default @FS) in both the fence's `players[]` and Cal's prose.
 *
 * Why this scenario: preferences are the foundation of Phase 3
 * personalization. They've been in production since migration 0188
 * but had no automated regression coverage. Without a test, a
 * future "simplify the system prompt" refactor could accidentally
 * drop the preferences block and coaches' label aliases would
 * silently revert to canonical (a high-trust regression — coaches
 * who renamed positions would see Cal forget their team's
 * vocabulary).
 *
 * Uses the new `preferenceOverrides` injection seam so the test
 * runs against in-memory preferences instead of seeding the
 * production DB.
 */

import type { Scenario } from "../types";
import type { Assertion } from "../types";
import { toolCalled } from "../assertions/tools";
import { fenceCount, fenceHasDefenders } from "../assertions/fence";
import { proseUsesAtTokenFor, proseAvoids } from "../assertions/prose";

const scenario: Scenario = {
  name: "coach-preference-defender-label",
  description:
    "Coach pref `defender_label_FS = Free` → Cal labels the free safety @Free in fence + prose",
  origin: "Phase 3 MVP — verifies preferences flow end-to-end",
  type: "positive",
  context: {
    sportVariant: "flag_7v7",
    playbookId: "eval-pref-defender-label",
    playbookName: "Eval — Coach prefs (defender label)",
    preferences: [
      { key: "defender_label_FS", value: "Free" },
    ],
  },
  chat: [
    { role: "user", text: "Show me a Cover 3 defense" },
  ],
  assertions: [
    // Cal should call place_defense OR compose_defense to render
    // the Cover 3 coverage. Either is a valid path.
    ((cap) => {
      const placeCall = cap.toolCalls.find((c) => c.name === "place_defense");
      const composeCall = cap.toolCalls.find((c) => c.name === "compose_defense");
      const argsHaveCover3 = (a: Record<string, unknown>) => {
        const c = typeof a.coverage === "string" ? a.coverage.toLowerCase() : "";
        return c.includes("cover 3");
      };
      if (placeCall && argsHaveCover3(placeCall.input)) {
        return { ok: true as const, description: "place_defense called with Cover 3" };
      }
      if (composeCall && argsHaveCover3(composeCall.input)) {
        return { ok: true as const, description: "compose_defense called with Cover 3" };
      }
      return {
        ok: false as const,
        description: "place_defense OR compose_defense should have been called with Cover 3",
        details: `called: ${cap.toolCalls.map((c) => c.name).join(", ") || "(none)"}`,
      };
    }) as Assertion,
    fenceCount({ exact: 1 }),
    fenceHasDefenders(),
    // The free safety's @-token in the prose must be @Free (the
    // coach's preferred label), not the canonical @FS.
    proseUsesAtTokenFor("Free"),
    proseAvoids(/@FS\b/, "default @FS label (should have been remapped to @Free)"),
  ],
};

export default scenario;
