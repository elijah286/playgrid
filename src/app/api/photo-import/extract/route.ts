/**
 * POST /api/photo-import/extract
 *
 * Step 2 of photo play import: read ONE panel into a semantic
 * PlayExtraction (expensive vision call) and synthesize it onto a
 * PlaySpec against the target playbook's variant and throw-cap rules.
 * Counts one image against the monthly cap. Nothing is saved — the
 * coach reviews and corrects the draft client-side first.
 *
 * Body: { playbookId, image: { base64, mediaType }, bbox?, label? }
 * →     { extraction, spec, mapping, warnings, variant, capRemaining }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SportVariant } from "@/domain/play/types";
import { loadPlaybookSettings } from "@/lib/coach-ai/play-tools";
import { recordCoachCalImageUsed } from "@/lib/billing/coach-cal-image-cap";
import { checkPhotoImportAccess, capBlocks } from "@/lib/coach-ai/photo-import/access";
import { extractPanel } from "@/lib/coach-ai/photo-import/llm-calls";
import { synthesizePlaySpec } from "@/lib/coach-ai/photo-import/synthesize";
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

  const read = await extractPanel({
    cropBase64: crop.base64,
    mediaType: crop.mediaType,
    label,
    userId: access.userId,
  });
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 502 });

  // One successful expensive read = one unit of the monthly image cap
  // (admins are counted too, just not blocked).
  void recordCoachCalImageUsed(access.userId);

  const settings = await loadPlaybookSettings(body.playbookId, variant);
  const synthesis = synthesizePlaySpec(read.extraction, {
    variant,
    maxThrowDepthYds: settings.maxThrowDepthYds ?? null,
    title: label,
  });

  return NextResponse.json({
    extraction: read.extraction,
    spec: synthesis.spec,
    mapping: synthesis.mapping,
    warnings: synthesis.warnings,
    variant,
    capRemaining: Math.max(0, access.cap.remaining - 1),
  });
}
