import type { Metadata } from "next";
import { FORMATIONS } from "@/domain/football-kg/defs/formations";
import { toLearnSlug } from "@/lib/learn/links";
import { CategoryIndex } from "../_CategoryIndex";

export const metadata: Metadata = {
  title: "Formations · Football library · XO Gridmaker",
  description:
    "Every named offensive formation in the XO Gridmaker library — Trips, Spread, Bunch, Empty, Pro-I, and more. Each opens to a full coaching breakdown.",
  alternates: { canonical: "/learn/library/formations" },
};

export default function FormationsIndexPage() {
  const sorted = [...FORMATIONS].sort((a, b) => {
    const order = { basic: 0, intermediate: 1, advanced: 2 } as const;
    const ai = order[a.complexity as keyof typeof order] ?? 1;
    const bi = order[b.complexity as keyof typeof order] ?? 1;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });

  return (
    <CategoryIndex
      category="formations"
      title="Formations"
      description="Named offensive sets — the personnel + alignment a play starts from. Each formation links to its coaching breakdown, supported variants, and the plays that use it."
      entities={sorted.map((f) => ({
        name: f.name,
        slug: toLearnSlug(f.name),
        description: f.description,
        chips: [
          ...(f.complexity ? [f.complexity] : []),
          ...(f.tags ?? []).slice(0, 2),
        ],
      }))}
      note={`${sorted.length} formations in the catalog. Formation diagrams render in an upcoming release.`}
    />
  );
}
