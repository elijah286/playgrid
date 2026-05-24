/**
 * With an offensive play (Drive) anchored, the coach asks "show me
 * how defense should cover this play now." Cal must overlay defenders
 * on the EXISTING play (compose_defense with on_play set), NOT
 * compose multiple new offensive plays.
 *
 * Origin: production 2026-05-24. Coach's actual prompt produced 7
 * compose_play calls — Cal invented 6 new offensive concepts ("Go —
 * Four Verticals", "King — Curl-Flat", "Vert Under — Levels", etc.)
 * instead of overlaying defense on the anchored Drive. Coach saw
 * "Couldn't auto-save 6 plays" rather than the actual answer. Fixed
 * in commit cbbfca61 with a prompt rule that triggers on
 * deictic "this play" + anchored offense.
 */

import type { Scenario } from "../types";
import { toolCalled, toolNotCalled, toolCallCount } from "../assertions/tools";
import { fenceCount, fenceHasDefenders } from "../assertions/fence";
import { proseContains } from "../assertions/prose";

// A minimal anchored Drive play (7v7). Used as the system-prompt's
// playDiagramText so Cal can see "this play" without a DB fetch.
const DRIVE_FENCE = JSON.stringify({
  title: "Drive",
  variant: "flag_7v7",
  focus: "O",
  players: [
    { id: "QB", x: 0, y: -5, team: "O" },
    { id: "C", x: 0, y: 0, team: "O" },
    { id: "X", x: -12, y: 0, team: "O" },
    { id: "Z", x: 12, y: 0, team: "O" },
    { id: "H", x: -7, y: 0, team: "O" },
    { id: "S", x: 7, y: 0, team: "O" },
    { id: "B", x: 4, y: -5, team: "O" },
  ],
  routes: [
    { from: "H", path: [[3, 3]], route_kind: "Drag" },
    { from: "X", path: [[-6, 12]], route_kind: "Dig" },
    { from: "Z", path: [[12, 18]], route_kind: "Go" },
    { from: "S", path: [[7, 6]], route_kind: "Sit" },
    { from: "B", path: [[6, -3], [10, -1]], route_kind: "Flat" },
  ],
});

const scenario: Scenario = {
  name: "defense-cover-this-play",
  description:
    "With an offense anchored, 'show me how defense should cover this play' produces compose_defense(on_play=...), NOT new compose_play calls",
  origin: "production regression 2026-05-24 (commit cbbfca61 — prompt rule for deictic 'this play')",
  type: "positive",
  context: {
    sportVariant: "flag_7v7",
    playbookId: "eval-defense-cover",
    playbookName: "Eval — Flag 7v7",
    playId: "eval-drive-play",
    anchoredPlayDiagramText: DRIVE_FENCE,
  },
  chat: [
    { role: "user", text: "Okay, but show me how defense should cover this play now" },
  ],
  assertions: [
    // The defense overlay tool MUST be called.
    toolCalled("compose_defense"),
    // The offense-compose tool MUST NOT be called — the anti-pattern
    // is Cal inventing new offensive plays here.
    toolNotCalled("compose_play"),
    // At most one fence in the reply (the defense overlay).
    fenceCount({ max: 1 }),
    // The shipped fence has defenders.
    fenceHasDefenders(),
    // Optionally: should call list_my_playbooks? No — playbook is
    // anchored. Should NOT loop into compose_defense more than 2x
    // even if Cal wants to show multiple coverages (the prompt rule
    // says "2-3 variants in separate turns").
    toolCallCount("compose_defense", { max: 2 }),

    // ── Prose assertions (defense movement + behavior) ──────────────
    // Closes the gap between `projectSpecToNotes` (unit-tested in
    // notes-from-spec.test.ts) and Cal's freelance prose. The
    // projector knows how to describe defenders; this asserts Cal's
    // reply actually surfaces that knowledge for the coach.

    // Defender-movement vocabulary must appear at least once. This is
    // the most permissive cut of football-defense verbs — if Cal
    // emitted a defense fence but didn't describe ANY movement, the
    // reply is just a diagram dump with no coaching value.
    proseContains(
      /\b(cover|covers|covering|plays?|drops?|keys?|reads?|blitzes|spies|carries|passes off|robs?|shades?|shadows?|mirrors?|drives?|jumps?|sits in|walls? off|leverag(?:es?|ing)|rotat(?:es?|ing))\b/i,
    ),

    // Cal's prose must reference at least 3 distinct defenders from
    // the shipped fence with @-tokens. We don't pin specific ids
    // (compose_defense's roster depends on its coverage choice), but
    // the prose must NAME defenders, not just refer to "the defense".
    ((cap) => {
      const f = cap.playFences[0];
      if (!f) return { ok: false as const, description: "expected a fence", details: "no fence" };
      const defenders = ((f.players as Array<{ id?: string; team?: string }> | undefined) ?? [])
        .filter((p) => p?.team === "D" && p?.id);
      const defenderIds = defenders.map((p) => p!.id!);
      const prose = cap.assistantText.replace(/```[\s\S]*?```/g, "");
      const referenced = defenderIds.filter((id) => {
        const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`@${escaped}\\b`).test(prose);
      });
      if (referenced.length < 3) {
        return {
          ok: false as const,
          description: "prose must reference ≥3 distinct defenders by @-token",
          details: `defenders on fence: [${defenderIds.join(", ")}]; referenced in prose: [${referenced.join(", ")}]`,
        };
      }
      return { ok: true as const, description: `prose references ${referenced.length}/${defenderIds.length} defenders by @-token` };
    }),

    // Cal's prose must reference at least one OFFENSIVE player by
    // @-token. This is the "correlated to the anchored play" proof —
    // Cal isn't reciting generic Cover 2 boilerplate, they're
    // describing how the defense reacts to THIS play's routes.
    ((cap) => {
      const prose = cap.assistantText.replace(/```[\s\S]*?```/g, "");
      const offenseIds = ["X", "Z", "H", "S", "B", "C", "Y", "QB", "Q"];
      const found = offenseIds.filter((id) => new RegExp(`@${id}\\b`).test(prose));
      if (found.length === 0) {
        return {
          ok: false as const,
          description: "prose must correlate to the anchored offensive play (≥1 offensive @-token)",
          details: `no @X/@Z/@H/@S/@B/@C/@Y/@Q reference in prose — looks like generic coverage description, not a read of THIS play`,
        };
      }
      return { ok: true as const, description: `prose correlates to anchored play (mentions @${found[0]})` };
    }),
  ],
};

export default scenario;
