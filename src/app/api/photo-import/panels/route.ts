/**
 * POST /api/photo-import/panels
 *
 * Step 1 of photo play import: locate the play panels on a photographed
 * sheet and return a small preview thumbnail per panel so the coach can
 * pick which play to import. The photo is processed in-flight and never
 * persisted.
 *
 * Body: { image: { base64, mediaType } }
 * →     { panels: [{ label, bbox, thumbBase64 }], capRemaining }
 */

import { NextResponse } from "next/server";
import { checkPhotoImportAccess, capBlocks } from "@/lib/coach-ai/photo-import/access";
import { detectPanels } from "@/lib/coach-ai/photo-import/llm-calls";
import {
  cropPanel,
  thumbnailBase64,
  isSupportedMediaType,
  MAX_IMAGE_BASE64_CHARS,
} from "@/lib/coach-ai/photo-import/imaging";

type PanelsRequest = {
  image?: { base64?: string; mediaType?: string };
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

  let body: PanelsRequest;
  try {
    body = (await req.json()) as PanelsRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const base64 = body.image?.base64;
  const mediaType = body.image?.mediaType;
  if (!base64 || !mediaType || !isSupportedMediaType(mediaType)) {
    return NextResponse.json({ error: "Send the photo as base64 JPEG, PNG, or WebP." }, { status: 400 });
  }
  if (base64.length > MAX_IMAGE_BASE64_CHARS) {
    return NextResponse.json({ error: "Photo is too large — export it smaller and retry." }, { status: 413 });
  }

  const detection = await detectPanels({ base64, mediaType, userId: access.userId });
  if (!detection.ok) return NextResponse.json({ error: detection.error }, { status: 502 });

  const panels: Array<{ label: string; bbox: unknown; thumbBase64: string }> = [];
  for (const panel of detection.panels) {
    const crop = await cropPanel(base64, mediaType, panel.bbox, panel.label);
    if (!crop) continue;
    panels.push({
      label: panel.label,
      bbox: panel.bbox,
      thumbBase64: await thumbnailBase64(crop.base64),
    });
  }
  if (panels.length === 0) {
    return NextResponse.json({ error: "No readable play panels were found on the photo." }, { status: 422 });
  }

  return NextResponse.json({ panels, capRemaining: access.cap.remaining });
}
