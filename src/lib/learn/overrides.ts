// Library concept overrides — server-side read and write helpers.
//
// The library renders catalog-derived diagrams by default (via
// `generateConceptSkeleton` + `playSpecToCoachDiagram`). Admins can
// edit any play through the Edit affordance on the variant page,
// which persists to `public.library_concept_overrides`.
//
// Read path (server components):
//   const override = await loadLibraryOverride(slug, variant);
//   const doc = override?.document ?? defaultDocFromCatalog(...);
//
// Write path (server action):
//   await saveLibraryOverride(slug, variant, doc, coachNotes);
//   // throws if the caller isn't a site admin
//
// Authorization. Reads use the user's regular Supabase client (RLS:
// `library_concept_overrides_select_public`). Writes use the
// service-role client because the form posts from an admin page and
// we already verified the caller is an admin server-side. We do NOT
// rely on RLS alone for writes — the explicit `is_site_admin()`
// check + service-role write keeps the path debuggable and matches
// the pattern used by the rest of the admin-only mutations.

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { isCurrentUserSiteAdmin } from "@/lib/learn/access";
import { parsePlayDocument } from "@/domain/play/schema";
import type { PlayDocument } from "@/domain/play/types";

export type LibraryOverride = {
  slug: string;
  variant: string;
  document: PlayDocument;
  coachNotes: string | null;
  /** Concept-level metadata overrides (Phase B, 2026-05-26). Each is
   *  null when the catalog default should be used. When set, takes
   *  precedence over the corresponding `ConceptDef` field. */
  descriptionOverride: string | null;
  bodyOverride: string | null;
  whenToUseOverride: string | null;
  commonMistakesOverride: string[] | null;
  updatedAt: string;
  updatedBy: string | null;
};

/** Read the override for (slug, variant), or null if none exists.
 *  Used by the public library variant page — anon-safe (RLS lets
 *  everyone select). Parses the stored document through the canonical
 *  PlayDocument schema; a malformed row returns null with a console
 *  warning rather than crashing the page render (the catalog
 *  skeleton will be used instead). */
export async function loadLibraryOverride(
  slug: string,
  variant: string,
): Promise<LibraryOverride | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("library_concept_overrides")
      .select(
        "slug, variant, document, coach_notes, description_override, body_override, when_to_use_override, common_mistakes_override, updated_at, updated_by",
      )
      .eq("slug", slug)
      .eq("variant", variant)
      .maybeSingle();
    if (error || !data) return null;
    const parsed = parsePlayDocument(data.document);
    if (!parsed.success) {
      // Don't crash the page render — fall back to the catalog
      // skeleton. Log so admins notice the corrupted row.
      console.warn(
        `[library/overrides] dropping malformed override for ${slug}:${variant}`,
        parsed.error.issues,
      );
      return null;
    }
    // Common-mistakes column is jsonb (string[]). Tolerate the
    // legacy null + non-array shapes — admins manually nulling the
    // column or seeded rows with bad shape shouldn't crash the
    // render.
    const rawMistakes = data.common_mistakes_override;
    const commonMistakesOverride =
      Array.isArray(rawMistakes) &&
      rawMistakes.every((s) => typeof s === "string")
        ? (rawMistakes as string[])
        : null;
    return {
      slug: data.slug as string,
      variant: data.variant as string,
      document: parsed.data as PlayDocument,
      coachNotes: (data.coach_notes as string | null) ?? null,
      descriptionOverride: (data.description_override as string | null) ?? null,
      bodyOverride: (data.body_override as string | null) ?? null,
      whenToUseOverride: (data.when_to_use_override as string | null) ?? null,
      commonMistakesOverride,
      updatedAt: data.updated_at as string,
      updatedBy: (data.updated_by as string | null) ?? null,
    };
  } catch (err) {
    console.warn(`[library/overrides] read failed for ${slug}:${variant}`, err);
    return null;
  }
}

/** Concept-level metadata overrides. Each field is optional — pass
 *  `undefined` to leave the existing DB value untouched (e.g. don't
 *  clobber a previously-saved description), or pass `null` to
 *  explicitly clear it (revert to catalog default). Empty strings
 *  are normalized to null at the save boundary so admins don't
 *  accidentally save whitespace-only overrides. */
export type LibraryMetadataPatch = {
  descriptionOverride?: string | null;
  bodyOverride?: string | null;
  whenToUseOverride?: string | null;
  commonMistakesOverride?: string[] | null;
};

/** Persist an admin's override edit. Throws on non-admin callers —
 *  the calling server action is responsible for invoking this only
 *  after gating on `isCurrentUserSiteAdmin()`, but we re-check here
 *  so the data path is closed-loop. Uses the service-role client to
 *  bypass the RLS dependency on `auth.uid()` (which isn't reliably
 *  populated in server-action Supabase clients). */
export async function saveLibraryOverride(
  slug: string,
  variant: string,
  document: PlayDocument,
  coachNotes: string | null,
  metadataPatch?: LibraryMetadataPatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase not configured." };
  }
  if (!(await isCurrentUserSiteAdmin())) {
    return { ok: false, error: "Admin role required." };
  }
  // Round-trip through the schema so we never persist a malformed
  // document — catalog plays already round-trip cleanly, but the
  // admin editor can introduce edge cases the renderer accepts but
  // the strict schema rejects (e.g. empty player labels).
  const parsed = parsePlayDocument(document);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Invalid play document: ${issues}` };
  }
  // Pull the acting user's id so the row's `updated_by` is set —
  // separate from RLS, this gives us an audit trail of who last
  // touched each override. Falling back to null is fine (the column
  // is nullable to support service-role seeds).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Build the upsert payload. Metadata fields use `undefined ↔ skip`
  // semantics: if the patch doesn't pass a key, we DON'T touch the
  // column. If it passes null, we explicitly clear it. Empty strings
  // collapse to null (so an admin saving a blank field is treated as
  // "clear" — same as the editor leaving the textarea empty).
  const m = metadataPatch ?? {};
  const normalize = (v: string | null | undefined): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const trimmed = v.trim();
    return trimmed.length === 0 ? null : trimmed;
  };
  const normalizeMistakes = (
    v: string[] | null | undefined,
  ): string[] | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const cleaned = v.map((s) => s.trim()).filter((s) => s.length > 0);
    return cleaned.length === 0 ? null : cleaned;
  };
  const payload: Record<string, unknown> = {
    slug,
    variant,
    document: parsed.data as unknown as Record<string, unknown>,
    coach_notes: coachNotes,
    updated_at: new Date().toISOString(),
    updated_by: user?.id ?? null,
  };
  const desc = normalize(m.descriptionOverride);
  if (desc !== undefined) payload.description_override = desc;
  const body = normalize(m.bodyOverride);
  if (body !== undefined) payload.body_override = body;
  const when = normalize(m.whenToUseOverride);
  if (when !== undefined) payload.when_to_use_override = when;
  const mistakes = normalizeMistakes(m.commonMistakesOverride);
  if (mistakes !== undefined) payload.common_mistakes_override = mistakes;

  const svc = createServiceRoleClient();
  const { error } = await svc
    .from("library_concept_overrides")
    .upsert(payload, { onConflict: "slug,variant" });
  if (error) {
    console.error(`[library/overrides] write failed for ${slug}:${variant}`, error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Save concept-level metadata WITHOUT touching the play document.
 *
 *  The play document column is NOT NULL, so when no override row
 *  exists yet for (slug, variant) we need a document to seed the
 *  row. The caller passes `seedDocument` for that case — typically
 *  the catalog default (generated server-side from the skeleton).
 *  When a row already exists, the seed is ignored and we issue an
 *  UPDATE that only touches the metadata columns.
 *
 *  Admin-only; service-role write. Mirrors `saveLibraryOverride`. */
export async function saveLibraryMetadata(
  slug: string,
  variant: string,
  metadata: LibraryMetadataPatch,
  seedDocument: PlayDocument,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase not configured." };
  }
  if (!(await isCurrentUserSiteAdmin())) {
    return { ok: false, error: "Admin role required." };
  }
  // Validate the seed doc — even though we may not write it, we
  // want a closed-loop guarantee that whatever lands in the row is
  // parseable.
  const parsedSeed = parsePlayDocument(seedDocument);
  if (!parsedSeed.success) {
    const issues = parsedSeed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Invalid seed document: ${issues}` };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const svc = createServiceRoleClient();

  // Build the metadata patch using the same normalize-empty-to-null
  // rules `saveLibraryOverride` uses.
  const normalize = (v: string | null | undefined): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const trimmed = v.trim();
    return trimmed.length === 0 ? null : trimmed;
  };
  const normalizeMistakes = (
    v: string[] | null | undefined,
  ): string[] | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const cleaned = v.map((s) => s.trim()).filter((s) => s.length > 0);
    return cleaned.length === 0 ? null : cleaned;
  };
  const metadataPayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user?.id ?? null,
  };
  const desc = normalize(metadata.descriptionOverride);
  if (desc !== undefined) metadataPayload.description_override = desc;
  const body = normalize(metadata.bodyOverride);
  if (body !== undefined) metadataPayload.body_override = body;
  const when = normalize(metadata.whenToUseOverride);
  if (when !== undefined) metadataPayload.when_to_use_override = when;
  const mistakes = normalizeMistakes(metadata.commonMistakesOverride);
  if (mistakes !== undefined) metadataPayload.common_mistakes_override = mistakes;

  // Check whether the row exists. If yes → UPDATE metadata only
  // (leaves doc + coach_notes untouched). If no → INSERT seed doc +
  // metadata.
  const { data: existing } = await svc
    .from("library_concept_overrides")
    .select("slug")
    .eq("slug", slug)
    .eq("variant", variant)
    .maybeSingle();

  if (existing) {
    const { error } = await svc
      .from("library_concept_overrides")
      .update(metadataPayload)
      .eq("slug", slug)
      .eq("variant", variant);
    if (error) {
      console.error(
        `[library/overrides] metadata update failed for ${slug}:${variant}`,
        error,
      );
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }

  const { error } = await svc.from("library_concept_overrides").insert({
    slug,
    variant,
    document: parsedSeed.data as unknown as Record<string, unknown>,
    coach_notes: null,
    ...metadataPayload,
  });
  if (error) {
    console.error(
      `[library/overrides] metadata insert failed for ${slug}:${variant}`,
      error,
    );
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Remove an admin's override and revert this (slug, variant) to the
 *  catalog default. Admin-only. */
export async function deleteLibraryOverride(
  slug: string,
  variant: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  if (!(await isCurrentUserSiteAdmin())) {
    return { ok: false, error: "Admin role required." };
  }
  const svc = createServiceRoleClient();
  const { error } = await svc
    .from("library_concept_overrides")
    .delete()
    .eq("slug", slug)
    .eq("variant", variant);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
