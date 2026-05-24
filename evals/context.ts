/**
 * Mock ToolContext for hermetic eval runs.
 *
 * The agent's real ToolContext expects Supabase access for tools like
 * search_kb, list_my_playbooks, create_play. Evals don't need a live
 * DB — they assert on Cal's BEHAVIOR (which tool, what fence shape),
 * not on persistence side effects. We give the agent a context that
 * satisfies the type but has no DB anchor.
 *
 * Tools that touch the DB will fail at handler time when the agent
 * calls them. That's deliberate: most eval scenarios should test the
 * compose / revise / compose_defense flow, which is pure (no DB
 * needed). If a scenario absolutely requires a save tool, it should
 * mock that tool's response explicitly OR use a fixture DB.
 *
 * Pulled into `evals/context.ts` rather than inlined in the runner
 * so multiple scenarios can share + extend it.
 */

import type { ToolContext } from "@/lib/coach-ai/tools";
import type { ScenarioContext } from "./types";

/** Build a ToolContext from the scenario's narrower ScenarioContext.
 *  Fills in safe defaults (no admin, no edit access) — scenarios that
 *  need elevated context should construct ToolContext directly. */
export function buildEvalContext(sc: ScenarioContext): ToolContext {
  return {
    playbookId: sc.playbookId ?? null,
    playbookName: sc.playbookName ?? (sc.playbookId ? "Eval Playbook" : null),
    sportVariant: sc.sportVariant,
    gameLevel: sc.gameLevel ?? null,
    sanctioningBody: sc.sanctioningBody ?? null,
    ageDivision: sc.ageDivision ?? null,
    playbookSettings: null,
    isAdmin: false,
    canEditPlaybook: sc.playbookId !== undefined,
    mode: "normal",
    timezone: "America/Chicago",
    playId: sc.playId ?? null,
    playName: sc.playId ? "Eval Play" : null,
    playFormation: null,
    playDiagramText: sc.anchoredPlayDiagramText ?? null,
    playDiagramRecap: null,
    threadId: null,
    userId: null,
  };
}
