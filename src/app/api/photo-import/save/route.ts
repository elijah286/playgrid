/**
 * POST /api/photo-import/save
 *
 * Step 3 of photo play import: persist the coach-reviewed spec as a new
 * play. Runs the SAME gate sequence as Coach Cal's create_play handler
 * (AGENTS.md Rule 4 — every play write routes through the resolver):
 *
 *   resolveDiagramAndSpec → color-clash autofix → route-assignment
 *   validation (incl. playbook throw cap) → play-content validation →
 *   createPlayAction → document + spec + projected notes →
 *   recordPlayVersion → current_version_id.
 *
 * Body: { playbookId, spec, name }
 * →     { playId, url }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { SportVariant } from "@/domain/play/types";
import { parsePlaySpec } from "@/domain/play/spec";
import {
  resolveDiagramAndSpec,
  loadPlaybookSettings,
  formatRouteAssignmentErrors,
} from "@/lib/coach-ai/play-tools";
import { validateRouteAssignments } from "@/lib/coach-ai/route-assignment-validate";
import {
  validatePlayContent,
  formatPlayContentErrors,
  autoResolveColorClashes,
} from "@/lib/coach-ai/play-content-validate";
import { projectSpecToNotes } from "@/lib/coach-ai/notes-from-spec";
import { coachDiagramToPlayDocument, type CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";
import { createPlayAction } from "@/app/actions/plays";
import { recordPlayVersion } from "@/lib/versions/play-version-writer";
import { checkPhotoImportAccess } from "@/lib/coach-ai/photo-import/access";
import {
  applySheetIdentity,
  applyPhotoAlignment,
  rewriteNotesToSheetLabels,
} from "@/lib/coach-ai/photo-import/synthesize";

type SaveRequest = {
  playbookId?: string;
  spec?: unknown;
  name?: string;
  mapping?: unknown;
  /** false → keep the playbook's slot letters (colors still applied). */
  useSheetLabels?: boolean;
};

const pointSchema = z.object({ x: z.number().min(-40).max(40), y: z.number().min(-20).max(30) }).strict();

const mappingSchema = z
  .array(
    z
      .object({
        sheetLabel: z.string().min(1).max(8),
        rosterId: z.string().min(1).max(8),
        sheetColor: z.string().max(16).optional(),
        align: pointSchema.optional(),
        routeStartAt: pointSchema.optional(),
      })
      .strict(),
  )
  .max(24);

export async function POST(req: Request) {
  const access = await checkPhotoImportAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: SaveRequest;
  try {
    body = (await req.json()) as SaveRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!body.playbookId || !name) {
    return NextResponse.json({ error: "playbookId and a play name are required." }, { status: 400 });
  }

  // RLS-scoped read doubles as the permission check.
  const supabase = await createClient();
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("sport_variant")
    .eq("id", body.playbookId)
    .maybeSingle();
  if (!playbook) return NextResponse.json({ error: "Playbook not found." }, { status: 404 });
  const variant = (playbook.sport_variant ?? "flag_7v7") as SportVariant;

  const parsed = parsePlaySpec({ ...(body.spec as Record<string, unknown>), variant });
  if (!parsed.success) {
    return NextResponse.json(
      { error: `The reviewed play didn't validate: ${parsed.error.message.slice(0, 400)}` },
      { status: 400 },
    );
  }
  const spec = parsed.data;

  const settings = await loadPlaybookSettings(body.playbookId, variant);
  const resolved = resolveDiagramAndSpec(spec, undefined, variant, {
    formationName: spec.formation.name,
    playType: "offense",
    advancedCapabilities: settings.advancedCapabilities,
    centerEligible: settings.centerIsEligible ?? (variant === "flag_5v5"),
  });
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });

  // Photo fidelity: players start where the photo shows them (with
  // motion drawn), and the play wears the sheet's letters/colors —
  // same transform order as the client preview, so what the coach
  // approved is what persists.
  const mappingParse = mappingSchema.safeParse(body.mapping ?? []);
  const mapping = mappingParse.success ? mappingParse.data : [];

  const aligned = applyPhotoAlignment({ ...resolved.diagram, variant, title: name }, mapping, variant);
  const diagram: CoachDiagram = applySheetIdentity(aligned, mapping, {
    labels: body.useSheetLabels !== false,
  });
  autoResolveColorClashes(diagram);

  const assignmentCheck = validateRouteAssignments(diagram, {
    variant,
    maxRouteDepthYds: settings.maxThrowDepthYds ?? undefined,
  });
  if (!assignmentCheck.ok) {
    return NextResponse.json({ error: formatRouteAssignmentErrors(assignmentCheck.errors) }, { status: 400 });
  }

  const contentCheck = validatePlayContent(diagram, variant, settings, "offense");
  if (!contentCheck.ok) {
    return NextResponse.json({ error: formatPlayContentErrors(contentCheck.errors) }, { status: 400 });
  }

  const created = await createPlayAction(body.playbookId, {
    playName: name,
    playType: "offense",
    formationName: spec.formation.name,
    variant,
  });
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: 400 });

  const doc = coachDiagramToPlayDocument(diagram);
  doc.metadata.coachName = name;
  doc.metadata.formation = spec.formation.name;
  doc.metadata.playType = "offense";
  doc.metadata.spec = resolved.spec ?? spec;
  try {
    const projected = projectSpecToNotes(spec);
    if (projected.trim().length > 0) {
      // Notes speak whichever lettering the diagram wears.
      doc.metadata.notes =
        body.useSheetLabels !== false ? rewriteNotesToSheetLabels(projected, mapping) : projected;
    }
  } catch {
    // Never block a save on notes projection.
  }

  const admin = createServiceRoleClient();
  const versionResult = await recordPlayVersion({
    supabase: admin,
    playId: created.playId,
    document: doc,
    parentVersionId: created.versionId,
    userId: access.userId,
    kind: "edit",
    actor: "ai",
    note: "Imported from photo",
  });
  if (!versionResult.ok) return NextResponse.json({ error: versionResult.error }, { status: 500 });

  const finalVersionId = versionResult.deduped ? created.versionId : versionResult.versionId;
  if (!versionResult.deduped) {
    const { error: upErr } = await admin
      .from("plays")
      .update({ current_version_id: finalVersionId, updated_at: new Date().toISOString() })
      .eq("id", created.playId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ playId: created.playId, url: `/plays/${created.playId}/edit` });
}
