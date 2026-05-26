import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DEFENSIVE_ALIGNMENTS } from "@/domain/play/defensiveAlignments";
import type { DefensiveAlignment } from "@/domain/play/defensiveAlignments";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { toLearnSlug } from "@/lib/learn/links";
import { LibraryEntityPage } from "../../_LibraryEntityPage";

export const dynamicParams = false;
export const revalidate = 3600;

const VARIANT_LABEL: Record<string, string> = {
  flag_5v5: "5v5 Flag",
  flag_6v6: "6v6 Flag",
  flag_7v7: "7v7 Flag",
  tackle_11: "11v11 Tackle",
};

/** Defenses are keyed by (front, coverage, variant) in the catalog, but
 *  the library presents one page per unique (front, coverage) pair —
 *  variant differences become "Available variants" rows. */
function defenseDisplayName(a: DefensiveAlignment): string {
  const front = (a.front ?? "").trim();
  const coverage = (a.coverage ?? "").trim();
  if (!front || front.toLowerCase() === coverage.toLowerCase()) return coverage;
  return `${front} ${coverage}`.trim();
}

type DefenseGroup = {
  name: string;
  slug: string;
  description: string;
  variants: string[];
  manCoverage: boolean;
  aliases: string[];
};

function groupDefenses(): DefenseGroup[] {
  const bySlug = new Map<string, DefenseGroup>();
  for (const a of DEFENSIVE_ALIGNMENTS) {
    const name = defenseDisplayName(a);
    const slug = toLearnSlug(name);
    const existing = bySlug.get(slug);
    if (existing) {
      if (!existing.variants.includes(a.variant)) existing.variants.push(a.variant);
    } else {
      bySlug.set(slug, {
        name,
        slug,
        description: a.description,
        variants: [a.variant],
        manCoverage: a.manCoverage ?? false,
        aliases: [],
      });
    }
  }
  return Array.from(bySlug.values());
}

export function generateStaticParams() {
  return groupDefenses().map(({ slug }) => ({ slug }));
}

function findGroupBySlug(slug: string): DefenseGroup | null {
  return groupDefenses().find((g) => g.slug === slug) ?? null;
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const group = findGroupBySlug(slug);
  if (!group) return { title: "Defense not found · XO Gridmaker" };
  return {
    title: `${group.name} defense · Football Library · XO Gridmaker`,
    description: group.description,
    alternates: { canonical: `/learn/library/defense/${slug}` },
    openGraph: {
      title: `${group.name} — football defensive scheme`,
      description: group.description,
      url: `/learn/library/defense/${slug}`,
      type: "article",
    },
  };
}

export default async function DefensePage(
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await isFootballLibraryAvailable())) notFound();
  const { slug } = await params;
  const group = findGroupBySlug(slug);
  if (!group) notFound();

  const related = groupDefenses()
    .filter((g) => g.slug !== group.slug)
    .slice(0, 6)
    .map((g) => ({ name: g.name, slug: g.slug }));

  const tags: string[] = [];
  if (group.manCoverage) tags.push("man coverage");
  else tags.push("zone coverage");

  return (
    <LibraryEntityPage
      category="defense"
      categoryLabel="Defense"
      name={group.name}
      slug={slug}
      description={group.description}
      tags={tags}
      variants={group.variants}
      variantLabels={VARIANT_LABEL}
      related={related}
    />
  );
}
