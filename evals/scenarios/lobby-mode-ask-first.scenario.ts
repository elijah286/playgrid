/**
 * Coach asks for a play from lobby mode (no playbook anchored).
 * Cal must ASK FIRST ("save this to a playbook, or just describe
 * the concept?") rather than composing a full-roster play. The
 * validator's lobby-mode hard gate rejects full-roster fences in
 * lobby mode anyway — but this scenario verifies Cal proactively
 * asks rather than blowing through the gate.
 *
 * Origin: 2026-05-20 regression. A coach chatted with Cal from the
 * home page (no anchored playbook), Cal emitted 6 play fences and
 * narrated "Play 2 saved" across multiple turns. The auto-commit
 * never ran because there was no target playbook. Every fence
 * silently evaporated; the coach saw "saved" claims that weren't
 * true. Rule 8a (LOBBY-MODE ASK-FIRST) was added to force the
 * pre-compose question.
 */

import type { Scenario } from "../types";
import { toolNotCalled } from "../assertions/tools";
import { fenceCount } from "../assertions/fence";
import { proseContains, proseAvoids } from "../assertions/prose";

const scenario: Scenario = {
  name: "lobby-mode-ask-first",
  description:
    "Lobby mode + play request → Cal asks 'save or describe?' rather than composing a full play",
  origin: "regression 2026-05-20 (rule 8a — LOBBY-MODE ASK-FIRST RULE)",
  type: "positive",
  context: {
    // No playbookId — this is lobby mode.
    sportVariant: "flag_7v7",
  },
  chat: [
    { role: "user", text: "Draw me a Mesh play" },
  ],
  assertions: [
    // No fences ship in lobby mode (the chat-time validator's
    // lobby-mode gate enforces this structurally, and Cal should
    // know to ask first rather than waste tool calls).
    fenceCount({ exact: 0 }),
    // Cal must NOT call compose_play before asking — the prompt
    // rule explicitly says "STOP after asking. Do NOT call
    // compose_play, do NOT emit a fence."
    toolNotCalled("compose_play"),
    // Cal's prose must surface SOME way of asking about the
    // playbook anchor. The exact phrasing varies (Cal might say
    // "save to a playbook?", "which team?", "describe vs save",
    // "which playbook do you want this in", etc.) but the question
    // shape is stable: ask before composing.
    proseContains(/which (team|playbook)|save.{0,80}playbook|describe (the )?concept|just describe|save (it|this) (to|in)/i),
    // Cal must NOT claim a play was already saved. Phantom claims
    // are past-tense + first-person assertions ("I saved it",
    // "I've created the play", "Play added to your playbook").
    // Conditional / future phrasings are OK ("I can save it",
    // "would you like me to save it") — those don't mislead.
    proseAvoids(
      /\b(I('| ha)?ve saved|I saved|saved (it|this|the play)|added (it|this|the play) to|created the play|✓ created|play created)\b/i,
      "phantom save claim",
    ),
  ],
};

export default scenario;
