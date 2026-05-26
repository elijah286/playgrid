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
      .select("slug, variant, document, coach_notes, updated_at, updated_by")
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
    return {
      slug: data.slug as string,
      variant: data.variant as string,
      document: parsed.data as PlayDocument,
      coachNotes: (data.coach_notes as string | null) ?? null,
      updatedAt: data.updated_at as string,
      updatedBy: (data.updated_by as string | null) ?? null,
    };
  } catch (err) {
    console.warn(`[library/overrides] read failed for ${slug}:${variant}`, err);
    return null;
  }
}

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
  const svc = createServiceRoleClient();
  const { error } = await svc
    .from("library_concept_overrides")
    .upsert(
      {
        slug,
        variant,
        document: parsed.data as unknown as Record<string, unknown>,
        coach_notes: coachNotes,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      },
      { onConflict: "slug,variant" },
    );
  if (error) {
    console.error(`[library/overrides] write failed for ${slug}:${variant}`, error);
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
