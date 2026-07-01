/**
 * Presentational helpers for Cal's activity trace (the collapsible "what is
 * Cal doing" panel in the chat window). Pure, client-safe, no server imports.
 *
 * The live status line the server streams (`status` SSE event) is already
 * human-readable — it comes from `TOOL_STATUS` in `src/lib/coach-ai/agent.ts`.
 * But a *finished* turn only persists the raw tool names (`toolCalls: string[]`),
 * so to label the collapsed history we need a client-side name → label map.
 *
 * Keep the labels here roughly in sync with `TOOL_STATUS` in agent.ts. They
 * intentionally read as short gerund phrases WITHOUT the trailing ellipsis
 * ("Evaluating the matchup", not "Evaluating matchup…") because they render as
 * completed steps, not an in-flight status line. Any tool missing from the map
 * falls back to a prettified form of its snake_case name, so an unmapped tool
 * degrades to "Evaluate matchup" rather than breaking.
 */

const ACTIVITY_LABELS: Record<string, string> = {
  // Knowledge base
  search_kb: "Searching the knowledge base",
  list_kb_topics: "Browsing topics",
  get_kb_revisions: "Reading revision history",
  add_kb_entry: "Saving a knowledge entry",
  edit_kb_entry: "Updating a knowledge entry",
  retire_kb_entry: "Retiring a knowledge entry",
  // Playbooks + notes
  list_my_playbooks: "Loading your playbooks",
  create_playbook: "Creating a playbook",
  list_playbook_notes: "Reading playbook notes",
  propose_add_playbook_note: "Proposing a playbook note",
  propose_edit_playbook_note: "Proposing a note edit",
  propose_retire_playbook_note: "Proposing a note retire",
  // Play design + defense
  evaluate_matchup: "Evaluating the matchup",
  compose_play: "Composing the play",
  compose_defense: "Composing a defense",
  place_defense: "Aligning the defense",
  place_offense: "Aligning the offense",
  set_defender_assignment: "Assigning a defender",
  get_concept_skeleton: "Building a concept skeleton",
  modify_play_route: "Modifying a route",
  revise_play: "Revising the play",
  flip_play: "Flipping the play",
  propose_save_defense_play: "Proposing to save the defense",
  // Plays CRUD
  list_plays: "Reading your plays",
  get_play: "Fetching a play",
  explain_play: "Reading the play",
  create_play: "Creating the play",
  update_play: "Saving the play",
  rename_play: "Renaming the play",
  update_play_notes: "Saving play notes",
  update_player: "Updating a player",
  list_play_versions: "Reading play history",
  restore_play_version: "Reverting the play",
  // Play groups
  list_play_groups: "Listing groups",
  create_play_group: "Creating a group",
  rename_play_group: "Renaming a group",
  delete_play_group: "Deleting a group",
  assign_plays_to_group: "Moving plays to a group",
  // Calendar
  create_event: "Adding to the calendar",
  list_events: "Reading the calendar",
  update_event: "Rescheduling",
  cancel_event: "Cancelling an event",
  rsvp_event: "Updating an RSVP",
  // Practice
  create_practice_plan: "Saving a practice plan",
};

/** snake_case (or camelCase) tool name → "Sentence case" fallback label. */
function prettifyToolName(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  if (!words) return "Working";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Human-readable label for a single tool name. */
export function activityLabel(name: string): string {
  return ACTIVITY_LABELS[name] ?? prettifyToolName(name);
}

export type ActivityStep = { label: string; count: number };

/**
 * Turn an ordered list of raw tool names into display steps, collapsing
 * *consecutive* runs of the same label into one row with a count. Cal often
 * calls the same tool several times in a row (e.g. `evaluate_matchup` ×3);
 * "Evaluating the matchup ×3" reads far better than three identical rows.
 *
 * Non-consecutive repeats stay separate — "Composing a defense", then
 * "Creating the play", then "Composing a defense" again is a real sequence
 * worth preserving.
 */
export function collapseSteps(names: string[]): ActivityStep[] {
  const steps: ActivityStep[] = [];
  for (const name of names) {
    const label = activityLabel(name);
    const last = steps[steps.length - 1];
    if (last && last.label === label) {
      last.count += 1;
    } else {
      steps.push({ label, count: 1 });
    }
  }
  return steps;
}
