/**
 * Server-side authoritative context scoping.
 *
 * The chat thread is playbook-scoped, so a coach who opens a specific play can
 * receive a stale conversation that was really about a DIFFERENT play in the
 * same playbook. The client tries to collapse that (context-boundary.ts), but
 * its continuity heuristic is fooled by a play merely being MENTIONED in
 * passing (a `play://<id>` link in an old multi-play recap), so the whole stale
 * conversation reaches the model.
 *
 * Surfaced 2026-07-04 (prod): a coach opened "Curl-Flat Right" and asked "what
 * is the best way to defend this play?" — Cal answered about "Bubble Right",
 * because a month-old conversation whose most-recent topic was Bubble Right was
 * still in context, and the client divider didn't fire (Curl-Flat Right's
 * play:// link appeared in an old notes recap, so the continuity exception
 * held). The old turns were legacy (play_id NULL), so Layer 2's per-turn scope
 * couldn't exclude them either.
 *
 * This module is the SERVER's backstop: it decides where the model's context
 * should start when a play is anchored, dropping turns that are clearly about a
 * DIFFERENT play. The anchored play's diagram is always injected into the system
 * prompt separately, so dropping stale chatter never leaves the model blind —
 * it just removes the wrong-play distractor.
 */

export type ScopeTurn = { role: string; text: string; playId?: string | null };

const PLAY_FENCE_RE = /```play\s*\n([\s\S]*?)\n```/g;

/** Normalize a play name/title for loose comparison: lowercase, non-alphanumeric
 *  collapsed to single spaces, trimmed. "Curl-Flat Right" -> "curl flat right". */
export function normalizePlayName(name: string | null | undefined): string {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Titles of every ```play fence in a turn's text (unparseable fences skipped). */
function fenceTitles(text: string): string[] {
  const titles: string[] = [];
  for (const m of text.matchAll(PLAY_FENCE_RE)) {
    try {
      const obj = JSON.parse(m[1]) as { title?: unknown };
      if (typeof obj.title === "string" && obj.title.trim()) titles.push(obj.title);
    } catch {
      /* streaming / off-shape fence — ignore */
    }
  }
  return titles;
}

/** True when a fence title refers to the anchored play — exact, or as an
 *  overlay/variant ("Curl-Flat Right vs Cover 2" contains "curl flat right").
 *  Substring in EITHER direction so short titles ("Mesh") and decorated titles
 *  ("Mesh vs Tampa 2") both match. Empty anchored name never matches. */
function titleMatchesAnchor(title: string, normAnchoredName: string): boolean {
  if (!normAnchoredName) return false;
  const nt = normalizePlayName(title);
  if (!nt) return false;
  return nt.includes(normAnchoredName) || normAnchoredName.includes(nt);
}

/**
 * True when this turn is clearly ABOUT a different play than the anchored one:
 *  - it was stamped (Layer 2) with a different, non-null playId; OR
 *  - it shows one or more ```play fences and NONE of them names the anchored
 *    play (handles legacy null-playId turns via title matching).
 *
 * A turn with no fence and no conflicting stamp is treated as neutral (not
 * off-topic) — pure Q&A and prose don't pin the conversation to a play.
 */
export function isOffTopicForAnchor(
  turn: ScopeTurn,
  anchoredPlayId: string,
  normAnchoredName: string,
): boolean {
  if (typeof turn.playId === "string" && turn.playId && turn.playId !== anchoredPlayId) {
    return true;
  }
  const titles = fenceTitles(turn.text);
  if (titles.length === 0) return false;
  return !titles.some((t) => titleMatchesAnchor(t, normAnchoredName));
}

/**
 * Index into `history` where the model's context should start when a play is
 * anchored. Everything before it is dropped from what the model sees. The
 * boundary sits just after the LAST turn that is clearly about a different play,
 * so the retained suffix is the on-anchor (or neutral) tail. Returns 0 when no
 * play is anchored or nothing is off-topic.
 *
 * Example (the 2026-07-04 bug): history ends with a "show me bubble right" turn
 * (a Bubble Right fence) while the coach is anchored to Curl-Flat Right — that
 * last turn is off-topic, so the boundary is the end of history and the model
 * sees only the current question plus the anchored Curl-Flat Right diagram.
 */
export function computeAnchoredContextStart(opts: {
  history: ReadonlyArray<ScopeTurn>;
  anchoredPlayId: string | null | undefined;
  anchoredPlayName: string | null | undefined;
}): number {
  const { history, anchoredPlayId } = opts;
  if (!anchoredPlayId) return 0;
  const normName = normalizePlayName(opts.anchoredPlayName);
  let boundary = 0;
  for (let i = 0; i < history.length; i++) {
    if (isOffTopicForAnchor(history[i], anchoredPlayId, normName)) boundary = i + 1;
  }
  return boundary;
}
