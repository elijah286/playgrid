/**
 * Phase 3 + Task #36 — coach context personalization with server-side
 * label-alias application.
 *
 * Coach has set `offense_label_Y = "TE"` as a preference. When Cal
 * composes a play that includes @Y, the rendered fence must use @TE
 * (not @Y). Cal drops the renamed fence verbatim and the prose
 * naturally references @TE.
 *
 * Why this is the canonical Phase 3 scenario: preferences have been
 * in production since migration 0188 but had no automated regression
 * coverage. Without this test, a future "simplify the system prompt"
 * refactor could drop the preferences block AND/OR a refactor of the
 * compose_play tool could lose the server-side rename application,
 * silently reverting all coaches' aliases to canonical.
 *
 * Uses the `preferenceOverrides` injection seam so the test runs
 * against in-memory preferences instead of seeding the production DB.
 */

import type { Scenario } from "../types";
import { toolCalled } from "../assertions/tools";
import { fenceCount, fenceHasRouteFor } from "../assertions/fence";

const scenario: Scenario = {
  name: "coach-preference-defender-label",
  description:
    "Coach pref `offense_label_Y = TE` → compose_play emits @TE (not @Y) in fence + Cal's prose follows",
  origin: "Phase 3 MVP + Task #36 — verifies server-side label-alias application end-to-end",
  type: "positive",
  context: {
    sportVariant: "flag_5v5",
    playbookId: "eval-pref-y-to-te",
    playbookName: "Eval — Coach prefs (offense label)",
    preferences: [
      { key: "offense_label_Y", value: "TE" },
    ],
  },
  chat: [
    { role: "user", text: "Draw me a Snag play" },
  ],
  assertions: [
    toolCalled("compose_play", (args) => {
      const c = typeof args.concept === "string" ? args.concept.toLowerCase() : "";
      return c === "snag";
    }),
    fenceCount({ exact: 1 }),
    // The compose_play tool result applies aliases server-side, so
    // the rendered fence has @TE where it would have had @Y.
    fenceHasRouteFor("TE"),
    // The canonical @Y MUST be absent — server-side rename should
    // have replaced every @Y with @TE.
    ((cap) => {
      const firstFence = cap.playFences[0];
      if (!firstFence) {
        return { ok: false as const, description: "expected a fence", details: "no fence emitted" };
      }
      const players = (firstFence.players as Array<{ id?: string }> | undefined) ?? [];
      const yPlayer = players.find((p) => p?.id === "Y");
      if (yPlayer) {
        return {
          ok: false as const,
          description: "fence must NOT contain @Y (should be renamed to @TE)",
          details: `players: ${players.map((p) => `@${p?.id}`).join(", ")}`,
        };
      }
      return { ok: true as const, description: "fence has no @Y (rename applied)" };
    }),
    // Cal's prose SHOULD reference @TE at least once (it's what the
    // diagram shows). Don't strictly forbid @Y in prose — Cal may
    // mention the position class by its canonical name when
    // discussing concepts ("Y route in West Coast vernacular") even
    // when the team's player is @TE. The structural win is the
    // FENCE having the alias applied; prose is best-effort.
    ((cap) => {
      const prose = cap.assistantText.replace(/```[\s\S]*?```/g, "");
      if (!/@TE\b/.test(prose)) {
        return {
          ok: false as const,
          description: "prose should reference @TE at least once (the renamed player)",
          details: `prose did not mention @TE`,
        };
      }
      return { ok: true as const, description: "prose references @TE" };
    }),
  ],
};

export default scenario;
