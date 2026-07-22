/**
 * The shared per-panel import pipeline: vision extraction → variant fit
 * gate → PlaySpec synthesis. Called by the extract route (fresh photo)
 * and the job-retry route (stored crop), so both produce identical
 * results and logging.
 */

import type { SportVariant } from "@/domain/play/types";
import { loadPlaybookSettings } from "@/lib/coach-ai/play-tools";
import { recordCoachCalImageUsed } from "@/lib/billing/coach-cal-image-cap";
import { extractPanel } from "./llm-calls";
import { synthesizePlaySpec, variantFit, variantForOffenseCount } from "./synthesize";
import type { PlayExtraction } from "./schema";
import type { ImportWarning, PlayerMapping } from "./synthesize";
import type { PlaySpec } from "@/domain/play/spec";

export type VariantMismatch = {
  observedSkill: number;
  expectedSkill: number;
  photoPlayers: number;
  expectedPlayers: number;
  delta: number;
  /** The playbook the coach imported into (the one that didn't fit). */
  variant: SportVariant;
  /** The variant the play actually looks like, by player count — the
   *  format we offer to create/find a compatible playbook for. Null when
   *  no supported variant matches the observed count. */
  inferredVariant: SportVariant | null;
};

/** A mismatch, plus the play drafted against its INFERRED variant so the
 *  coach can still land it in a correctly-formatted playbook (created or
 *  existing) instead of losing the read. The draft is absent only when
 *  the observed player count maps to no supported variant. */
export type VariantMismatchDraft = {
  mismatch: VariantMismatch;
  spec: PlaySpec | null;
  mapping: PlayerMapping[] | null;
  warnings: ImportWarning[] | null;
};

/**
 * Build the mismatch outcome for an extraction that doesn't fit the
 * playbook it was imported into. Pure (no LLM, no DB) so it's unit
 * testable: it synthesizes the draft against the play's own inferred
 * variant, NOT the playbook's — forcing a 5-player play onto a 7-slot
 * roster is exactly the "garbage by construction" this gate exists to
 * prevent. The real save re-synthesizes against the chosen target
 * playbook's variant (same player count), so this draft is a faithful
 * preview the coach reviews before it persists.
 */
export function buildVariantMismatchDraft(
  extraction: PlayExtraction,
  playbookVariant: SportVariant,
  title: string,
): VariantMismatchDraft {
  const fit = variantFit(extraction, playbookVariant);
  const inferredVariant = variantForOffenseCount(fit.photoPlayers);
  const mismatch: VariantMismatch = { ...fit, variant: playbookVariant, inferredVariant };
  if (!inferredVariant) {
    return { mismatch, spec: null, mapping: null, warnings: null };
  }
  const synthesis = synthesizePlaySpec(extraction, {
    variant: inferredVariant,
    maxThrowDepthYds: null,
    title,
  });
  return { mismatch, spec: synthesis.spec, mapping: synthesis.mapping, warnings: synthesis.warnings };
}

export type PanelImportOutcome =
  | {
      ok: true;
      kind: "result";
      extraction: PlayExtraction;
      spec: PlaySpec;
      mapping: PlayerMapping[];
      warnings: ImportWarning[];
    }
  | {
      ok: true;
      kind: "variant_mismatch";
      extraction: PlayExtraction;
      mismatch: VariantMismatch;
      /** Draft play against the inferred variant (absent when the count
       *  matches no supported variant). */
      spec: PlaySpec | null;
      mapping: PlayerMapping[] | null;
      warnings: ImportWarning[] | null;
    }
  | { ok: false; error: string };

export async function runPanelImport(opts: {
  userId: string;
  playbookId: string;
  variant: SportVariant;
  cropBase64: string;
  mediaType: string;
  label: string;
}): Promise<PanelImportOutcome> {
  let read = await extractPanel({
    cropBase64: opts.cropBase64,
    mediaType: opts.mediaType,
    label: opts.label,
    userId: opts.userId,
  });
  if (!read.ok) return { ok: false, error: read.error };

  // Completeness re-read: exactly one skill player short is almost
  // always a silently dropped circle (edge-clipped, or buried under
  // crossing routes — a real prod failure, 2026-07-03), not a
  // different format. One corrective pass with an explicit count;
  // keep whichever read found more players. Two-or-more short is the
  // variant gate's territory below.
  const firstFit = variantFit(read.extraction, opts.variant);
  if (firstFit.delta === -1) {
    const reread = await extractPanel({
      cropBase64: opts.cropBase64,
      mediaType: opts.mediaType,
      label: opts.label,
      userId: opts.userId,
      extraHint:
        `A previous read of this panel found only ${firstFit.observedSkill} route-running players, but it should show ` +
        `${firstFit.expectedSkill} lettered circles besides C and Q. Count the circles again — check the panel edges and ` +
        `spots where routes cross — and include EVERY circle, even if partially cut off.`,
    });
    if (reread.ok && variantFit(reread.extraction, opts.variant).observedSkill > firstFit.observedSkill) {
      read = reread;
    }
  }

  // One imported panel = one unit of the monthly image cap, regardless
  // of internal re-reads (those are our QA cost, not the coach's).
  void recordCoachCalImageUsed(opts.userId);

  // Observability: the raw semantic read, one grep-able line per import.
  // When a coach reports a bad draft, this line tells us whether the
  // MODEL misread the panel or the deterministic synthesis mishandled a
  // correct read. Photos themselves are never logged.
  console.log(
    `[photo-import] extraction user=${opts.userId} playbook=${opts.playbookId} label="${opts.label}" ` +
      JSON.stringify(read.extraction),
  );

  // Variant gate: a 7v7 sheet imported into a 5v5 playbook produces
  // garbage by construction. |delta| of 1 is more likely a missed
  // receiver, so it proceeds with the count-mismatch warning.
  const fit = variantFit(read.extraction, opts.variant);
  if (Math.abs(fit.delta) >= 2) {
    const draft = buildVariantMismatchDraft(read.extraction, opts.variant, opts.label);
    return {
      ok: true,
      kind: "variant_mismatch",
      extraction: read.extraction,
      mismatch: draft.mismatch,
      spec: draft.spec,
      mapping: draft.mapping,
      warnings: draft.warnings,
    };
  }

  const settings = await loadPlaybookSettings(opts.playbookId, opts.variant);
  const synthesis = synthesizePlaySpec(read.extraction, {
    variant: opts.variant,
    maxThrowDepthYds: settings.maxThrowDepthYds ?? null,
    title: opts.label,
  });

  return {
    ok: true,
    kind: "result",
    extraction: read.extraction,
    spec: synthesis.spec,
    mapping: synthesis.mapping,
    warnings: synthesis.warnings,
  };
}
