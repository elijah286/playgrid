import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DEFENSIVE_ALIGNMENTS } from "@/domain/play/defensiveAlignments";
import type { DefensiveAlignment } from "@/domain/play/defensiveAlignments";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { toLearnSlug } from "@/lib/learn/links";
import {
  VARIANT_LABEL,
  slugToVariant,
  variantToSlug,
  type LibraryVariant,
} from "@/lib/learn/variant";
import { DEFAULT_LIBRARY_VARIANT } from "@/lib/learn/variant";
import { CategoryIndex } from "../_CategoryIndex";

export const metadata: Metadata = {
  title: "Defenses · Football library · XO Gridmaker",
  description:
    "Every defensive scheme in the XO Gridmaker library — Cover 1, Cover 2, Cover 3, Tampa 2, Cover 0, and more. Each links to the front + coverage breakdown.",
  alternates: { canonical: "/learn/library/defense" },
};

function defenseDisplayName(a: DefensiveAlignment): string {
  const front = (a.front ?? "").trim();
  const coverage = (a.coverage ?? "").trim();
  if (!front || front.toLowerCase() === coverage.toLowerCase()) return coverage;
  return `${front} ${coverage}`.trim();
}

export default async function DefenseIndexPage(
  { searchParams }: { searchParams: Promise<{ v?: string }> },
) {
  if (!(await isFootballLibraryAvailable())) notFound();
  const { v } = await searchParams;
  const variant: LibraryVariant =
    (v ? slugToVariant(v) : null) ?? DEFAULT_LIBRARY_VARIANT;
  const variantSlug = variantToSlug(variant);

  // Same grouping logic as the slug page — one entry per unique
  // (front, coverage) pair. Filter to only show schemes supported
  // in the current variant (e.g. 3-4 fronts don't show on 5v5).
  const groups = new Map<
    string,
    { name: string; slug: string; description: string; variants: string[]; manCoverage: boolean }
  >();
  for (const a of DEFENSIVE_ALIGNMENTS) {
    const name = defenseDisplayName(a);
    const slug = toLearnSlug(name);
    const existing = groups.get(slug);
    if (existing) {
      if (!existing.variants.includes(a.variant)) existing.variants.push(a.variant);
    } else {
      groups.set(slug, {
        name,
        slug,
        description: a.description,
        variants: [a.variant],
        manCoverage: a.manCoverage ?? false,
      });
    }
  }
  const allGroups = Array.from(groups.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const sorted = allGroups.filter((g) => g.variants.includes(variant));
  const hiddenCount = allGroups.length - sorted.length;

  return (
    <CategoryIndex
      category="defense"
      title="Defenses"
      description={`Defensive schemes coaches call by name in ${VARIANT_LABEL[variant]} — the front + coverage pairs that show up on Friday night and Saturday morning. Each links to the scheme's breakdown plus the variants it's defined for.`}
      entities={sorted.map((g) => ({
        name: g.name,
        slug: `${g.slug}?v=${variantSlug}`,
        description: g.description,
        chips: [g.manCoverage ? "man coverage" : "zone coverage"],
      }))}
      note={
        hiddenCount > 0
          ? `${sorted.length} unique defensive schemes in ${VARIANT_LABEL[variant]} (${hiddenCount} more available in other variants — switch the variant filter above).`
          : `${sorted.length} unique defensive schemes in ${VARIANT_LABEL[variant]}.`
      }
    />
  );
}
