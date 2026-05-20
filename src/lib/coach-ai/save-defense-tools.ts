/**
 * Save-defense-play proposal tool — emits a structured proposal fence that
 * the client renders as a "Save as new defensive play" chip. The user
 * clicks the chip to commit; this tool itself does NOT write to the DB.
 *
 * Mirrors the propose_add_playbook_note pattern in playbook-tools.ts.
 *
 * Use after compose_defense with `on_play` has rendered an overlay the
 * coach likes. The proposal carries the defense fence + the offensive
 * play_ref + a suggested name ("{Defense} vs {OffensePlay}") so the
 * commit action can store the play as a defense-vs-offense link.
 */
import type { CoachAiTool, ToolContext } from "./tools";
import { resolvePlayId } from "./play-tools";

export type SaveDefenseProposal = {
  proposalId: string;
  /** The defense fence JSON, copied from compose_defense's output. */
  defenseFenceJson: string;
  /** The offense play_id this defense overlays. UUID — resolved at tool
   *  time so the chip doesn't have to re-resolve the slot. */
  offensivePlayId: string;
  /** Display name of the offense play (used in the chip label). */
  offensivePlayName: string;
  /** Suggested defensive play name (e.g. "Tampa 2 vs Noah"). The chip
   *  shows this; the commit action persists it as the play's name. */
  suggestedName: string;
  /** Optional short summary Cal can show as the chip subline. */
  changeSummary: string;
};

function newProposalId(): string {
  return globalThis.crypto.randomUUID();
}

function fenceProposal(p: SaveDefenseProposal): string {
  return `\`\`\`save-defense-proposal\n${JSON.stringify(p)}\n\`\`\``;
}

export const propose_save_defense_play: CoachAiTool = {
  def: {
    name: "propose_save_defense_play",
    description:
      "Propose saving the defense overlay you just emitted as a new defensive play in the coach's playbook. " +
      "Emits a structured 'Save as new defensive play' chip — the coach clicks it to commit; this tool does NOT write. " +
      "Use right after compose_defense with `on_play` when the overlay is something the coach should keep " +
      "(default name: '{Defense} vs {OffensePlay}', e.g. 'Tampa 2 vs Noah'). Skip this tool when the overlay " +
      "is just a tactical discussion the coach doesn't need to persist.",
    input_schema: {
      type: "object",
      properties: {
        defense_fence: {
          type: "string",
          description:
            "The defense fence JSON, copied VERBATIM from the most recent ```play fence (compose_defense output). " +
            "MUST be the overlay (offense + defense), not a defense-only fence.",
        },
        offensive_play_ref: {
          type: "string",
          description:
            "Reference to the offensive play this defense overlays. Accept the same formats as get_play: " +
            "UUID, group-qualified slot ('Recommended #5'), or exact play name. Required so the saved " +
            "defense play stores vs_play_id correctly.",
        },
        suggested_name: {
          type: "string",
          description:
            "Suggested name for the new defensive play. Convention: '{Defense} vs {OffensePlay}' " +
            "(e.g. 'Tampa 2 vs Noah'). The chip displays this; the coach can rename after save.",
        },
        change_summary: {
          type: "string",
          description: "One-line summary describing the overlay (shown as the chip subline).",
        },
      },
      required: ["defense_fence", "offensive_play_ref", "suggested_name", "change_summary"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };

    const defenseFenceJson = typeof input.defense_fence === "string" ? input.defense_fence.trim() : "";
    const offensiveRef = typeof input.offensive_play_ref === "string" ? input.offensive_play_ref.trim() : "";
    const suggestedName = typeof input.suggested_name === "string" ? input.suggested_name.trim() : "";
    const changeSummary = typeof input.change_summary === "string" ? input.change_summary.trim() : "";

    if (!defenseFenceJson) return { ok: false, error: "defense_fence is required (copy the compose_defense fence verbatim)." };
    if (!offensiveRef) return { ok: false, error: "offensive_play_ref is required." };
    if (!suggestedName) return { ok: false, error: "suggested_name is required." };
    if (!changeSummary) return { ok: false, error: "change_summary is required." };

    // Validate the fence parses and looks like an overlay (offense + defense).
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(defenseFenceJson);
    } catch (e) {
      return { ok: false, error: `defense_fence is not valid JSON: ${(e as Error).message}` };
    }
    const players = Array.isArray(parsed.players) ? (parsed.players as Array<Record<string, unknown>>) : [];
    const hasOffense = players.some((p) => p.team !== "D");
    const hasDefense = players.some((p) => p.team === "D");
    if (!hasOffense || !hasDefense) {
      return {
        ok: false,
        error: "defense_fence must be the OVERLAY (offense + defense), not defense-only. Re-run compose_defense with `on_play` set.",
      };
    }

    // Resolve the offensive play ref to a UUID so the chip can commit
    // without re-resolving (anchor-aware via ctx.playId per Fix 1).
    const resolved = await resolvePlayId(offensiveRef, ctx.playbookId, { anchoredPlayId: ctx.playId });
    if (!resolved.ok) return { ok: false, error: `Could not resolve offensive_play_ref "${offensiveRef}": ${resolved.error}` };

    const proposal: SaveDefenseProposal = {
      proposalId: newProposalId(),
      defenseFenceJson,
      offensivePlayId: resolved.id,
      offensivePlayName: resolved.name,
      suggestedName,
      changeSummary,
    };

    return {
      ok: true,
      result:
        `Proposed save: "${suggestedName}" vs ${resolved.name}. Awaiting coach confirmation via the inline chip.\n\n${fenceProposal(proposal)}`,
    };
  },
};
