/**
 * POST /api/photo-import/extract
 *
 * Step 2 of photo play import: read ONE panel into a semantic
 * PlayExtraction (expensive vision call) and synthesize it onto a
 * PlaySpec against the target playbook's variant and throw-cap rules.
 * Counts one image against the monthly cap. Nothing is saved as a play
 * — the coach reviews and corrects the draft first.
 *
 * The run is also persisted as a photo_import_jobs row (best-effort)
 * so a coach who leaves the page mid-read can resume the result — or
 * retry a stalled read — from "Recent imports". The stored panel crop
 * lives at most 24h.
 *
 * Body: { playbookId, image: { base64, mediaType }, bbox?, label? }
 * →     { jobId?, extraction, spec, mapping, warnings, variant, capRemaining }
 *   or  { jobId?, variantMismatch, capRemaining }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SportVariant } from "@/domain/play/types";
import { checkPhotoImportAccess, capBlocks } from "@/lib/coach-ai/photo-import/access";
import { runPanelImport } from "@/lib/coach-ai/photo-import/run-import";
import { createJob, finishJob } from "@/lib/coach-ai/photo-import/jobs";
import {
  cropPanel,
  isSupportedMediaType,
  MAX_IMAGE_BASE64_CHARS,
  WHOLE_IMAGE_BBOX,
} from "@/lib/coach-ai/photo-import/imaging";
import { validateBBox, type NormalizedBBox } from "@/lib/coach-ai/image-crop";

type ExtractRequest = {
  playbookId?: string;
  image?: { base64?: string; mediaType?: string };
  bbox?: NormalizedBBox;
  label?: string;
};

export async function POST(req: Request) {
  const access = await checkPhotoImportAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (capBlocks(access)) {
    return NextResponse.json(
      { error: `You've used all ${access.cap.limit} photo imports this month. Resets ${access.cap.resetDate}.` },
      { status: 403 },
    );
  }

  let body: ExtractRequest;
  try {
    body = (await req.json()) as ExtractRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const base64 = body.image?.base64;
  const mediaType = body.image?.mediaType;
  if (!body.playbookId || !base64 || !mediaType || !isSupportedMediaType(mediaType)) {
    return NextResponse.json({ error: "playbookId and a base64 JPEG/PNG/WebP photo are required." }, { status: 400 });
  }
  if (base64.length > MAX_IMAGE_BASE64_CHARS) {
    return NextResponse.json({ error: "Photo is too large — export it smaller and retry." }, { status: 413 });
  }

  // The user-scoped client enforces RLS: a playbook the caller can't
  // read comes back null, which doubles as the permission check.
  const supabase = await createClient();
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("sport_variant")
    .eq("id", body.playbookId)
    .maybeSingle();
  if (!playbook) return NextResponse.json({ error: "Playbook not found." }, { status: 404 });
  const variant = (playbook.sport_variant ?? "flag_7v7") as SportVariant;

  const bbox = body.bbox && validateBBox(body.bbox) === null ? body.bbox : WHOLE_IMAGE_BBOX;
  const label = (body.label ?? "Imported play").slice(0, 40);
  const crop = await cropPanel(base64, mediaType, bbox, label);
  if (!crop) return NextResponse.json({ error: "Couldn't crop that panel from the photo." }, { status: 422 });

  // Persist the run so it survives the coach leaving the page.
  const jobId = await createJob({
    userId: access.userId,
    playbookId: body.playbookId,
    label,
    cropBase64: crop.base64,
    mediaType: crop.mediaType,
  });

  const outcome = await runPanelImport({
    userId: access.userId,
    playbookId: body.playbookId,
    variant,
    cropBase64: crop.base64,
    mediaType: crop.mediaType,
    label,
  });

  const capRemaining = Math.max(0, access.cap.remaining - 1);

  if (!outcome.ok) {
    await finishJob(jobId, { status: "error", error: outcome.error });
    return NextResponse.json({ error: outcome.error, jobId }, { status: 502 });
  }
  if (outcome.kind === "variant_mismatch") {
    await finishJob(jobId, { status: "done", extraction: outcome.extraction, variantMismatch: outcome.mismatch });
    return NextResponse.json({ jobId, variantMismatch: outcome.mismatch, capRemaining });
  }

  await finishJob(jobId, {
    status: "done",
    extraction: outcome.extraction,
    spec: outcome.spec,
    mapping: outcome.mapping,
    warnings: outcome.warnings,
  });

  return NextResponse.json({
    jobId,
    extraction: outcome.extraction,
    spec: outcome.spec,
    mapping: outcome.mapping,
    warnings: outcome.warnings,
    variant,
    capRemaining,
  });
}
