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
