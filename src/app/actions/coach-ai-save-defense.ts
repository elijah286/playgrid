"use server";

import { createDefensePlayFromFenceAction } from "@/app/actions/plays";
import type { SaveDefenseProposal } from "@/lib/coach-ai/save-defense-tools";

/**
 * Commit a SaveDefenseProposal — creates a new defensive play in the
 * playbook linked to the source offensive play via vs_play_id /
 * vs_play_snapshot. Called from SaveDefensePlayChip when the coach
 * clicks "Save as new defensive play".
 *
 * Returns { ok: true, playId } so the chip can link the coach directly
 * to the new play.
 */
export async function commitSaveDefenseProposalAction(
  playbookId: string,
  proposal: SaveDefenseProposal,
): Promise<{ ok: true; playId: string } | { ok: false; error: string }> {
  return createDefensePlayFromFenceAction({
    fenceJson: proposal.defenseFenceJson,
    offensivePlayId: proposal.offensivePlayId,
    suggestedName: proposal.suggestedName,
    playbookId,
  });
}
