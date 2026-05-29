"use server";

import {
  attachDefenseFromFenceAction,
  createDefensePlayFromFenceAction,
} from "@/app/actions/plays";
import type { SaveDefenseProposal } from "@/lib/coach-ai/save-defense-tools";

/**
 * Commit a SaveDefenseProposal as a NEW defensive play — creates a separate
 * play row in the playbook linked to the source offensive play via vs_play_id
 * / vs_play_snapshot. Called from SaveDefenseProposalChip when the coach
 * clicks "Save as new defense play".
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

/**
 * Commit a SaveDefenseProposal by ATTACHING it to the existing offensive play
 * as its custom opponent overlay — no new play row; opening the offense play
 * shows the defenders. Called from SaveDefenseProposalChip when the coach
 * clicks "Add to this play".
 *
 * Returns { ok: true, playId } where playId is the OFFENSE play (that's where
 * the overlay renders), so the chip can link the coach back to it.
 */
export async function commitAttachDefenseToPlayAction(
  playbookId: string,
  proposal: SaveDefenseProposal,
): Promise<{ ok: true; playId: string } | { ok: false; error: string }> {
  return attachDefenseFromFenceAction({
    fenceJson: proposal.defenseFenceJson,
    offensivePlayId: proposal.offensivePlayId,
    playbookId,
  });
}
