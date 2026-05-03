/**
 * Registry of in-app Coach Cal CTAs. Each entry is a single source of truth
 * for both the auto-submitted prompt (entitled users) and the tailored
 * upsell preview (non-entitled users).
 *
 * Adding a new CTA: add an entry here, then drop a <CoachCalCTA
 * entryPoint="…"/> wherever the trigger lives in the UI.
 */

export type CoachCalEntryPointId = "play_notes_regenerate";

export type EntryPointContext = {
  /** Replacement values for ${name} tokens in the prompt template. */
  values?: Record<string, string>;
};

export type EntryPointConfig = {
  id: CoachCalEntryPointId;
  /** Auto-submitted to Cal. ${name} tokens are filled from EntryPointContext. */
  promptTemplate: string;
  /** Shown to non-entitled users in place of a real Cal response. */
  preview: {
    leadIn: string;
    capabilities: string[];
    ctaLabel: string;
  };
  /** Default label for the CTA button. */
  ctaLabel: string;
};

export const ENTRY_POINTS: Record<CoachCalEntryPointId, EntryPointConfig> = {
  play_notes_regenerate: {
    id: "play_notes_regenerate",
    promptTemplate:
      "Generate new notes for the play \"${playName}\". Notes should explain when this play should be used and any decisions or looks the quarterback needs to be aware of. Ask me questions if you need to.",
    preview: {
      leadIn:
        "Coach Cal can write notes that adapt to your team's age tier, the situation, and the defensive looks you'll see — so you don't have to type them play by play.",
      capabilities: [
        "Author per-play notes with QB reads, hot routes, and coaching points",
        "Suggest counters when a defense is giving your offense trouble",
        "Build practice plans that install your playbook week by week",
        "Generate starter playbooks scoped to your league and your team",
      ],
      ctaLabel: "Start 7-day free trial",
    },
    ctaLabel: "Generate notes with Coach Cal",
  },
};

export function renderPromptTemplate(
  template: string,
  values: Record<string, string> = {},
): string {
  return template.replace(/\$\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}
