// /learn/library/plays/[slug] (no variant) → 307 redirect to the
// concept's default variant. Variant-specific pages live at
// /learn/library/plays/[slug]/[variant]/.

import { notFound, redirect } from "next/navigation";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import type { ConceptDef } from "@/domain/football-kg/schemas/ConceptDef";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { toLearnSlug } from "@/lib/learn/links";
import {
  defaultVariantForConceptDef,
  variantToSlug,
} from "@/lib/learn/variant";

export const dynamicParams = false;
export const revalidate = 3600;

export function generateStaticParams() {
  return CONCEPTS.map((c) => ({ slug: toLearnSlug(c.name) }));
}

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
  const variant = defaultVariantForConceptDef(concept);
  if (!variant) notFound();
  redirect(`/learn/library/plays/${slug}/${variantToSlug(variant)}`);
}
