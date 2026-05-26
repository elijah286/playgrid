// Variant ↔ URL slug round-trip + default-variant resolution for
// /learn/library/[category]/[slug]/[variant] URLs.
//
// SLUG SHAPE: internal IDs with the underscore swapped for a hyphen so
// they read cleanly in URLs.
//   flag_5v5  ↔ flag-5v5
//   flag_6v6  ↔ flag-6v6
//   flag_7v7  ↔ flag-7v7
//   tackle_11 ↔ tackle-11
//
// Touch and the "other" sentinel aren't user-facing on library pages
// (no concept routes use them), so they don't get slugs.

import type { ConceptDef } from "@/domain/football-kg/schemas/ConceptDef";

export type LibraryVariant =
  | "flag_5v5"
  | "flag_6v6"
  | "flag_7v7"
  | "tackle_11";

const VARIANT_TO_SLUG: Record<LibraryVariant, string> = {
  flag_5v5: "flag-5v5",
  flag_6v6: "flag-6v6",
  flag_7v7: "flag-7v7",
  tackle_11: "tackle-11",
};

const SLUG_TO_VARIANT: Record<string, LibraryVariant> = Object.fromEntries(
  Object.entries(VARIANT_TO_SLUG).map(([v, s]) => [s, v as LibraryVariant]),
);

export const LIBRARY_VARIANTS: ReadonlyArray<LibraryVariant> = [
  "flag_5v5",
  "flag_6v6",
  "flag_7v7",
  "tackle_11",
];

export const VARIANT_LABEL: Record<LibraryVariant, string> = {
  flag_5v5: "5v5 Flag",
  flag_6v6: "6v6 Flag",
  flag_7v7: "7v7 Flag",
  tackle_11: "11v11 Tackle",
};

export function variantToSlug(v: LibraryVariant): string {
  return VARIANT_TO_SLUG[v];
}

/** Returns null for invalid input — let callers decide between 404 and
 *  graceful fallback. */
export function slugToVariant(slug: string): LibraryVariant | null {
  return SLUG_TO_VARIANT[slug] ?? null;
}

/** Default variant when a coach lands on `/plays/mesh` (no variant in
 *  URL). Prefer 5v5 Flag — the highest-volume search target. Falls
 *  through to whatever the concept actually supports. */
export function defaultVariantForConcept(
  supportedVariants: ReadonlyArray<string>,
): LibraryVariant | null {
  const supported = new Set(supportedVariants);
  const ranked: LibraryVariant[] = [
    "flag_5v5",
    "flag_7v7",
    "flag_6v6",
    "tackle_11",
  ];
  for (const v of ranked) {
    if (supported.has(v)) return v;
  }
  return null;
}

/** Convenience: takes a ConceptDef and returns the default variant. */
export function defaultVariantForConceptDef(
  concept: ConceptDef,
): LibraryVariant | null {
  return defaultVariantForConcept(concept.variants ?? []);
}

/** True if the concept supports this variant. */
export function conceptSupportsVariant(
  supportedVariants: ReadonlyArray<string>,
  variant: LibraryVariant,
): boolean {
  return supportedVariants.includes(variant);
}
