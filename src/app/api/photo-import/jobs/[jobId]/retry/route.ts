/**
 * POST /api/photo-import/jobs/[jobId]/retry
 *
 * Re-run a stalled or errored import from its stored panel crop — no
 * re-upload needed. Claiming is guarded (done jobs, fresh running
 * jobs, and >2 prior attempts are refused; optimistic lock prevents
 * two tabs double-claiming). A retry that actually runs spends one
 * image-cap unit like any extraction.
 *
 * → same response shape as /api/photo-import/extract.
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { SportVariant } from "@/domain/play/types";
import { checkPhotoImportAccess, capBlocks } from "@/lib/coach-ai/photo-import/access";
import { runPanelImport } from "@/lib/coach-ai/photo-import/run-import";
import { claimJobForRetry, finishJob } from "@/lib/coach-ai/photo-import/jobs";

export async function POST(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const access = await checkPhotoImportAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (capBlocks(access)) {
    return NextResponse.json(
      { error: `You've used all ${access.cap.limit} photo imports this month. Resets ${access.cap.resetDate}.` },
      { status: 403 },
    );
  }

  const { jobId } = await ctx.params;
  const claim = await claimJobForRetry(access.userId, jobId);
  if (!claim.ok) return NextResponse.json({ error: claim.error }, { status: 409 });
  const job = claim.job;

  const admin = createServiceRoleClient();
  const { data: playbook } = await admin
    .from("playbooks")
    .select("sport_variant")
    .eq("id", job.playbookId)
    .maybeSingle();
  if (!playbook) {
    await finishJob(job.id, { status: "error", error: "Playbook no longer exists." });
    return NextResponse.json({ error: "Playbook no longer exists." }, { status: 404 });
  }
  const variant = (playbook.sport_variant ?? "flag_7v7") as SportVariant;

  const outcome = await runPanelImport({
    userId: access.userId,
    playbookId: job.playbookId,
    variant,
    cropBase64: job.cropBase64!,
    mediaType: job.mediaType!,
    label: job.label,
  });

  const capRemaining = Math.max(0, access.cap.remaining - 1);

  if (!outcome.ok) {
    await finishJob(job.id, { status: "error", error: outcome.error });
    return NextResponse.json({ error: outcome.error, jobId: job.id }, { status: 502 });
  }
  if (outcome.kind === "variant_mismatch") {
    await finishJob(job.id, {
      status: "done",
      extraction: outcome.extraction,
      variantMismatch: outcome.mismatch,
      spec: outcome.spec,
      mapping: outcome.mapping,
      warnings: outcome.warnings,
    });
    return NextResponse.json({
      jobId: job.id,
      variantMismatch: outcome.mismatch,
      extraction: outcome.extraction,
      spec: outcome.spec,
      mapping: outcome.mapping,
      warnings: outcome.warnings,
      capRemaining,
    });
  }

  await finishJob(job.id, {
    status: "done",
    extraction: outcome.extraction,
    spec: outcome.spec,
    mapping: outcome.mapping,
    warnings: outcome.warnings,
  });

  return NextResponse.json({
    jobId: job.id,
    extraction: outcome.extraction,
    spec: outcome.spec,
    mapping: outcome.mapping,
    warnings: outcome.warnings,
    variant,
    capRemaining,
  });
}
