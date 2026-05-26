import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DEFENSIVE_ALIGNMENTS } from "@/domain/play/defensiveAlignments";
import type { DefensiveAlignment } from "@/domain/play/defensiveAlignments";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { toLearnSlug } from "@/lib/learn/links";
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

const VARIANT_LABEL: Record<string, string> = {
  flag_5v5: "5v5 Flag",
  flag_6v6: "6v6 Flag",
  flag_7v7: "7v7 Flag",
  tackle_11: "11v11 Tackle",
};

export default async function DefenseIndexPage() {
  if (!(await isFootballLibraryAvailable())) notFound();

  // Same grouping logic as the slug page — one entry per unique
  // (front, coverage) pair, with variants rolled up as chips.
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
  const sorted = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <CategoryIndex
      category="defense"
      title="Defenses"
      description="Defensive schemes coaches call by name — the front + coverage pairs that show up on Friday night and Saturday morning. Each links to the scheme's breakdown plus the variants it's defined for."
      entities={sorted.map((g) => ({
        name: g.name,
        slug: g.slug,
        description: g.description,
        chips: [
          g.manCoverage ? "man coverage" : "zone coverage",
          ...g.variants.map((v) => VARIANT_LABEL[v] ?? v),
        ],
      }))}
      note={`${sorted.length} unique defensive schemes across all variants. Defender + zone diagrams render in an upcoming release.`}
    />
  );
}
