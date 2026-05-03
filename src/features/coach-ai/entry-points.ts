/**
 * Registry of in-app Coach Cal CTAs. Each entry is a single source of truth
 * for both the auto-submitted prompt (entitled users) and the tailored
 * upsell preview (non-entitled users).
 *
 * Adding a new CTA: add an entry here, then drop a <CoachCalCTA
 * entryPoint="…"/> wherever the trigger lives in the UI.
 */

export type CoachCalEntryPointId =
  | "play_notes_regenerate"
  | "playbook_generate_play"
  | "play_suggest_counter"
  | "playbook_generate_starter";

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
  playbook_generate_play: {
    id: "playbook_generate_play",
    promptTemplate:
      "Help me generate a new play for this playbook. Ask me questions about my team's skills and experience so we identify what strategy and play type would be best.",
    preview: {
      leadIn:
        "Coach Cal can interview you about your team's skills and experience and then design a play that fits — formation, routes, QB reads, and coaching notes — and add it to this playbook in one step.",
      capabilities: [
        "Generate plays tailored to your team's age, skill, and league rules",
        "Build out an entire starter playbook based on a few questions",
        "Suggest counters when a defense is giving your offense trouble",
        "Author per-play notes with QB reads, hot routes, and coaching points",
      ],
      ctaLabel: "Start 7-day free trial",
    },
    ctaLabel: "Generate plays with Coach Cal",
  },
  play_suggest_counter: {
    id: "play_suggest_counter",
    promptTemplate:
      "Suggest a counter to the play \"${playName}\". Describe how the opposing scheme would line up and react, with each player's job. Then ask me if I want to see it on the field — if I say yes, apply it (overlay the defense onto this play if it's an offense, or add a counter offense to my playbook if it's a defense).",
    preview: {
      leadIn:
        "Coach Cal can read any play in your playbook, design a counter that fits your team's level, and apply it to the field — defense overlay for an offense play, new counter offense for a defense play.",
      capabilities: [
        "Suggest counters when a defense or offense is giving you trouble",
        "Generate plays tailored to your team's age, skill, and league rules",
        "Author per-play notes with QB reads, hot routes, and coaching points",
        "Build practice plans that install your playbook week by week",
      ],
      ctaLabel: "Start 7-day free trial",
    },
    ctaLabel: "Suggest a counter with Coach Cal",
  },
  playbook_generate_starter: {
    id: "playbook_generate_starter",
    promptTemplate:
      "Help me build a starter playbook for this team. Ask me about my team's age, skill level, and league/variant so the plays you generate are age and skill appropriate. Then propose a small set of plays to build out — I'll confirm before you add them to the playbook.",
    preview: {
      leadIn:
        "Coach Cal can interview you about your team's age, skill, and league rules — then build out a full starter playbook one play at a time, narrating each call so you can adjust as you go.",
      capabilities: [
        "Generate a starter playbook from a few questions about your team",
        "Build practice plans that install your playbook week by week",
        "Suggest counters when a defense or offense is giving you trouble",
        "Author per-play notes with QB reads, hot routes, and coaching points",
      ],
      ctaLabel: "Start 7-day free trial",
    },
    ctaLabel: "Generate a starter playbook with Coach Cal",
  },
};

export function renderPromptTemplate(
  template: string,
  values: Record<string, string> = {},
): string {
  return template.replace(/\$\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}
