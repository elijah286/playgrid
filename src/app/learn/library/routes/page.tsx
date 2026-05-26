import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { toLearnSlug } from "@/lib/learn/links";
import {
  VARIANT_LABEL,
  slugToVariant,
  variantToSlug,
  type LibraryVariant,
} from "@/lib/learn/variant";
import { DEFAULT_LIBRARY_VARIANT } from "../VariantPill";
import { CategoryIndex } from "../_CategoryIndex";

export const metadata: Metadata = {
  title: "Routes · Football library · XO Gridmaker",
  description:
    "Every route template in the XO Gridmaker library — slants, posts, hitches, wheels, corners, and more. The building blocks of every passing play.",
  alternates: { canonical: "/learn/library/routes" },
};

export default async function RoutesIndexPage(
  { searchParams }: { searchParams: Promise<{ v?: string }> },
) {
  if (!(await isFootballLibraryAvailable())) notFound();
  const { v } = await searchParams;
  const variant: LibraryVariant =
    (v ? slugToVariant(v) : null) ?? DEFAULT_LIBRARY_VARIANT;
  const variantSlug = variantToSlug(variant);

  // Routes apply to ALL_VARIANTS in the catalog (a Slant is a
  // Slant regardless of variant), so unlike plays/formations/
  // defenses there's no per-variant filter here. The variant
  // still flows through to the detail page so the rendered demo
  // shows the route in the coach's current variant.
  const sorted = [...ROUTE_TEMPLATES].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <CategoryIndex
      category="routes"
      title="Routes"
      description={`Receiver route templates rendered for ${VARIANT_LABEL[variant]}. Each route links to its coaching cues, common depth, and the play concepts that use it.`}
      entities={sorted.map((r) => ({
        name: r.name,
        slug: `${toLearnSlug(r.name)}?v=${variantSlug}`,
        description: r.description ?? `${r.name} — route template.`,
      }))}
      note={`${sorted.length} routes in the catalog. Each renders a live demo on the detail page.`}
    />
  );
}
