/**
 * ask_choice — render an explicit multiple-choice question as tappable buttons
 * instead of a prose "reply 1 / 2 / 3" list. Mirrors the propose_* chip pattern
 * (playbook-tools.ts, save-defense-tools.ts): the tool emits a structured
 * `choice-proposal` fence in its RESULT; the agent parses it into
 * AgentResult.choiceChips; the chat renders the buttons. Tapping a button sends
 * that option's label back as the coach's next message — so the whole loop
 * reuses the existing send path; this tool never writes anything.
 *
 * Surfaced 2026-06-30 (coach feedback): the explicit-answer card "asking the
 * user for an explicit answer to a question" tested great — adopt it broadly so
 * Cal stops asking open-ended "which one? reply with a number" questions.
 */
import type { CoachAiTool } from "./tools";

export type ChoiceOption = {
  id: string;
  /** Button text AND the message sent when the coach taps it. Phrase as a
   *  complete, self-contained answer Cal can act on. */
  label: string;
  /** Optional one-line description shown under the label. */
  detail?: string;
};

export type ChoiceProposal = {
  proposalId: string;
  /** Short prompt shown above the buttons (e.g. "Which concept?"). */
  question: string;
  options: ChoiceOption[];
};

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function fenceProposal(p: ChoiceProposal): string {
  return "```choice-proposal\n" + JSON.stringify(p) + "\n```";
}

/** Pure builder + validator, exported for unit testing. Returns the proposal
 *  or an error string. Caps options at 2–5 and drops blank labels. */
export function buildChoiceProposal(input: {
  question?: unknown;
  options?: unknown;
}): { ok: true; proposal: ChoiceProposal } | { ok: false; error: string } {
  const question = typeof input.question === "string" ? input.question.trim() : "";
  if (!question) return { ok: false, error: "question is required." };
  const raw = Array.isArray(input.options) ? input.options : [];
  const options: ChoiceOption[] = [];
  for (const o of raw) {
    if (!o || typeof o !== "object") continue;
    const rec = o as Record<string, unknown>;
    const label = typeof rec.label === "string" ? rec.label.trim() : "";
    if (!label) continue;
    const detailRaw = typeof rec.detail === "string" ? rec.detail.trim() : "";
    options.push(detailRaw ? { id: newId(), label, detail: detailRaw } : { id: newId(), label });
  }
  if (options.length < 2) return { ok: false, error: "Provide at least 2 options with non-empty labels." };
  if (options.length > 5) return { ok: false, error: "Provide at most 5 options." };
  return { ok: true, proposal: { proposalId: newId(), question, options } };
}

export const ask_choice: CoachAiTool = {
  def: {
    name: "ask_choice",
    description:
      "Ask the coach to pick from a SMALL set of enumerable options, rendered as tappable buttons instead of a " +
      "prose 'reply 1/2/3' list. Use whenever your reply would otherwise ask the coach to choose among 2–5 " +
      "concrete, mutually-exclusive options — which concept to build, which coverage to overlay, which formation, " +
      "a yes/no with a clear consequence, etc. Tapping a button sends that option's label back as the coach's next " +
      "message, so phrase each label as a COMPLETE, self-contained answer Cal can act on (e.g. 'Build the Stick " +
      "concept', not just 'Stick'). Keep `detail` to a short clause. Do NOT use for open-ended questions, for free " +
      "text the coach must type (names, numbers, dates), or for more than 5 options. Emit ONLY the tool call plus a " +
      "one-line lead-in at most — do NOT also list the options in prose; the buttons replace the list.",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "Short prompt shown above the buttons (one sentence, e.g. 'Which Cover 3 beater do you want?').",
        },
        options: {
          type: "array",
          minItems: 2,
          maxItems: 5,
          description: "2–5 mutually-exclusive options.",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "Button text AND the message sent on tap. Phrase as a complete, actionable answer.",
              },
              detail: { type: "string", description: "Optional one-line description shown under the label." },
            },
            required: ["label"],
            additionalProperties: false,
          },
        },
      },
      required: ["question", "options"],
      additionalProperties: false,
    },
  },
  async handler(input) {
    const built = buildChoiceProposal(input as { question?: unknown; options?: unknown });
    if (!built.ok) return { ok: false, error: built.error };
    return {
      ok: true,
      result:
        `Presented ${built.proposal.options.length} choice buttons to the coach. ` +
        `Awaiting their tap (it arrives as their next message).\n\n${fenceProposal(built.proposal)}`,
    };
  },
};
