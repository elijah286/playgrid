/**
 * Coach is anchored to a playbook that already has two RUN OFFENSE
 * plays (Dive Right and Sweep Right). They ask Cal to "install
 * defenses into this playbook to illustrate this." Cal must call
 * `compose_defense` (the defense tool), NOT `compose_play` (which
 * produces offense — the catastrophic bug from 2026-05-25).
 *
 * Origin: production regression 2026-05-25. A coach reviewing 3-4
 * defense responses on existing run plays said "can you install
 * defenses into this playbook to illustrate this?" Cal called
 * `compose_play` 4× and `compose_defense` 1×, producing offensive
 * plays titled "3-4 vs Dive Right" / "3-4 vs Sweep Right" with NO
 * defenders on the diagram. Fixed in commit 7baaeba5 with Rule 7h
 * (DEFENSE-INSTALL ROUTING) and the `list_my_playbooks` anchored
 * guard.
 *
 * This scenario pins both the tool-routing fix and the structural
 * guarantee that any saved defense overlay has defenders.
 */

import type { Scenario } from "../types";
import { toolNotCalled } from "../assertions/tools";
import { fenceHasDefenders } from "../assertions/fence";
import { proseContains } from "../assertions/prose";

const DIVE_FENCE = JSON.stringify({
  title: "Dive Right (IZ)",
  variant: "tackle_11",
  focus: "O",
  players: [
    { id: "QB", x: 0,  y: -5, team: "O" },
    { id: "B",  x: 0,  y: -7, team: "O" },
    { id: "F",  x: 1,  y: -3, team: "O" },
    { id: "LT", x: -6, y:  0, team: "O" },
    { id: "LG", x: -3, y:  0, team: "O" },
    { id: "C",  x:  0, y:  0, team: "O" },
    { id: "RG", x:  3, y:  0, team: "O" },
    { id: "RT", x:  6, y:  0, team: "O" },
    { id: "Y",  x:  9, y:  0, team: "O" },
    { id: "X",  x: -15, y: 0, team: "O" },
    { id: "Z",  x:  15, y: 0, team: "O" },
  ],
  routes: [
    { from: "QB", route_kind: "carry", path: [[0, -3]] },
    { from: "B",  route_kind: "carry", path: [[2, 0], [3, 4], [5, 8]] },
  ],
});

const scenario: Scenario = {
  name: "install-defenses-routing",
  description:
    "Anchored playbook + 'install defenses' verb → Cal calls compose_defense, NOT compose_play; no list_my_playbooks; resulting fence has defenders",
  origin: "production regression 2026-05-25 (commit 7baaeba5 — Rule 7h DEFENSE-INSTALL ROUTING + list_my_playbooks anchored guard)",
  type: "positive",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-install-defenses",
    playbookName: "Reddit Drawings (eval)",
    playId: "eval-dive-play",
    anchoredPlayDiagramText: DIVE_FENCE,
  },
  chat: [
    // Match the production message verbatim.
    { role: "user", text: "can you install defenses into this playbook to illustrate this?" },
  ],
  assertions: [
    // ── PRIMARY ANTI-PATTERNS (the actual production bugs) ───────────
    // compose_play (offense) MUST NOT fire on this defense request.
    // The production bug was 4× compose_play calls producing offense
    // plays with defense-sounding titles. THIS is the load-bearing
    // assertion — anything else can vary by Cal's tact.
    toolNotCalled("compose_play"),
    // The anchored-playbook guard. Cal saw "Anchored to Reddit Drawings
    // (eval)" in the system prompt; calling list_my_playbooks
    // mid-conversation produces the chip prompt that confused the
    // production coach. The handler refuses anyway (returns ok:false),
    // but Cal shouldn't try in the first place.
    toolNotCalled("list_my_playbooks"),

    // ── BEHAVIOR (compose_defense path OR offer-to-overlay path) ─────
    // Two valid Cal responses to this prompt:
    //   (a) Compose defense overlays immediately (compose_defense fires,
    //       and the fence has defenders); OR
    //   (b) Per Rule 7h-followup, offer to show vs each play first and
    //       wait for the coach to confirm before composing.
    // Both prove the bug is fixed. The wrong move was producing
    // offense-only "3-4 vs Dive Right" fences via compose_play.
    (cap) => {
      const calledDefense = cap.toolCalls.some((c) => c.name === "compose_defense");
      const offeredFirst = /(?:Want me to|Should I|let me know).*(?:show|overlay|see how).*(?:defense|cover|vs)/i.test(cap.assistantText) ||
        /(?:Which|What).*(?:play|coverage|defense).*\?/i.test(cap.assistantText);
      if (calledDefense || offeredFirst) {
        return {
          ok: true as const,
          description: calledDefense
            ? "compose_defense was called (overlay path)"
            : "Cal offered the matchup first (offer-to-overlay path)",
        };
      }
      return {
        ok: false as const,
        description: "Cal should either call compose_defense OR offer to show the matchup",
        details: `tools called: [${cap.toolCalls.map((c) => c.name).join(", ")}]; reply: ${cap.assistantText.slice(0, 200)}`,
      };
    },

    // If a fence shipped, it must have defenders. The bug class was
    // OFFENSE-ONLY fences with defensive titles — that's the exact
    // case we must rule out. Empty-fence replies (offer path) pass
    // trivially.
    (cap) => {
      if (cap.playFences.length === 0) {
        return { ok: true as const, description: "no fence shipped (offer-first path)" };
      }
      return fenceHasDefenders()(cap);
    },

    // Prose must NOT claim a defensive play was saved via
    // compose_play. "Installed Cover 3 over Dive Right" without a
    // compose_defense call is a phantom save claim.
    proseContains(
      /(?:compose_defense|defense overlay|defenders|coverage|man|zone|cover [0-9]|tampa 2|3-4|4-3|nickel)/i,
    ),
  ],
};

export default scenario;
