import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  DEFENSIVE_ALIGNMENTS,
  alignmentWithAssignments,
  zonesForStrength,
  type DefensiveAlignment,
} from "@/domain/play/defensiveAlignments";
import {
  coachDiagramToPlayDocument,
  type CoachDiagram,
} from "@/features/coach-ai/coachDiagramConverter";
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
import { DefenseOverrideEditor } from "./DefenseOverrideEditor";

// Admin-only — force-dynamic so admins always start from the live
// override state (no static caching).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit defense (admin)",
  robots: { index: false, follow: false },
};

function defenseDisplayName(a: DefensiveAlignment): string {
  const front = (a.front ?? "").trim();
  const coverage = (a.coverage ?? "").trim();
  if (!front || front.toLowerCase() === coverage.toLowerCase()) return coverage;
  return `${front} ${coverage}`.trim();
}

/** Suffix duplicate defender ids — same logic the public defense
 *  page and Cal's compose_defense tool use. Catalog 3-4 fronts have
 *  two DEs and two OLBs; without suffixing the CoachDiagram
 *  converter rejects duplicates. */
function suffixDuplicateIds<T extends { id: string }>(players: T[]): T[] {
  const seen = new Map<string, number>();
  return players.map((p) => {
    const count = (seen.get(p.id) ?? 0) + 1;
    seen.set(p.id, count);
    const id = count === 1 ? p.id : `${p.id}${count}`;
    return { ...p, id };
  });
}

/** Admin override-edit page for defenses. Parallel to
 *  `/learn/library/admin/plays/[slug]/[variant]/edit`. Loads either
 *  the saved override or the catalog default and opens the canonical
 *  PlayEditor in admin (canEdit=true) mode. Edits save to
 *  `library_concept_overrides` via the same row format used for
 *  offense — distinguished by the slug (defense slugs like
 *  "3-4-cover-1" never collide with concept slugs like "mesh").
 *
 *  Cal reads the override via `resolveDefensiveAlignment` in
 *  src/lib/learn/defense-resolver.ts, so admin edits flow to
 *  `compose_defense` / `place_defense` automatically. */
export default async function LibraryAdminEditDefensePage({
  params,
}: {
  params: Promise<{ slug: string; variant: string }>;
}) {
  if (!(await isCurrentUserSiteAdmin())) notFound();

  const { slug, variant: variantSlug } = await params;
  const variant = slugToVariant(variantSlug);
  if (!variant) notFound();
  if (!LIBRARY_VARIANTS.includes(variant as LibraryVariant)) notFound();

  // Find the catalog alignment for this (slug, variant).
  const alignment = DEFENSIVE_ALIGNMENTS.find(
    (a) => toLearnSlug(defenseDisplayName(a)) === slug && a.variant === variant,
  );
  if (!alignment) notFound();

  const displayName = defenseDisplayName(alignment);
  const playbookSettings = defaultSettingsForVariant(variant);

  // Build the catalog default PlayDocument from the alignment —
  // same conversion the public defense page uses (suffix duplicate
  // ids, then run through the canonical CoachDiagram converter).
  const defenders = alignmentWithAssignments(alignment, "right");
  const zones = zonesForStrength(alignment, "right");
  const uniqueDefenders = suffixDuplicateIds(
    defenders.map((p) => ({ id: p.id, x: p.x, y: p.y })),
  );
  const defaultDiagram: CoachDiagram = {
    title: displayName,
    variant,
    focus: "D",
    players: uniqueDefenders.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      team: "D" as const,
    })),
    routes: [],
    zones: zones.map((z) => ({
      kind: z.kind,
      center: z.center,
      size: z.size,
      label: z.label,
    })),
  };
  const defaultDoc = coachDiagramToPlayDocument(defaultDiagram);

  // Read any existing override for the same (slug, variant) and use
  // its document as the starting doc; otherwise start from the
  // catalog default.
  const override = await loadLibraryOverride(slug, variant);
  const startingDoc = override?.document ?? defaultDoc;

  // Variants this defense scheme supports — the variant pill below
  // jumps between them. The defense group has one entry per supported
  // variant in DEFENSIVE_ALIGNMENTS; collect them here.
  const supportedLibraryVariants: LibraryVariant[] = DEFENSIVE_ALIGNMENTS
    .filter((a) => toLearnSlug(defenseDisplayName(a)) === slug)
    .map((a) => a.variant)
    .filter((v): v is LibraryVariant =>
      LIBRARY_VARIANTS.includes(v as LibraryVariant),
    );

  // Catalog defaults for the metadata fields. The defense KG has
  // optional whenToUse + weaknesses — admins can edit those plus the
  // description. We don't expose body editing for defenses (the
  // catalog only has description; whenToUse/weaknesses serve as the
  // longer prose).
  const catalogDefaults = {
    description: alignment.description,
    body: alignment.description,
    whenToUse: alignment.whenToUse ?? "",
    commonMistakes: alignment.weaknesses ?? [],
  };
  const initialMetadata = {
    descriptionOverride: override?.descriptionOverride ?? null,
    bodyOverride: override?.bodyOverride ?? null,
    whenToUseOverride: override?.whenToUseOverride ?? null,
    commonMistakesOverride: override?.commonMistakesOverride ?? null,
  };

  return (
    <DefenseOverrideEditor
      slug={slug}
      variant={variant}
      variantSlug={variantSlug}
      defenseName={displayName}
      variantLabel={VARIANT_LABEL[variant]}
      libraryVariantSlugs={supportedLibraryVariants.map((v) => ({
        variant: v,
        slug: variantToSlug(v),
        label: VARIANT_LABEL[v],
      }))}
      hasOverride={override != null}
      startingDoc={startingDoc}
      defaultDoc={defaultDoc}
      catalogDefaults={catalogDefaults}
      initialMetadata={initialMetadata}
      playbookSettings={playbookSettings}
    />
  );
}
