"use server";

// Library admin override actions. Called from the admin Edit page
// (`/learn/library/admin/plays/[slug]/[variant]/edit`) when the
// editor saves. The helpers in `lib/learn/overrides.ts` enforce the
// admin gate; these wrappers are the server-action surface the
// editor's client can call directly.

import { revalidatePath } from "next/cache";
import type { PlayDocument } from "@/domain/play/types";
import {
  saveLibraryOverride,
  saveLibraryMetadata,
  deleteLibraryOverride,
  type LibraryMetadataPatch,
} from "@/lib/learn/overrides";

/** Save an override edit. Returns ok/error; the caller renders an
 *  inline toast. After a successful save, the public library page
 *  for that (slug, variant) is revalidated so the next visitor sees
 *  the override on the first request (no manual refresh).
 *
 *  `metadata` is optional. When omitted, only the document + coach
 *  notes are written (existing metadata columns are preserved). When
 *  passed, each metadata field follows the LibraryMetadataPatch
 *  convention: undefined → skip, null → clear, string → set. */
export async function saveLibraryOverrideAction(input: {
  slug: string;
  variant: string;
  document: PlayDocument;
  coachNotes: string | null;
  metadata?: LibraryMetadataPatch;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await saveLibraryOverride(
    input.slug,
    input.variant,
    input.document,
    input.coachNotes,
    input.metadata,
  );
  if (result.ok) {
    // Re-render both the public variant page (override takes effect
    // immediately) and the variant-less redirect (which derives its
    // default variant from the same catalog).
    revalidatePath(`/learn/library/plays/${input.slug}/${variantSlugFor(input.variant)}`);
    revalidatePath(`/learn/library/plays/${input.slug}`);
  }
  return result;
}

/** Save ONLY the concept-level metadata override (description, body,
 *  when-to-use, common mistakes) without touching the play document.
 *  When no override row exists yet, `seedDocument` is used to create
 *  the row (typically the catalog-default doc for this (slug,
 *  variant)). When a row exists, the seed is ignored — only the
 *  metadata columns are touched. */
export async function saveLibraryMetadataAction(input: {
  slug: string;
  variant: string;
  metadata: LibraryMetadataPatch;
  seedDocument: PlayDocument;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await saveLibraryMetadata(
    input.slug,
    input.variant,
    input.metadata,
    input.seedDocument,
  );
  if (result.ok) {
    revalidatePath(`/learn/library/plays/${input.slug}/${variantSlugFor(input.variant)}`);
    revalidatePath(`/learn/library/plays/${input.slug}`);
  }
  return result;
}

/** Drop the override, falling back to the catalog skeleton for that
 *  (slug, variant). Same revalidation as `saveLibraryOverrideAction`. */
export async function deleteLibraryOverrideAction(input: {
  slug: string;
  variant: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await deleteLibraryOverride(input.slug, input.variant);
  if (result.ok) {
    revalidatePath(`/learn/library/plays/${input.slug}/${variantSlugFor(input.variant)}`);
    revalidatePath(`/learn/library/plays/${input.slug}`);
  }
  return result;
}

// Internal: the variant id stored on the row uses underscores
// (`flag_5v5`) but the URL slug uses hyphens (`flag-5v5`). This
// helper mirrors `variantToSlug` from `src/lib/learn/variant.ts`
// without importing it (the lib module is a client-and-server module;
// keeping this server-only file decoupled).
function variantSlugFor(variant: string): string {
  return variant.replace(/_/g, "-");
}
