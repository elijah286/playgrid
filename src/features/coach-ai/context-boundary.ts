import type { CoachAiTurn } from "@/app/actions/coach-ai";

/**
 * Continuity-aware context boundary for the Coach Cal chat.
 *
 * The chat thread is playbook-scoped, so opening a different play (or returning
 * after a session gap) used to drag the prior play's conversation into Cal's
 * working context — Cal then answered about the WRONG play (surfaced 2026-06-30:
 * coach opened "Screen", Cal kept talking about "Stick Right" from a prior
 * session). The old fix inserted a prose "[Context switch]" bridge that the LLM
 * ignored and still sent every stale turn.
 *
 * This replaces that soft nudge with a HARD boundary: when the coach opens a
 * play the live conversation isn't about, a `context-divider` marker is inserted.
 * Turns before the last divider are "earlier conversation" — collapsed in the UI
 * and NOT sent to the agent. New turns accumulate after it. The divider is a
 * UI-only marker, never sent to Cal.
 *
 * Continuity exception: if the play the coach just opened was CREATED in this
 * conversation (its `play://<id>` link appears in the turns), opening it is not a
 * discontinuity — keep the context that built it. This is what stops the
 * "build a counter to this play, then it opens" flow from resetting mid-thought.
 */

export const CONTEXT_DIVIDER_KIND = "context-divider" as const;

export function isContextDivider(t: CoachAiTurn): boolean {
  return t.role === "assistant" && t.kind === CONTEXT_DIVIDER_KIND;
}

/** Build a context divider marker turn with a short summary label. */
export function contextDividerTurn(label: string): CoachAiTurn {
  return { role: "assistant", text: label, toolCalls: [], kind: CONTEXT_DIVIDER_KIND };
}

/**
 * Index where the ACTIVE context starts = just after the last context divider.
 * Turns at indices `[0, contextStartIndex)` are the collapsed "earlier
 * conversation"; turns at `[contextStartIndex, end)` are the active context.
 * Returns 0 when there's no divider (the whole thread is active).
 */
export function contextStartIndex(turns: ReadonlyArray<CoachAiTurn>): number {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (isContextDivider(turns[i])) return i + 1;
  }
  return 0;
}

/**
 * True when `playId` is created/linked anywhere in these turns (a `play://<id>`
 * reference). Drives the continuity exception: a play built in this very
 * conversation is continuous with it, so opening it must NOT reset the context.
 */
export function playReferencedInTurns(
  turns: ReadonlyArray<CoachAiTurn>,
  playId: string | null | undefined,
): boolean {
  if (!playId) return false;
  const needle = `play://${playId}`;
  return turns.some((t) => t.text.includes(needle));
}

/**
 * True when the conversation is "about" `playId` — some turn was authored on it
 * (Layer 2 per-turn playId) OR it's referenced via a `play://<id>` link. Drives
 * the discontinuity decision: opening/returning to a play the conversation
 * covers is continuous (keep context); a play it does NOT cover is a
 * discontinuity (insert a divider). Self-heals — once the coach interacts on a
 * play, its turns carry the id, so later opens read as continuous.
 */
export function conversationCoversPlay(
  turns: ReadonlyArray<CoachAiTurn>,
  playId: string | null | undefined,
): boolean {
  if (!playId) return false;
  if (playReferencedInTurns(turns, playId)) return true;
  return turns.some((t) => t.playId === playId);
}

/**
 * The turns to send to the agent: the active context only (after the last
 * divider), with any divider markers stripped (they're UI-only and meaningless
 * to the model).
 */
export function activeContextTurns(turns: ReadonlyArray<CoachAiTurn>): CoachAiTurn[] {
  return turns.slice(contextStartIndex(turns)).filter((t) => !isContextDivider(t));
}
