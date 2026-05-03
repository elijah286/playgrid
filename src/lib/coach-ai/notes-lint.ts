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

export type DepthLintIssue = {
  /** The player whose bullet asserted a wrong depth. */
  player: string;
  /** Depth the spec assigns (yards). */
  expectedDepthYds: number;
  /** Depth the prose claimed (yards). */
  proseDepthYds: number;
  /** The sentence that triggered the issue. */
  bullet: string;
};

export type DepthLintResult =
  | { ok: true }
  | { ok: false; issues: DepthLintIssue[] };

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
 * Lint prose for DEPTH contradictions against the spec. Catches the
 * 2026-05-02 mesh case: skeleton placed H@2yd and S@6yd, the diagram
 * rendered correctly, but Cal's prose said "both drags can run at 2
 * yards" — Cal improvised a depth that the spec didn't have. Same
 * principle as the family lint: only fail on ACTIVE contradiction, not
 * omission.
 *
 * Detection: for each "@Player ... N yards" / "@Player ... at Nyd"
 * pattern in a sentence, parse N and compare against the spec's
 * depthYds for that player (using catalog midpoint when depthYds isn't
 * set on the action). Tolerance: 1.5yd (canonical depths cluster at
 * integers; route templates round to 0.5yd; reading "5-yard slant" off
 * a 5.8yd-rendered slant shouldn't fail). Larger gaps (a "2-yard drag"
 * vs a 6yd drag) blow well past the tolerance and surface as issues.
 */
export function lintProseDepthAgainstSpec(prose: string, spec: PlaySpec): DepthLintResult {
  if (!prose || !spec || !Array.isArray(spec.assignments)) return { ok: true };

  const playerToDepth = new Map<string, number>();
  for (const a of spec.assignments) {
    if (a.action.kind !== "route") continue;
    const template = findTemplate(a.action.family);
    if (!template) continue;
    const range = template.constraints.depthRangeYds;
    const depth = a.action.depthYds ?? Math.round((range.min + range.max) / 2);
    playerToDepth.set(a.player.toUpperCase(), depth);
  }
  if (playerToDepth.size === 0) return { ok: true };

  const TOLERANCE_YDS = 1.5;
  const sentences = prose.split(/(?<=[.!?])\s+|\n+/g);
  const issues: DepthLintIssue[] = [];
  const seen = new Set<string>();

  // Match "N yards", "N yd", "N-yard", "Nyds" etc. Captures the number.
  const depthRe = /\b(\d{1,2}(?:\.\d)?)\s*-?\s*(?:yd|yds|yard|yards)\b/gi;

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;
    // Sub-clause split. Sentences with multiple @-refs frequently
    // describe each player in their own comma-separated clause:
    //   "@H runs the under-drag at 2 yards, @S runs the over-drag at
    //    2 yards as well (both shallow crossers), with @X at 5 yards."
    // The previous "any-depth-in-sentence-passes" heuristic missed
    // @S's wrong depth here because "5 yards" (intended for @X) was
    // within tolerance of @S's expected 6yd. Splitting on commas
    // (and dashes / parens / semicolons) localizes each @-ref to the
    // depth in its own clause. Surfaced 2026-05-02 (Mesh prose said
    // "S runs the over-drag at 2 yards" while the spec had S@6yd).
    // Clause separators: commas, semicolons, parens, em/en-dashes,
    // and standalone " - " (with spaces). Do NOT include the bare
    // ASCII hyphen — it splits intra-word in "under-drag" / "over-drag"
    // and detaches @-refs from their depth phrase. Surfaced
    // 2026-05-02: prose split on "-" in "under-drag" left @H in a
    // clause with no depth, masking @S's wrong 2yd claim.
    const clauses = sentence.split(/[,;()—–]+|(?:\s-\s)/);
    for (const rawClause of clauses) {
      const clause = rawClause.trim();
      if (!clause) continue;
      const refs = [...clause.matchAll(/@([A-Za-z][A-Za-z0-9]{0,3})\b/g)];
      if (refs.length === 0) continue;
      const depthMatches = [...clause.matchAll(depthRe)]
        .map((m) => parseFloat(m[1]))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 30);
      if (depthMatches.length === 0) continue;

      for (const m of refs) {
        const player = m[1].toUpperCase();
        const expected = playerToDepth.get(player);
        if (expected === undefined) continue;

        // Within a clause, ANY-close still applies — coaches do
        // sometimes mention multiple depths for the same player
        // ("@X runs a 12-yard dig settling at 10 yards"). The fix
        // here is the clause boundary, not the comparison logic.
        const anyClose = depthMatches.some((d) => Math.abs(d - expected) <= TOLERANCE_YDS);
        if (anyClose) continue;
        const closest = depthMatches.reduce((best, d) =>
          Math.abs(d - expected) < Math.abs(best - expected) ? d : best,
        depthMatches[0]);

        const dedupeKey = `${player}|${closest}|${expected}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        issues.push({
          player,
          expectedDepthYds: expected,
          proseDepthYds: closest,
          bullet: clause,
        });
      }
    }
  }

  // Broad-claim pass: catches "both drags at 2 yards", "same 2-yard
  // depth", "all routes at 5 yards" — claims that assert a uniform
  // depth across multiple players when the spec has conflicting
  // depths. Image 3 (2026-05-02): Cal said "Same 2-yard depth works
  // fine" on a Mesh where the spec had H@2 and S@6. The per-sentence
  // lint above doesn't catch this because the broad claim has no
  // @-reference.
  const broadRe = /\b(both|all|same|every|each)\s+(?:\w+\s+){0,3}?(?:at\s+)?(\d{1,2}(?:\.\d)?)\s*-?\s*(?:yd|yds|yard|yards)\b/gi;
  const familyToDepths = new Map<string, Set<number>>();
  for (const a of spec.assignments) {
    if (a.action.kind !== "route") continue;
    const t = findTemplate(a.action.family);
    if (!t) continue;
    const range = t.constraints.depthRangeYds;
    const depth = a.action.depthYds ?? Math.round((range.min + range.max) / 2);
    const set = familyToDepths.get(t.name.toLowerCase()) ?? new Set<number>();
    set.add(depth);
    familyToDepths.set(t.name.toLowerCase(), set);
  }
  let bm: RegExpExecArray | null;
  const broadProse = prose;
  while ((bm = broadRe.exec(broadProse)) !== null) {
    const keyword = bm[1].toLowerCase();
    const claimedDepth = parseFloat(bm[2]);
    if (!Number.isFinite(claimedDepth)) continue;
    // Uniformity-asserting keywords ("same", "both", "all", "every",
    // "each") are contradicted whenever the family has ≥2 distinct
    // depths in the spec — regardless of whether the claimed number
    // happens to match one of them. The error is the SAMENESS claim,
    // not the specific number. Other keywords would need different
    // logic; this regex only matches uniformity keywords today.
    const isUniformityClaim = ["same", "both", "all", "every", "each"].includes(keyword);
    for (const [, depths] of familyToDepths) {
      if (depths.size < 2) continue;
      const minD = Math.min(...depths);
      const maxD = Math.max(...depths);
      if (!isUniformityClaim) {
        // Non-uniformity keyword paths only fail if the depth doesn't
        // match any family value (kept for future expansion).
        const matchesAny = [...depths].some((d) => Math.abs(d - claimedDepth) <= TOLERANCE_YDS);
        if (matchesAny) continue;
      }
      const sentence = (() => {
        const start = Math.max(0, bm!.index - 60);
        const end = Math.min(broadProse.length, bm!.index + bm![0].length + 60);
        return broadProse.slice(start, end).replace(/\s+/g, " ").trim();
      })();
      const dedupeKey = `BROAD|${claimedDepth}|${minD}-${maxD}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      issues.push({
        player: "(broad-claim)",
        expectedDepthYds: minD === maxD ? minD : (minD + maxD) / 2,
        proseDepthYds: claimedDepth,
        bullet: sentence,
      });
      break; // one issue per broad-claim match is enough
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

/**
 * Side-awareness lint: notes must be written from the perspective of the
 * side actually running the play. A defense play describes what defenders
 * do; an offense play describes what the offense does. Cal historically
 * defaults to offense-attack vocabulary ("@Q reads", "the throw", "exploits
 * Tampa 2") even when authoring a DEFENSE play, because the offense voice
 * is the unmarked default in the system prompt and the route catalog.
 *
 * This lint is the structural backstop. Triggers on the saved spec's
 * `playType`:
 *
 *   - DEFENSE play: reject prose that frames the play from the offense's
 *     point of view. Concretely: "@Q reads", "QB's primary read", "the
 *     throw", "throw to @<id>", "hit @<id>", "exploits", "attacks the
 *     defense", "beats <coverage>", and similar offense-attack verbs that
 *     read as "how to defeat this scheme" rather than "how defenders
 *     execute this scheme".
 *
 *   - OFFENSE play: reject prose that frames the play as a defensive
 *     call. The mirror is rarer in practice (Cal's default is offense)
 *     but caught for symmetry: "drop into <zone>", "spy the QB", "blitz
 *     <gap>" used as the *primary* opener (not as a per-defender bullet
 *     under a Defense: section).
 *
 * Conservative by design — only flags HARD offense-attack vocabulary,
 * not generic football words. "Routes", "coverage", "depth" stay legal
 * on both sides because coaches genuinely use them either way.
 */
export type SideAwarenessIssue = {
  /** "defense" or "offense" — the side the play is. */
  expectedSide: "offense" | "defense";
  /** The matched offense-/defense-perspective phrase. */
  match: string;
  /** The sentence the match appeared in. */
  sentence: string;
  /** Why this match indicates a side mismatch (for Cal's critique). */
  reason: string;
};

export type SideAwarenessResult =
  | { ok: true }
  | { ok: false; issues: SideAwarenessIssue[] };

/**
 * Patterns that frame a play from the OFFENSE's point of view. Used to
 * reject offense-perspective prose on a DEFENSE play. Each entry is a
 * regex + a one-line reason explaining the structural problem.
 *
 * Word boundaries are used aggressively to avoid false positives — e.g.
 * "throw" must be a verb in this position, not a substring of "throwback"
 * or "throwing". The patterns intentionally err toward catching the
 * coach-Cal-2026-05-03 case (the Spread Bender screenshot) and similar
 * failures, not at exhaustively classifying English.
 */
const OFFENSE_POV_PATTERNS: ReadonlyArray<{ re: RegExp; reason: string }> = [
  {
    re: /@Q\s+(?:reads?|throws?|hits?|looks?|works?|finds?)\b/i,
    reason: "frames the play as the QB executing reads, but this is a defense play — describe what defenders are reading, not what the QB is reading",
  },
  {
    re: /\bQB(?:'s)?\s+(?:primary\s+)?read\b/i,
    reason: "talks about the QB's read, but this is a defense play — describe the defenders' keys instead",
  },
  {
    re: /\bprimary\s+read\b/i,
    reason: "names a 'primary read' — that's an offense concept; on a defense play the analog is the defender's primary key",
  },
  {
    re: /\b(?:throw|hit|target|fire)\s+(?:to\s+)?@[A-Za-z]/i,
    reason: "uses an offensive throw verb directed at a player, but defense plays don't author throws",
  },
  {
    re: /\b(?:exploits?|attacks?|beats?)\s+(?:the\s+|this\s+)?(?:tampa|cover\s*\d|cover-\d|defense|coverage|zone|man|safety|safeties|hook|flat)/i,
    reason: "frames the play as attacking/exploiting the defense — that's the offensive POV; on a defense play, describe what defenders do, not how the offense beats them",
  },
  {
    re: /\bvoid\s+between\b|\bsoft\s+spot\b/i,
    reason: "describes the offense exploiting a coverage void — that's the offensive POV; on a defense play, describe how defenders close the void instead",
  },
  {
    re: /\bWhy\s+it\s+works:.*(?:exploits?|attacks?|void|safeties?|coverage)/i,
    reason: "the 'Why it works' framing here describes how the offense beats the defense; on a defense play, describe how the defense forces a bad result",
  },
];

/**
 * Patterns that frame a play from the DEFENSE's point of view as the
 * primary action. Used (conservatively) to reject defense-perspective
 * prose on an OFFENSE play. Per-defender bullets under a "Defense:"
 * header are legal — those describe what the offense's spec assigns to
 * the opponent, not the play itself. We only fail when defense-action
 * verbs lead the play description.
 */
const DEFENSE_POV_LEAD_PATTERNS: ReadonlyArray<{ re: RegExp; reason: string }> = [
  {
    re: /^(?:Run\s+\*\*[^*]+\*\*\s+—\s+defenders\s+read|Defenders\s+(?:drop|key|read|carry|wall)\b)/im,
    reason: "opens with defenders executing the play, but this is an offense play — open with the QB's read or the offensive concept",
  },
  {
    re: /\b(?:we\s+(?:drop|blitz|spy)|defenders\s+(?:drop\s+into|carry\s+vertical|wall\s+off))\b.*\bprimary\b/i,
    reason: "frames a defender as the primary actor, but this is an offense play — the primary actor is the QB or ballcarrier",
  },
];

/**
 * Lint notes against the saved spec's `playType`. Returns ok unless a
 * hard offense-attack pattern appears on a defense play (or vice versa).
 *
 * Implementation note: scans the WHOLE notes string, not per-sentence —
 * because the failure modes here (the 'Why it works' framing, the @Q
 * reads opener) span sentences and a per-sentence scan misses the
 * structural issue.
 */
export function lintNotesSideAwareness(
  notes: string,
  spec: PlaySpec,
): SideAwarenessResult {
  if (!notes || !spec) return { ok: true };
  const playType = spec.playType ?? "offense";

  if (playType === "defense") {
    const issues = matchPatterns(notes, OFFENSE_POV_PATTERNS, "defense");
    return issues.length === 0 ? { ok: true } : { ok: false, issues };
  }
  if (playType === "offense") {
    const issues = matchPatterns(notes, DEFENSE_POV_LEAD_PATTERNS, "offense");
    return issues.length === 0 ? { ok: true } : { ok: false, issues };
  }
  return { ok: true };
}

function matchPatterns(
  notes: string,
  patterns: ReadonlyArray<{ re: RegExp; reason: string }>,
  expectedSide: "offense" | "defense",
): SideAwarenessIssue[] {
  const issues: SideAwarenessIssue[] = [];
  const seenReasons = new Set<string>();
  for (const { re, reason } of patterns) {
    const m = notes.match(re);
    if (!m) continue;
    if (seenReasons.has(reason)) continue;
    seenReasons.add(reason);
    issues.push({
      expectedSide,
      match: m[0],
      sentence: extractContext(notes, m.index ?? 0, m[0].length),
      reason,
    });
  }
  return issues;
}

function extractContext(notes: string, idx: number, len: number): string {
  const start = Math.max(0, idx - 50);
  const end = Math.min(notes.length, idx + len + 50);
  return notes.slice(start, end).replace(/\s+/g, " ").trim();
}

export function formatSideAwarenessIssues(
  issues: ReadonlyArray<SideAwarenessIssue>,
): string {
  const expected = issues[0]?.expectedSide ?? "defense";
  const lead =
    expected === "defense"
      ? `Notes side-mismatch — this is a DEFENSE play, but the prose is written from the OFFENSE's perspective.`
      : `Notes side-mismatch — this is an OFFENSE play, but the prose is written from the DEFENSE's perspective.`;
  const orient =
    expected === "defense"
      ? `Re-author the notes from the DEFENDERS' perspective: open with when to call this defense, the primary key/trigger each defender reads, then per-defender assignments (zone drops, man matches, blitz lanes, pattern-match rules). Do NOT describe how the offense attacks this look — that's a different play.`
      : `Re-author the notes from the OFFENSE's perspective: open with the QB's read and the play's situation, then per-skill-player jobs. Per-defender bullets are fine UNDER a "Defense:" section but should not lead the play description.`;
  const lines = issues.map(
    (i) => `  • Matched "${i.match}" — ${i.reason}. Context: ${JSON.stringify(i.sentence)}`,
  );
  return `${lead}\n\n${orient}\n\nIssues:\n${lines.join("\n")}\n\nNotes were NOT saved.`;
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
