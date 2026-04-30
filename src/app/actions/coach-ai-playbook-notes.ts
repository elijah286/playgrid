"use server";

import { createClient } from "@/lib/supabase/server";
import {
  applyPlaybookNoteProposal,
  type NoteProposal,
} from "@/lib/coach-ai/playbook-tools";

/**
 * Commit a Coach Cal playbook-note proposal to the playbook KB.
 *
 * Triggered when a coach clicks "Save to playbook notes" on an inline
 * proposal chip. The proposal payload was emitted by Cal earlier in the
 * turn (via propose_add_playbook_note / propose_edit_playbook_note /
 * propose_retire_playbook_note) and persisted in the chat's localStorage
 * alongside the assistant turn.
 *
 * Permission is enforced both here (via can_edit_playbook RPC) and at
 * the DB layer (rag_documents RLS).
 */
export async function commitPlaybookNoteProposalAction(
  playbookId: string,
  proposal: NoteProposal,
): Promise<
  | { ok: true; documentId: string; revisionNumber: number }
  | { ok: false; error: string }
> {
  if (!playbookId) return { ok: false, error: "Missing playbook id." };
  if (!proposal || !proposal.kind) return { ok: false, error: "Invalid proposal." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("playbooks")
    .select("sport_variant, game_level, sanctioning_body, age_division")
    .eq("id", playbookId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Playbook not found." };

  return applyPlaybookNoteProposal({
    proposal,
    playbookId,
    sportVariant: (data.sport_variant as string | null) ?? null,
    gameLevel: (data.game_level as string | null) ?? null,
    sanctioningBody: (data.sanctioning_body as string | null) ?? null,
    ageDivision: (data.age_division as string | null) ?? null,
  });
}
