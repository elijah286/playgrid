import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FORMATIONS } from "@/domain/football-kg/defs/formations";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import type { FormationDef } from "@/domain/football-kg/schemas/FormationDef";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { toLearnSlug } from "@/lib/learn/links";
import { LibraryEntityPage } from "../../_LibraryEntityPage";

export const dynamicParams = false;
export const revalidate = 3600;

export function generateStaticParams() {
  return FORMATIONS.map((f) => ({ slug: toLearnSlug(f.name) }));
}

function findFormationBySlug(slug: string): FormationDef | null {
  return FORMATIONS.find((f) => toLearnSlug(f.name) === slug) ?? null;
}

const VARIANT_LABEL: Record<string, string> = {
  flag_4v4: "4v4 Flag",
  flag_5v5: "5v5 Flag",
  flag_6v6: "6v6 Flag",
  flag_7v7: "7v7 Flag",
  touch_7v7: "7v7 Touch",
  tackle_11: "11v11 Tackle",
};

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const formation = findFormationBySlug(slug);
  if (!formation) return { title: "Formation not found · XO Gridmaker" };
  return {
    title: `${formation.name} formation · Football Library · XO Gridmaker`,
    description: formation.description,
    alternates: { canonical: `/learn/library/formations/${slug}` },
    openGraph: {
      title: `${formation.name} — football formation`,
      description: formation.description,
      url: `/learn/library/formations/${slug}`,
      type: "article",
    },
  };
}

export default async function FormationPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await isFootballLibraryAvailable())) notFound();
  const { slug } = await params;
  const formation = findFormationBySlug(slug);
  if (!formation) notFound();

  // Cross-reference: which concepts use this formation as their default?
  const usedBy = CONCEPTS.filter((c) => c.defaultFormation.id === formation.id).map(
    (c) => c.name,
  );
  const usedByLine =
    usedBy.length > 0
      ? `${usedBy.slice(0, 6).join(", ")}${usedBy.length > 6 ? `, +${usedBy.length - 6} more` : ""}`
      : undefined;

  // Related formations: same tag overlap.
  const myTags = new Set(formation.tags ?? []);
  const related = FORMATIONS.filter(
    (f) => f.id !== formation.id && (f.tags ?? []).some((t) => myTags.has(t)),
  )
    .slice(0, 6)
    .map((f) => ({ name: f.name, slug: toLearnSlug(f.name) }));

  return (
    <LibraryEntityPage
      category="formations"
      categoryLabel="Formation"
      name={formation.name}
      slug={slug}
      aliases={formation.aliases ?? []}
      description={formation.description}
      body={formation.body}
      tags={formation.tags ?? []}
      complexity={formation.complexity ?? null}
      variants={[...(formation.variants ?? [])]}
      variantLabels={VARIANT_LABEL}
      related={related}
      usedByLine={usedByLine}
    />
  );
}
