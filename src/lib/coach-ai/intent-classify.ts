/**
 * Intent classification for coach messages — a small, pure helper used
 * to (a) prevent Cal from picking the wrong tool when the user's intent
 * is unambiguous, and (b) feed observability about real-world misroutes.
 *
 * Surfaced 2026-05-25 production: a coach with an anchored playbook
 * containing two RUN OFFENSE plays (Dive, Sweep) asked Cal "can you
 * install defenses into this playbook to illustrate this?" Cal called
 * `compose_play` 4× and `compose_defense` 1× — producing offensive
 * plays titled "3-4 vs Dive Right" with no defenders. The coach's
 * intent was unambiguously DEFENSIVE: install/save-verb +
 * "defenses" plural. The compose_play tool produces OFFENSE.
 *
 * This module defines the intent shape and the classifier. Callers:
 *  - `agent.ts` injects a turn-scoped warning into the system prompt
 *    when the classifier fires.
 *  - `tools.ts` (compose_play handler) hard-rejects when the recent
 *    user message classifies as `install-defense` AND the play would
 *    have no defenders.
 *  - tests pin both the classifier shape and the prompt-injection.
 *
 * The classifier deliberately uses simple regex over training-data-
 * derived vocabulary — adding an LLM intent layer here would re-create
 * the bug class it's trying to fix.
 */

/** Discriminated union describing the inferred defensive intent
 *  (if any) of a coach's message. Callers branch on `kind`. */
export type DefenseIntent =
  /** Coach wants defensive plays SAVED to the playbook.
   *  Save-intent verb ("install", "save", "add", "create", "build",
   *  "keep", "put in", "set up", "wire up") + plural "defenses" / a
   *  named defensive scheme / a generic "defense" + a noun phrase
   *  like "this play" or "these plays". The right tool is
   *  `compose_defense`, called once per offense play to overlay
   *  defense + auto-save. */
  | { kind: "install-defense"; scheme?: string; matchedVerb: string; matchedNoun: string }
  /** Coach wants to SEE a defensive scheme drawn — visual answer,
   *  no save expected. Tampa 2 demo, "show me Cover 3", "what's a
   *  4-3 look like". The right tool is still `compose_defense`
   *  (without on_play, returns a standalone defense diagram). */
  | { kind: "explain-defense"; scheme?: string; matchedVerb: string }
  /** Coach asked about how a defense covers a specific play already
   *  on screen. "How does Cover 1 defend this", "show this vs Tampa
   *  2". The right tool is `compose_defense({ on_play })`. */
  | { kind: "overlay-defense"; scheme?: string; matchedNoun: string }
  /** No defensive intent detected — caller falls back to default
   *  routing. Returned for offensive prompts, ambiguous text, or
   *  empty input. */
  | { kind: "none" };

/** Save-intent verbs — same list used by `SAVE_INTENT_DEFENSE_RE` in
 *  `agent.ts`. Duplicated here so this module has no runtime dep on
 *  the agent (keeps the unit-test surface small). */
const SAVE_VERBS = [
  "install",
  "save",
  "add",
  "create",
  "build",
  "keep",
  "stick",
  "lock\\s+in",
  "set\\s+up",
  "put\\s+in",
  "wire\\s+up",
  "make",
];

/** Explanation/demo verbs that don't imply a save. */
const SHOW_VERBS = [
  "show",
  "draw",
  "demo",
  "demonstrate",
  "illustrate",
  "walk\\s+me\\s+through",
  "what(?:\\s+does|'s|\\s+is)",
  "how\\s+does",
  "how\\s+do",
  "explain",
];

/** Catalog of defensive-scheme names and fronts the classifier
 *  recognizes. The list is intentionally generous — false positives
 *  here are harmless (compose_defense IS the right tool whenever any
 *  of these are named alongside install/show intent), but a missing
 *  entry silently misroutes back to compose_play. When a coach uses
 *  a new defensive scheme name, ADD IT HERE — don't try to make the
 *  regex cleverer.
 *
 *  Two grouping conventions:
 *  - Fronts (3-4, 4-3, 4-4, 5-2, etc.) — match WITH the hyphen.
 *  - Coverages (Cover 0-6, Tampa 2, Quarters, Man, Zone, etc.) —
 *    match with word boundaries.
 *  - Specialty schemes (Bear, Okie, 46, Robber, etc.) — same. */
const DEFENSE_FRONTS = [
  "3-4",
  "4-3",
  "4-4",
  "5-2",
  "6-1",
  "46\\s+defense", // 46 the defense, not 46 the number
  "bear",
  "okie",
  "nickel",
  "dime",
  "quarter",
];
const DEFENSE_COVERAGES = [
  "cover\\s*[0-6]", // Cover 0, Cover 1, ..., Cover 6
  "tampa\\s*2",
  "quarters",
  "robber",
  "press",
  "trail",
];
const DEFENSE_BEHAVIORS = [
  "man\\s+coverage",
  "zone\\s+coverage",
  "man-to-man",
  "blitz",
  "spy",
  "fire\\s+zone",
];

/** Build a single regex from a list of source patterns. */
function unionRe(patterns: string[], flags = "i"): RegExp {
  return new RegExp(`\\b(${patterns.join("|")})\\b`, flags);
}

const SAVE_RE = unionRe(SAVE_VERBS);
const SHOW_RE = unionRe(SHOW_VERBS);
const DEFENSE_SCHEME_RE = unionRe([
  ...DEFENSE_FRONTS,
  ...DEFENSE_COVERAGES,
  ...DEFENSE_BEHAVIORS,
]);

/** Plural / generic defense noun. Matches "defenses" (the canonical
 *  bug pattern), "the defense", "a defense", "some defense", etc.
 *  NOT a bare "defense" inside "defense of" or "defensive coordinator"
 *  — too easy to false-positive on metadiscussion. */
const DEFENSE_NOUN_RE = /\b(defense(s)?|defensive\s+(scheme|play|call|set|look|front|coverage))\b/i;

/** Deictic / play reference that targets an existing play on screen.
 *  "this play", "these plays", "the play above", "that". Combined
 *  with a defensive scheme, signals overlay intent. */
const PLAY_REFERENCE_RE = /\b(this\s+play|these\s+plays|the\s+play|that\s+play|the\s+plays\s+above|each\s+(?:of\s+)?(?:these|those)|on\s+(?:these|those)\s+plays|vs|against|facing)\b/i;

/** Extract the first matched defense scheme word from the message,
 *  or undefined. Used to enrich the returned intent object. */
function extractScheme(message: string): string | undefined {
  const m = message.match(DEFENSE_SCHEME_RE);
  return m ? m[0] : undefined;
}

function extractMatch(message: string, re: RegExp): string {
  const m = message.match(re);
  return m ? m[0] : "";
}

/** Strip common conversational noise (emoji, leading whitespace,
 *  surrounding quotes) so the regexes have a chance to match. */
function normalize(message: string): string {
  return message.trim().replace(/^["'\s]+|["'\s]+$/g, "");
}

/**
 * Classify a coach's free-form message into one of the defensive
 * intent buckets above. Returns `{ kind: "none" }` for offensive
 * prompts, empty input, or anything ambiguous.
 *
 * Decision tree (first match wins):
 *  1. Save verb + (defense noun OR scheme name)  → install-defense
 *  2. Scheme name + play reference ("this play") → overlay-defense
 *  3. Show verb + (defense noun OR scheme name)  → explain-defense
 *  4. Defense noun alone                          → none (too weak)
 *  5. Otherwise                                   → none
 *
 * Examples (see `intent-classify.test.ts` for the full set):
 *  - "install defenses into this playbook"        → install-defense
 *  - "add the 3-4 to these plays"                 → install-defense
 *  - "show me Tampa 2"                            → explain-defense
 *  - "show this play vs Cover 1"                  → overlay-defense
 *  - "make me a Mesh play"                        → none (offense)
 *  - ""                                           → none
 */
export function classifyDefenseIntent(messageInput: string): DefenseIntent {
  const message = normalize(messageInput);
  if (!message) return { kind: "none" };

  const scheme = extractScheme(message);
  const hasDefenseNoun = DEFENSE_NOUN_RE.test(message);
  const hasScheme = !!scheme;
  const hasSaveVerb = SAVE_RE.test(message);
  const hasShowVerb = SHOW_RE.test(message);
  const hasPlayRef = PLAY_REFERENCE_RE.test(message);

  // (1) install-defense — save verb wins decisively when paired with
  // anything defensive. This is the canonical bug pattern.
  if (hasSaveVerb && (hasDefenseNoun || hasScheme)) {
    return {
      kind: "install-defense",
      scheme,
      matchedVerb: extractMatch(message, SAVE_RE),
      matchedNoun: hasDefenseNoun ? extractMatch(message, DEFENSE_NOUN_RE) : (scheme ?? ""),
    };
  }

  // (2) overlay-defense — scheme + play reference signals "show THIS
  // PLAY vs <scheme>". Note: no save verb here, so the result is
  // visual answer, not a save. Caller still uses compose_defense.
  if (hasScheme && hasPlayRef) {
    return {
      kind: "overlay-defense",
      scheme,
      matchedNoun: extractMatch(message, PLAY_REFERENCE_RE),
    };
  }

  // (3) explain-defense — show verb + scheme/defense noun.
  if (hasShowVerb && (hasDefenseNoun || hasScheme)) {
    return {
      kind: "explain-defense",
      scheme,
      matchedVerb: extractMatch(message, SHOW_RE),
    };
  }

  // (4) Bare defense noun is too weak — could be metadiscussion
  // ("our defense is struggling", "defense wins championships").
  // Fall through to none.
  return { kind: "none" };
}

/** Convenience predicate — returns true when the coach's message
 *  unambiguously asks to SAVE defensive plays. Used by `compose_play`
 *  to refuse with a redirecting error when called against the
 *  classifier's verdict. */
export function isInstallDefenseIntent(message: string): boolean {
  return classifyDefenseIntent(message).kind === "install-defense";
}
