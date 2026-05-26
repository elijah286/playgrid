import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FORMATIONS } from "@/domain/football-kg/defs/formations";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { toLearnSlug } from "@/lib/learn/links";
import {
  VARIANT_LABEL,
  slugToVariant,
  variantToSlug,
  type LibraryVariant,
} from "@/lib/learn/variant";
import { DEFAULT_LIBRARY_VARIANT } from "@/lib/learn/variant";
import { getLibraryVariantCookie } from "@/lib/learn/variant-preference";
import { CategoryIndex } from "../_CategoryIndex";

export const metadata: Metadata = {
  title: "Formations · Football library · XO Gridmaker",
  description:
    "Every named offensive formation in the XO Gridmaker library — Trips, Spread, Bunch, Empty, Pro-I, and more. Each opens to a full coaching breakdown.",
  alternates: { canonical: "/learn/library/formations" },
};

export default async function FormationsIndexPage(
  { searchParams }: { searchParams: Promise<{ v?: string }> },
) {
  if (!(await isFootballLibraryAvailable())) notFound();
  const { v } = await searchParams;
  const variantFromCookie = await getLibraryVariantCookie();
  const variant: LibraryVariant =
    (v ? slugToVariant(v) : null) ?? variantFromCookie ?? DEFAULT_LIBRARY_VARIANT;
  const variantSlug = variantToSlug(variant);

  const allFormations = [...FORMATIONS].sort((a, b) => {
    const order = { basic: 0, intermediate: 1, advanced: 2 } as const;
    const ai = order[a.complexity as keyof typeof order] ?? 1;
    const bi = order[b.complexity as keyof typeof order] ?? 1;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });
  // Filter to formations supported in the current variant. A
  // formation may declare {tackle_11, flag_5v5, ...} in its
  // `variants` field; we keep only the ones that match.
  const sorted = allFormations.filter((f) =>
    (f.variants ?? []).includes(variant),
  );
  const hiddenCount = allFormations.length - sorted.length;

  return (
    <CategoryIndex
      category="formations"
      title="Formations"
      description={`Named offensive sets in ${VARIANT_LABEL[variant]} — the personnel + alignment a play starts from. Each formation links to its coaching breakdown, supported variants, and the plays that use it.`}
      entities={sorted.map((f) => ({
        name: f.name,
        slug: `${toLearnSlug(f.name)}?v=${variantSlug}`,
        description: f.description,
        chips: [
          ...(f.complexity ? [f.complexity] : []),
          ...(f.tags ?? []).slice(0, 2),
        ],
      }))}
      note={
        hiddenCount > 0
          ? `${sorted.length} formations in ${VARIANT_LABEL[variant]} (${hiddenCount} more available in other variants — switch the variant filter above).`
          : `${sorted.length} formations in ${VARIANT_LABEL[variant]}.`
      }
    />
  );
}
