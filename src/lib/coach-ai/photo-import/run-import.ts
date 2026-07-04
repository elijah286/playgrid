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
import { synthesizePlaySpec, variantFit } from "./synthesize";
import type { PlayExtraction } from "./schema";
import type { ImportWarning, PlayerMapping } from "./synthesize";
import type { PlaySpec } from "@/domain/play/spec";

export type VariantMismatch = {
  observedSkill: number;
  expectedSkill: number;
  photoPlayers: number;
  expectedPlayers: number;
  delta: number;
  variant: SportVariant;
};

export type PanelImportOutcome =
  | {
      ok: true;
      kind: "result";
      extraction: PlayExtraction;
      spec: PlaySpec;
      mapping: PlayerMapping[];
      warnings: ImportWarning[];
    }
  | { ok: true; kind: "variant_mismatch"; extraction: PlayExtraction; mismatch: VariantMismatch }
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
    return {
      ok: true,
      kind: "variant_mismatch",
      extraction: read.extraction,
      mismatch: { ...fit, variant: opts.variant },
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
