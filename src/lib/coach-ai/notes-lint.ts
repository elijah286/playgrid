/**
 * Notes ↔ Spec consistency lint.
 *
 * When Cal rephrases the canonical projection in its own voice, this lint
 * pass catches contradictions between the rephrased prose and the saved
 * PlaySpec. The structural guarantee: words match the play.
 *
 * Conservative by design — only flags ACTIVE contradictions, not omissions:
 *   - PASSES if a player's bullet doesn't mention any route family.
 *     (Coaches can paraphrase tactically: "@X: 5-yard inside cut, sharp
 *     break" doesn't mention "slant" but doesn't contradict either.)
 *   - FAILS if a player's bullet names a different route family than
 *     the spec assigns. ("@X: post route" when spec says Slant.)
 *
 * Rationale: false positives on a hard gate would force Cal to use the
 * exact catalog word every time, producing robotic prose. Catching only
 * contradictions preserves voice while making the worst failure
 * mode — outright disagreement — structurally impossible.
 *
 * Scope (v1):
 *   - Only checks `route` action assignments. Block / carry / motion /
 *     custom / unspecified are exempt — they don't have a single
 *     "right word" to contradict.
 *   - Player references are matched as @Label (case-insensitive).
 *   - Family detection uses the catalog's name + aliases via findTemplate.
 *
 * Future extensions (Phase 5+):
 *   - Depth contradictions ("12-yard slant" when spec is 5).
 *   - Side contradictions ("breaks outside" when spec says toward_qb).
 *   - Modifier contradictions (notes promise a hot route, spec doesn't).
 */

import { findTemplate, ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import type { PlaySpec } from "@/domain/play/spec";

export type NotesLintIssue = {
  /** The player whose bullet contradicted the spec. */
  player: string;
  /** Family the spec assigned. */
  expectedFamily: string;
  /** Family the notes asserted (case-normalized to catalog name). */
  notesFamily: string;
  /** The full bullet line that triggered the issue. */
  bullet: string;
};

export type NotesLintResult =
  | { ok: true }
  | { ok: false; issues: NotesLintIssue[] };

/**
 * Lint a notes string against a saved PlaySpec.
 *
 * Returns ok: true if no contradictions are found. Returns ok: false
 * with structured issues otherwise — caller can format for Cal.
 */
export function lintNotesAgainstSpec(notes: string, spec: PlaySpec): NotesLintResult {
  if (!notes || !spec || !Array.isArray(spec.assignments)) return { ok: true };

  // Index assignments by player label (case-insensitive).
  const routeFamilyByPlayer = new Map<string, string>();
  for (const a of spec.assignments) {
    if (a.action.kind !== "route") continue;
    const template = findTemplate(a.action.family);
    if (!template) continue;
    routeFamilyByPlayer.set(a.player.toUpperCase(), template.name);
  }
  if (routeFamilyByPlayer.size === 0) return { ok: true };

  const issues: NotesLintIssue[] = [];
  const lines = notes.split(/\r?\n/);

  for (const line of lines) {
    const playerMatch = extractPrimaryPlayerRef(line);
    if (!playerMatch) continue;

    const expected = routeFamilyByPlayer.get(playerMatch);
    if (!expected) continue; // line refers to a player without a route assignment

    const detected = detectRouteFamilyMention(line, expected);
    if (detected && detected.toLowerCase() !== expected.toLowerCase()) {
      issues.push({
        player: playerMatch,
        expectedFamily: expected,
        notesFamily: detected,
        bullet: line.trim(),
      });
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

/**
 * Extract the player a notes line is "about". Picks the FIRST @Label
 * reference in the line — by convention bullets lead with @Q / @X / @Y
 * etc. Lines without a leading player reference (a generic opener like
 * "@Q reads the safety: ...") are still attributed to the leading ref.
 *
 * The lint is conservative on attribution: a line that mentions multiple
 * players (e.g. opener that names @Q + @F + @Z) is checked against the
 * FIRST one. This avoids the "opener mentions @F's seam → flagged as a
 * contradiction with @F's actual route" false positive — openers are
 * narrative summaries, not per-player assignments.
 */
function extractPrimaryPlayerRef(line: string): string | null {
  // Skip generic opener lines that don't have the canonical "@X: ..." shape.
  // The shape that maps to a single-player bullet is: "@Label: rest" or
  // "- @Label: rest". Anything else is multi-player narrative.
  const m = line.match(/^[\s-]*@([A-Za-z][A-Za-z0-9]{0,3})\s*:/);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Look for any catalog route family mention in the line.
 *
 * Returns the canonical catalog name of the family detected, or null if
 * no family word appears. Handles aliases (e.g. "fly" → "Go", "stick" →
 * "Sit") and multi-word names ("skinny post", "stop & go", "out & up").
 *
 * Word-boundary matching prevents false positives on substrings: "post"
 * inside "posture" or "support" doesn't trigger.
 *
 * Optimization: when `expectedFamily` is provided, the check skips early
 * if the expected family's name (or any of its aliases) appears in the
 * line — that's the common case (notes paraphrasing the right family),
 * and we don't need to scan the whole catalog.
 */
function detectRouteFamilyMention(line: string, expectedFamily: string): string | null {
  const lower = line.toLowerCase();

  // Fast path: expected family name appears → no contradiction, return it.
  const expectedTemplate = findTemplate(expectedFamily);
  if (expectedTemplate) {
    if (containsWord(lower, expectedTemplate.name.toLowerCase())) {
      return expectedTemplate.name;
    }
    for (const alias of expectedTemplate.aliases ?? []) {
      if (containsWord(lower, alias.toLowerCase())) return expectedTemplate.name;
    }
  }

  // Slow path: scan the catalog for any OTHER family that might be
  // mentioned. First match wins. Sort by name length descending so
  // multi-word matches ("skinny post") win over substrings ("post").
  const sortedTemplates = [...ROUTE_TEMPLATES].sort(
    (a, b) => b.name.length - a.name.length,
  );
  for (const t of sortedTemplates) {
    if (containsWord(lower, t.name.toLowerCase())) return t.name;
    for (const alias of t.aliases ?? []) {
      if (containsWord(lower, alias.toLowerCase())) return t.name;
    }
  }

  return null;
}

/** Word-boundary contains check. Treats spaces, punctuation, and string
 *  edges as boundaries. "post" matches in "post route" but NOT in
 *  "posture" or "outpost". */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  // Escape regex specials in the needle (route names have "&" and "-").
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Use \b only when the needle is alphanumeric — for "stop & go" with
  // a non-word "&", surround with manual boundaries instead.
  const isAlnum = /^[a-z0-9 ]+$/.test(needle);
  const re = isAlnum
    ? new RegExp(`\\b${escaped}\\b`)
    : new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);
  return re.test(haystack);
}

/**
 * Sentence-based prose lint. Use this for CHAT-time validation —
 * Cal's free-form prose ("hit @X on the post, work @H2 on the curl")
 * doesn't follow the strict "- @Label: …" bullet format that
 * lintNotesAgainstSpec assumes, so this variant scans every sentence
 * for @Label references and lints each independently.
 *
 * Algorithm:
 *   - Split prose into sentences (on . ! ? newline boundaries)
 *   - For each sentence, find every @Player reference
 *   - For each reference whose player has a route assignment in the
 *     spec: detect any catalog-family mention in that same sentence
 *     and compare to the expected family
 *   - Active contradictions fail; silent paraphrasing (sentence
 *     mentions @X without naming a family) passes — same conservative
 *     contract as the bullet-based lint
 *
 * Surfaced 2026-05-02: Cal said "hit @X on the post" while the
 * diagram-derived spec had @X on a Slant. The bullet-based lint
 * didn't fire because chat prose isn't bulleted. This catches it.
 */
export function lintProseAgainstSpec(prose: string, spec: PlaySpec): NotesLintResult {
  if (!prose || !spec || !Array.isArray(spec.assignments)) return { ok: true };

  const playerToFamily = new Map<string, string>();
  for (const a of spec.assignments) {
    if (a.action.kind !== "route") continue;
    const template = findTemplate(a.action.family);
    if (!template) continue;
    playerToFamily.set(a.player.toUpperCase(), template.name);
  }
  if (playerToFamily.size === 0) return { ok: true };

  // Sentence boundaries: end-of-sentence punctuation followed by
  // whitespace, OR newline. Conservative — keeps "high-low: hit @X"
  // as one sentence so the @X reference and any nearby family word
  // stay in the same scope.
  const sentences = prose.split(/(?<=[.!?])\s+|\n+/g);

  const issues: NotesLintIssue[] = [];
  // Dedupe — chat prose often mentions a player twice (e.g. once in
  // the QB-read narrative and once in the per-player breakdown).
  // A single contradiction surfaces once, not per-sentence.
  const seen = new Set<string>();

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;
    const refs = [...sentence.matchAll(/@([A-Za-z][A-Za-z0-9]{0,3})\b/g)];
    if (refs.length === 0) continue;

    for (const m of refs) {
      const player = m[1].toUpperCase();
      const expected = playerToFamily.get(player);
      if (!expected) continue;

      const detected = detectRouteFamilyMention(sentence, expected);
      if (!detected) continue;
      if (detected.toLowerCase() === expected.toLowerCase()) continue;

      const dedupeKey = `${player}|${detected}|${expected}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      issues.push({
        player,
        expectedFamily: expected,
        notesFamily: detected,
        bullet: sentence.trim(),
      });
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

/**
 * Format issues into a single critique string for Cal's tool result.
 * Lists each contradiction by carrier + expected vs notes-asserted family
 * so Cal can re-emit with corrected prose.
 */
export function formatNotesLintIssues(issues: ReadonlyArray<NotesLintIssue>): string {
  const lines = issues.map(
    (i) =>
      `  • @${i.player}: notes mention "${i.notesFamily}" but the saved spec assigns "${i.expectedFamily}". Bullet: ${JSON.stringify(i.bullet)}`,
  );
  return (
    `Notes-spec lint failed for ${issues.length} bullet(s) — notes NOT saved. ` +
    `When you rephrase the canonical notes in your own voice, your prose must not contradict the saved PlaySpec. ` +
    `Either fix the prose to use the right family name (or paraphrase WITHOUT naming any family), or call update_play first to change the spec, then re-emit.\n` +
    lines.join("\n")
  );
}
