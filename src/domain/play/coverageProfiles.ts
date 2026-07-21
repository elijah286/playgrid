/**
 * Coverage matchup profiles — Layer 1 catalog (per AGENTS.md).
 *
 * Answers the coach question "is my play any good against this defense, and if
 * not, what should I run instead?" in a GROUNDED way. Per Rule 5 (make it
 * structural, don't freelance), the matchup verdict is derived from catalog
 * data, not from the LLM's memory:
 *
 *   - Each common coverage has a profile: its shell, where it is structurally
 *     SOFT (coachable holes), where it is STRONG (don't attack here), and the
 *     concept families that are designed to BEAT it.
 *   - `evaluateMatchup()` is a pure function: given a coverage + the offensive
 *     concept (and, optionally, the hand-authored reactor read for that exact
 *     coverage×concept pair from defensiveReactors.ts), it returns a verdict +
 *     grounded reasons + concrete alternatives.
 *
 * The coverage knowledge here is standard, stable football (Cover 2's deep
 * "honey hole", Cover 3's soft flats, man coverage's vulnerability to rubs).
 * The `beaters` lists intentionally use names from KNOWN_CONCEPTS in
 * defensiveReactors.ts / CONCEPT_CATALOG so the alternatives Cal suggests are
 * real, composable concepts — not invented ones.
 *
 * This catalog is the SINGLE source of truth for matchup verdicts. The Cal tool
 * `evaluate_matchup` is a thin projection of it; do not re-derive matchup logic
 * inside the tool handler (Rule 5).
 */

export type CoverageShell = "man" | "zone" | "hybrid";

export type CoverageProfile = {
  /** Canonical coverage name — matches the alignment catalog ("Cover 3",
   *  "Tampa 2") so it lines up with what compose_defense produced. */
  coverage: string;
  /** Lowercased forms that normalize to this profile ("cover3", "c3", "3"). */
  aliases: string[];
  shell: CoverageShell;
  /** One-line identity of the coverage. */
  summary: string;
  /** Structural soft spots — short, coachable phrases (where to attack). */
  softSpots: string[];
  /** Structural strengths — where NOT to attack. */
  strongSpots: string[];
  /** Concept names (from KNOWN_CONCEPTS / CONCEPT_CATALOG) that stress this
   *  coverage. Used both to grade the current play and to suggest alternatives. */
  beaters: string[];
};

export const COVERAGE_PROFILES: readonly CoverageProfile[] = [
  {
    coverage: "Cover 0",
    aliases: ["cover 0", "cover0", "c0", "0", "man free-less", "all-out", "zero"],
    shell: "man",
    summary: "Pure man, no deep safety — everyone covered, nobody helping over the top (usually paired with pressure).",
    softSpots: [
      "Deep balls — there is no safety help, so a step on a man is a touchdown",
      "Rub / pick / mesh releases that make defenders run into each other",
      "The hot throw vs the blitz — quick game beats the rush",
    ],
    strongSpots: [
      "Anything that develops slowly — pressure gets home first",
      "Stationary underneath routes with a defender draped on the receiver",
    ],
    beaters: ["Four Verticals", "Mesh", "Slant-Flat", "Smash"],
  },
  {
    coverage: "Cover 1",
    aliases: ["cover 1", "cover1", "c1", "1", "man free", "man-free"],
    shell: "man",
    summary: "Man across the board with one free safety in the deep middle.",
    softSpots: [
      "Crossers and mesh — natural rubs spring a man defender",
      "Isolating your best receiver one-on-one away from the free safety",
      "Deep over / dig routes that work away from the single-high help",
    ],
    strongSpots: [
      "Outside vertical shots — the free safety caps them over the top",
      "Quick out-breaking routes into tight man leverage",
    ],
    beaters: ["Mesh", "Drive", "Smash", "Y-Cross", "Four Verticals", "Levels"],
  },
  {
    coverage: "Cover 2",
    aliases: ["cover 2", "cover2", "c2", "2", "2 deep"],
    shell: "zone",
    summary: "Two deep safeties split the field; five underneath defenders, corners squat on the flats.",
    softSpots: [
      "The deep sideline 'honey hole' behind the corner and in front of the safety (corner route)",
      "The deep middle between the two safeties (seam / post — split the safeties)",
      "High-low the corner: put a route over him and one under him",
    ],
    strongSpots: [
      "The flats — the corner squats and jumps anything quick outside",
      "The short middle is crowded with underneath defenders",
    ],
    beaters: ["Smash", "Four Verticals", "Flood"],
  },
  {
    coverage: "Tampa 2",
    aliases: ["tampa 2", "tampa2", "tampa", "tampa-2"],
    shell: "zone",
    summary: "Cover 2 with the middle linebacker sprinting to carry the deep middle, plugging the classic Cover 2 hole.",
    softSpots: [
      "The two deep 'honey holes' outside the hashes — behind the corner, in front of the safety (corner route)",
      "The flats early, before the corner sinks",
      "High-low the corner with a corner-flat combo",
    ],
    strongSpots: [
      "The deep middle — the Mike runs it, so a straight seam is contested (unlike base Cover 2)",
      "The short middle hole is robbed by a dropping linebacker",
    ],
    beaters: ["Smash", "Flood"],
  },
  {
    coverage: "Cover 3",
    aliases: ["cover 3", "cover3", "c3", "3", "3 deep", "sky", "buzz"],
    shell: "zone",
    summary: "Three deep defenders split the field into thirds; four underneath defenders cannot cover five short zones.",
    softSpots: [
      "The flats — four underneath defenders can't cover all five underneath zones (curl-flat / slant-flat)",
      "The 'holes' along the seams, between the deep thirds and the hook defenders",
      "High-low the flat defender (smash / curl-flat)",
    ],
    strongSpots: [
      "Deep outside — the three-deep shell caps outside verticals",
      "The post over the middle is capped by the single-high safety",
    ],
    beaters: ["Curl-Flat", "Slant-Flat", "Smash", "Flood", "Four Verticals", "Snag", "Dagger", "Stick"],
  },
  {
    coverage: "Cover 4",
    aliases: ["cover 4", "cover4", "c4", "4", "quarters", "quarter"],
    shell: "zone",
    summary: "Four deep defenders play quarters of the deep field; only three underneath — built to take away the deep ball.",
    softSpots: [
      "Underneath and the flats — only three short defenders (stick / snag / quick game)",
      "Intermediate crossers in front of the bailing quarters defenders",
      "Hitch / smash-hitch quick game on the squatting corners' soft cushion",
    ],
    strongSpots: [
      "Deep shots — four deep defenders make it very hard to win over the top",
      "Straight verticals get bracketed",
    ],
    beaters: ["Stick", "Snag", "Slant-Flat", "Curl-Flat", "Mesh"],
  },
];

export type MatchupVerdict = "favors_offense" | "contested" | "favors_defense" | "unknown";

export type MatchupEvaluation = {
  verdict: MatchupVerdict;
  /** Resolved canonical coverage name, or the raw input when unrecognized. */
  coverage: string;
  conceptName: string | null;
  /** One-line plain-English verdict Cal can lead with. */
  headline: string;
  /** Grounded "why" bullets. */
  reasons: string[];
  /** Where this coverage is soft (attack here). */
  softSpots: string[];
  /** Where this coverage is strong (avoid). */
  strongSpots: string[];
  /** Concepts that beat this coverage, excluding the one already called. */
  alternatives: string[];
  /** Hand-authored reactor read for this exact coverage×concept, if one exists. */
  reactorRead: string | null;
  reactorCues: string[];
  /** True when we recognized the coverage (had a profile to reason from). */
  grounded: boolean;
};

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Resolve a free-text coverage string to a profile via name or alias. */
export function findCoverageProfile(coverageInput: string): CoverageProfile | null {
  const n = normalize(coverageInput);
  if (!n) return null;
  for (const p of COVERAGE_PROFILES) {
    if (normalize(p.coverage) === n) return p;
    if (p.aliases.some((a) => normalize(a) === n)) return p;
  }
  // Loose contains match ("base cover 3 sky" -> Cover 3) as a last resort.
  for (const p of COVERAGE_PROFILES) {
    if (n.includes(normalize(p.coverage))) return p;
  }
  return null;
}

function isBeater(profile: CoverageProfile, conceptName: string | null): boolean {
  if (!conceptName) return false;
  const c = normalize(conceptName);
  return profile.beaters.some((b) => normalize(b) === c);
}

/**
 * Grade an offensive concept against a coverage, grounded in the coverage
 * profile (+ optional hand-authored reactor read for the exact pair).
 *
 * Pure: depends only on the catalog + its inputs. The Cal tool supplies
 * `reactorRead` / `reactorCues` from defensiveReactors.findReactorPattern so
 * this module stays free of cross-domain imports and is trivially testable.
 */
export function evaluateMatchup(opts: {
  coverageInput: string;
  conceptName: string | null;
  reactorRead?: string | null;
  reactorCues?: string[];
}): MatchupEvaluation {
  const profile = findCoverageProfile(opts.coverageInput);
  const conceptName = opts.conceptName?.trim() || null;
  const reactorRead = opts.reactorRead?.trim() || null;
  const reactorCues = opts.reactorCues ?? [];

  if (!profile) {
    return {
      verdict: "unknown",
      coverage: opts.coverageInput.trim(),
      conceptName,
      headline: `I don't have a structural profile for "${opts.coverageInput.trim()}", so I can't grade this matchup with confidence.`,
      reasons: [],
      softSpots: [],
      strongSpots: [],
      alternatives: [],
      reactorRead,
      reactorCues,
      grounded: false,
    };
  }

  const beats = isBeater(profile, conceptName);
  const alternatives = profile.beaters.filter(
    (b) => !conceptName || normalize(b) !== normalize(conceptName),
  );

  let verdict: MatchupVerdict;
  let headline: string;
  const reasons: string[] = [];

  if (beats) {
    verdict = "favors_offense";
    headline = `${conceptName} is a strong call against ${profile.coverage} — it's designed to attack where this coverage is soft.`;
    reasons.push(`${conceptName} is a known ${profile.coverage} beater: ${profile.softSpots[0]}.`);
  } else if (conceptName) {
    verdict = "contested";
    if (reactorRead) {
      headline = `${profile.coverage} has a built-in answer to ${conceptName} — it's a contested matchup, so the read matters.`;
      reasons.push(`${profile.coverage} is structured to take ${conceptName} away; win it by hitting the soft spots below before the coverage rotates.`);
    } else {
      headline = `${conceptName} isn't a natural ${profile.coverage} beater — it's contested. Attack the soft spots below or consider an alternative.`;
      reasons.push(`${conceptName} doesn't target where ${profile.coverage} is soft, so reads have to be on time.`);
    }
  } else {
    verdict = "unknown";
    headline = `I couldn't identify the offensive concept, but here's where ${profile.coverage} is soft and what stresses it.`;
  }

  if (profile.strongSpots.length > 0) {
    reasons.push(`Avoid ${profile.coverage}'s strength: ${profile.strongSpots[0]}.`);
  }

  return {
    verdict,
    coverage: profile.coverage,
    conceptName,
    headline,
    reasons,
    softSpots: profile.softSpots,
    strongSpots: profile.strongSpots,
    alternatives,
    reactorRead,
    reactorCues,
    grounded: true,
  };
}

// ── Module-load assertions (Layer 1 discipline) ────────────────────────────
// Catch authoring mistakes at import time, not at runtime in front of a coach.
(() => {
  const seen = new Set<string>();
  for (const p of COVERAGE_PROFILES) {
    const key = normalize(p.coverage);
    if (seen.has(key)) {
      throw new Error(`coverageProfiles: duplicate coverage "${p.coverage}"`);
    }
    seen.add(key);
    if (p.softSpots.length === 0) {
      throw new Error(`coverageProfiles: "${p.coverage}" has no softSpots`);
    }
    if (p.beaters.length === 0) {
      throw new Error(`coverageProfiles: "${p.coverage}" has no beaters`);
    }
  }
})();
