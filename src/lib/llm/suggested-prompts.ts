import type { BetaFeatureKey } from "@/lib/site/beta-features-config";

// Audience the prompt is meant for. Coaches see playbook-management prompts;
// players see study/quiz prompts. "any" shows up to either.
export type PromptAudience = "coach" | "player" | "any";

// Where the prompt makes sense to surface. Lets the UI filter by current view.
export type PromptContext =
  | "playbook"
  | "play"
  | "roster"
  | "calendar"
  | "global";

export type SuggestedPrompt = {
  id: string;
  text: string;
  audience: PromptAudience;
  context: PromptContext[];
  // If set, the prompt only shows when this beta feature is enabled for the
  // current viewer. Keeps version-history prompts hidden until the flag flips
  // on for that user.
  requiresFlag?: BetaFeatureKey;
};

export const SUGGESTED_PROMPTS: readonly SuggestedPrompt[] = [
  // ── Generate a new playbook ────────────────────────────────────────────────
  {
    id: "generate.starter-playbook",
    text: "Build me a starter playbook for 8u flag football",
    audience: "coach",
    context: ["global"],
  },
  {
    id: "generate.passing-playbook",
    text: "Generate a 7v7 playbook with a Trips-heavy passing scheme",
    audience: "coach",
    context: ["global"],
  },

  // ── Strategy vs a specific defense ─────────────────────────────────────────
  {
    id: "strategy.beat-defense",
    text: "What plays in my playbook beat Cover 2?",
    audience: "coach",
    context: ["playbook", "global"],
  },
  {
    id: "strategy.add-counter",
    text: "Add a play to beat a 5-2 front from Trips Right",
    audience: "coach",
    context: ["playbook"],
  },

  // ── Defensive approach vs a specific offense ───────────────────────────────
  {
    id: "defense.vs-spread",
    text: "Best defense against a spread offense with a mobile QB",
    audience: "coach",
    context: ["playbook", "global"],
  },
  {
    id: "defense.vs-run-heavy",
    text: "What coverage should we run against a heavy-run team?",
    audience: "coach",
    context: ["playbook", "global"],
  },

  // ── Post-game review and adjustments ───────────────────────────────────────
  {
    id: "review.post-game",
    text: "Review last week's game and suggest playbook adjustments",
    audience: "coach",
    context: ["global", "calendar"],
  },
  {
    id: "review.post-game-detailed",
    text: "We lost on deep balls vs Cover 2 — what should we change?",
    audience: "coach",
    context: ["global", "playbook"],
  },

  // ── Season scheduling in one prompt ────────────────────────────────────────
  {
    id: "schedule.season",
    text: "Schedule 2 practices a week and Saturday games for our fall season",
    audience: "coach",
    context: ["calendar", "global"],
  },
  {
    id: "schedule.bulk-games",
    text: "Add our 8-game schedule starting Sept 6",
    audience: "coach",
    context: ["calendar"],
  },

  // ── Playbook review for skill / experience ─────────────────────────────────
  {
    id: "review.skill-level",
    text: "Is this playbook the right difficulty for our team?",
    audience: "coach",
    context: ["playbook"],
  },

  // ── Situational play picks ─────────────────────────────────────────────────
  {
    id: "situational.red-zone",
    text: "Which plays should I call in the red zone?",
    audience: "coach",
    context: ["playbook", "global"],
  },
  {
    id: "situational.third-short",
    text: "Best 3rd-and-short calls from this playbook",
    audience: "coach",
    context: ["playbook"],
  },
  {
    id: "situational.opening-script",
    text: "Build me an opening-drive script",
    audience: "coach",
    context: ["playbook", "global"],
  },

  // ── Update play notes / QB reads ───────────────────────────────────────────
  {
    id: "play.add-qb-reads",
    text: "Add the QB reads and progression to this play",
    audience: "coach",
    context: ["play"],
  },
  {
    id: "play.update-notes",
    text: "Update the coaching notes with the hot read and adjustments",
    audience: "coach",
    context: ["play"],
  },

  // ── Existing utility prompts (kept) ────────────────────────────────────────
  {
    id: "playbook.install-order",
    text: "Suggest an install order for this playbook",
    audience: "coach",
    context: ["playbook"],
  },
  {
    id: "playbook.gap-analysis",
    text: "What situations is this playbook missing plays for?",
    audience: "coach",
    context: ["playbook"],
  },
  {
    id: "play.explain",
    text: "Explain this play in plain English",
    audience: "any",
    context: ["play"],
  },
  {
    id: "play.coaching-points",
    text: "Give me coaching points for this play by position",
    audience: "coach",
    context: ["play"],
  },
  {
    id: "play.quiz",
    text: "Quiz me on my assignment in this play",
    audience: "player",
    context: ["play"],
  },

  // ── Version-history prompts (kept, still gated) ────────────────────────────
  {
    id: "version.weekly-changes",
    text: "What changed in the playbook this week?",
    audience: "coach",
    context: ["playbook", "global"],
    requiresFlag: "version_history",
  },
  {
    id: "version.editor-summary",
    text: "Summarize edits made by a specific coach in the last 7 days",
    audience: "coach",
    context: ["playbook", "global"],
    requiresFlag: "version_history",
  },
  {
    id: "version.since-last-game",
    text: "Show me plays modified since our last game",
    audience: "coach",
    context: ["playbook", "calendar"],
    requiresFlag: "version_history",
  },
  {
    id: "version.diff-prior",
    text: "What was different about this play two versions ago?",
    audience: "coach",
    context: ["play"],
    requiresFlag: "version_history",
  },
  {
    id: "version.restore-by-date",
    text: "Restore this play to the version from a specific date",
    audience: "coach",
    context: ["play"],
    requiresFlag: "version_history",
  },
];

export function filterPrompts(opts: {
  audience: PromptAudience;
  context: PromptContext;
  enabledFlags: ReadonlySet<BetaFeatureKey>;
}): SuggestedPrompt[] {
  const { audience, context, enabledFlags } = opts;
  return SUGGESTED_PROMPTS.filter((p) => {
    if (p.audience !== "any" && p.audience !== audience) return false;
    if (!p.context.includes(context)) return false;
    if (p.requiresFlag && !enabledFlags.has(p.requiresFlag)) return false;
    return true;
  });
}

/**
 * Pick a small, contextually-weighted random sample of starter prompts for the
 * Coach Cal empty state. Prompts whose `context` list explicitly mentions the
 * current view are weighted 2× higher than `global`-only prompts, so a coach
 * inside a play sees mostly play-specific suggestions but still occasionally
 * gets a marquee capability (e.g. season scheduling) surfaced.
 *
 * Sampling is without replacement; if fewer prompts are eligible than `count`,
 * all eligible prompts are returned.
 */
export function pickStarterPrompts(opts: {
  audience: PromptAudience;
  context: PromptContext;
  enabledFlags: ReadonlySet<BetaFeatureKey>;
  count?: number;
  random?: () => number;
}): SuggestedPrompt[] {
  const { audience, context, enabledFlags, count = 5, random = Math.random } = opts;

  const eligible = SUGGESTED_PROMPTS.filter((p) => {
    if (p.audience !== "any" && p.audience !== audience) return false;
    if (!p.context.includes(context) && !p.context.includes("global")) return false;
    if (p.requiresFlag && !enabledFlags.has(p.requiresFlag)) return false;
    return true;
  });

  const pool = eligible.map((p) => ({
    prompt: p,
    weight:
      context !== "global" && p.context.includes(context) ? 2 : 1,
  }));

  const result: SuggestedPrompt[] = [];
  while (result.length < count && pool.length > 0) {
    const total = pool.reduce((s, w) => s + w.weight, 0);
    let r = random() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r <= 0) { idx = i; break; }
    }
    result.push(pool[idx].prompt);
    pool.splice(idx, 1);
  }
  return result;
}
