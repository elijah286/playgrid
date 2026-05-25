/**
 * Coach is anchored to a playbook and asks Cal to do something that
 * doesn't require switching teams. Cal must NOT call
 * `list_my_playbooks` — the picker chip prompt mid-conversation is a
 * regression. The system prompt's "Anchored playbook" block tells Cal
 * which playbook is in scope; the handler refuses the call anyway,
 * but Cal shouldn't even try.
 *
 * Origin: production regression 2026-05-25 (same exchange as the
 * defense-install bug above). The coach was anchored to "Reddit
 * Drawings" and Cal still surfaced a "Pick a team:" chip prompt.
 * Fixed in commit 7baaeba5 by adding the handler guard + Rule 7b
 * prohibition in NORMAL_PROMPT.
 *
 * Test shape: a plain question about the anchored playbook's plays.
 * Cal should answer using the anchored context, not list playbooks.
 */

import type { Scenario } from "../types";
import { toolNotCalled } from "../assertions/tools";

const scenario: Scenario = {
  name: "anchored-no-list-my-playbooks",
  description:
    "Anchored playbook + any question → Cal does NOT call list_my_playbooks (no picker chip mid-conversation)",
  origin: "production regression 2026-05-25 (commit 7baaeba5 — list_my_playbooks anchored-playbook guard)",
  type: "negative",
  context: {
    sportVariant: "tackle_11",
    playbookId: "eval-anchored-no-list",
    playbookName: "Reddit Drawings (eval)",
  },
  chat: [
    // A coaching question that has nothing to do with switching
    // playbooks. The coach wants advice in the current playbook
    // scope; Cal should answer without surfacing a picker.
    { role: "user", text: "What's the best way to teach the inside zone read to my linebackers?" },
  ],
  assertions: [
    // The CRITICAL assertion — anchored mode + no explicit switch
    // request = never call the picker.
    toolNotCalled("list_my_playbooks"),
  ],
};

export default scenario;
