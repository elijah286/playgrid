import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import { generateConceptSkeleton } from "@/domain/play/conceptSkeleton";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";
import { coachDiagramToPlayDocument } from "@/features/coach-ai/coachDiagramConverter";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";
import { isCurrentUserSiteAdmin } from "@/lib/learn/access";
import { loadLibraryOverride } from "@/lib/learn/overrides";
import { toLearnSlug } from "@/lib/learn/links";
import {
  LIBRARY_VARIANTS,
  VARIANT_LABEL,
  slugToVariant,
  variantToSlug,
  type LibraryVariant,
} from "@/lib/learn/variant";
import { LibraryOverrideEditor } from "./LibraryOverrideEditor";

// Admin-only — no public crawling, no static generation. The page
// reads the latest override on every request so admins always start
// from the live state of `library_concept_overrides`.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit library play (admin)",
  robots: { index: false, follow: false },
};

/** Admin override-edit page. Loads the current override for
 *  (slug, variant) — or the catalog skeleton when no override
 *  exists — and renders the canonical play editor with full editing
 *  affordances. Edits autosave through the `saveLibraryOverride`
 *  action keyed by (slug, variant), distinct from the in-app
 *  `play_versions` write path.
 *
 *  Architecture note: the editor is the SAME `PlayEditorClient` the
 *  in-app builder uses, with `libraryMode={false}` and an override
 *  `saveAdapter` prop. Per Rule 14 (library uses the canonical
 *  renderer), the override edit experience can't fork into a parallel
 *  editor — one render path, one editing path. */
export default async function LibraryAdminEditPlayPage({
  params,
}: {
  params: Promise<{ slug: string; variant: string }>;
}) {
  if (!(await isCurrentUserSiteAdmin())) notFound();

  const { slug, variant: variantSlug } = await params;
  const concept = CONCEPTS.find((c) => toLearnSlug(c.name) === slug);
  const variant = slugToVariant(variantSlug);
  if (!concept || !variant) notFound();
  if (!LIBRARY_VARIANTS.includes(variant as LibraryVariant)) notFound();
  const supported = (concept.variants ?? []).filter((v): v is LibraryVariant =>
    LIBRARY_VARIANTS.includes(v as LibraryVariant),
  );
  if (!supported.includes(variant)) notFound();

  // Catalog default. If no override exists, this is the starting
  // doc; if one exists, we use the override but still need the
  // default around for the "Reset to catalog default" button.
  const skeleton = generateConceptSkeleton(concept.name, {
    variant,
    strength: "right",
  });
  if (!skeleton.ok) notFound();
  const { diagram } = playSpecToCoachDiagram(skeleton.spec);
  const defaultDoc = coachDiagramToPlayDocument(diagram);
  const playbookSettings = defaultSettingsForVariant(variant);

  const override = await loadLibraryOverride(slug, variant);
  // When an override exists with `coach_notes`, hoist them onto the
  // doc's metadata so the editor's PlayNotesCard surfaces them in
  // the editing UI (and so the doc-keyed autosave hoists them right
  // back to `coach_notes` on the next write — a no-op round-trip
  // that keeps both columns in sync). Without this hoist, an
  // existing override with notes would look note-less inside the
  // editor.
  const baseDoc = override?.document ?? defaultDoc;
  const startingDoc = override?.coachNotes
    ? {
        ...baseDoc,
        metadata: { ...baseDoc.metadata, notes: override.coachNotes },
      }
    : baseDoc;

  // Catalog defaults for the metadata fields. These are the
  // fallbacks shown in the form when no override exists yet; they
  // also serve as the placeholder so admins can see "what the page
  // currently shows" without needing to type the override from
  // scratch when they only want a small tweak.
  const catalogDefaults = {
    description: concept.description,
    body: concept.body ?? concept.description,
    whenToUse: concept.whenToUse ?? "",
    commonMistakes: concept.commonMistakes ?? [],
  };
  // Current overrides (null when not set; the form uses null to
  // mean "use catalog default").
  const initialMetadata = {
    descriptionOverride: override?.descriptionOverride ?? null,
    bodyOverride: override?.bodyOverride ?? null,
    whenToUseOverride: override?.whenToUseOverride ?? null,
    commonMistakesOverride: override?.commonMistakesOverride ?? null,
  };

  return (
    <LibraryOverrideEditor
      slug={slug}
      variant={variant}
      variantSlug={variantSlug}
      conceptName={concept.name}
      variantLabel={VARIANT_LABEL[variant]}
      libraryVariantSlugs={supported.map((v) => ({
        variant: v,
        slug: variantToSlug(v),
        label: VARIANT_LABEL[v],
      }))}
      hasOverride={override != null}
      startingDoc={startingDoc}
      // The catalog default doc is passed separately so the metadata
      // form can seed a row with it when the admin saves metadata
      // before touching the play diagram.
      defaultDoc={defaultDoc}
      catalogDefaults={catalogDefaults}
      initialMetadata={initialMetadata}
      playbookSettings={playbookSettings}
    />
  );
}
