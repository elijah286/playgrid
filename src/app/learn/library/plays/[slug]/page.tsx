// /learn/library/plays/[slug] (no variant) → 307 redirect to the
// concept's default variant. Variant-specific pages live at
// /learn/library/plays/[slug]/[variant]/.

import { notFound, redirect } from "next/navigation";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import type { ConceptDef } from "@/domain/football-kg/schemas/ConceptDef";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { toLearnSlug } from "@/lib/learn/links";
import {
  conceptSupportsVariant,
  defaultVariantForConceptDef,
  variantToSlug,
} from "@/lib/learn/variant";
import { getLibraryVariantCookie } from "@/lib/learn/variant-preference";

// Reading the variant-preference cookie makes this route per-request;
// it can no longer be statically pre-built. The redirect is cheap
// (no DB, no heavy work).
export const dynamic = "force-dynamic";

function findConceptBySlug(slug: string): ConceptDef | null {
  return CONCEPTS.find((c) => toLearnSlug(c.name) === slug) ?? null;
}

export default async function PlayConceptDefaultVariantRedirect(
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await isFootballLibraryAvailable())) notFound();
  const { slug } = await params;
  const concept = findConceptBySlug(slug);
  if (!concept) notFound();

  // Coach's saved variant preference wins — when set AND supported by
  // this concept. Falls back to the catalog default (flag_5v5-first
  // ranking) when the cookie is absent or the concept doesn't support
  // the cookie's variant. This is what makes the variant choice
  // persist across plays.
  const supportedVariants = concept.variants ?? [];
  const preferred = await getLibraryVariantCookie();
  const variant =
    preferred && conceptSupportsVariant(supportedVariants, preferred)
      ? preferred
      : defaultVariantForConceptDef(concept);
  if (!variant) notFound();
  redirect(`/learn/library/plays/${slug}/${variantToSlug(variant)}`);
}
