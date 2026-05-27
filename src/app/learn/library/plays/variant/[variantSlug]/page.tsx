// SEO rollup pages: one indexable URL per variant
// (/learn/library/plays/variant/flag-5v5, /flag-6v6, /flag-7v7, /tackle-11)
// so coaches Googling "5v5 flag football plays" land on a collection page
// instead of an individual concept. The query-param filter on the main
// /learn/library/plays index is great for browsing but produces no
// distinct URL for Google to index.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { toLearnSlug } from "@/lib/learn/links";
import { withFullContext } from "@/lib/seo/ld-json";
import {
  LIBRARY_VARIANTS,
  VARIANT_LABEL,
  slugToVariant,
  variantToSlug,
  type LibraryVariant,
} from "@/lib/learn/variant";
import { CategoryNav } from "../../../CategoryNav";

export const dynamicParams = false;

export async function generateStaticParams() {
  return LIBRARY_VARIANTS.map((v) => ({ variantSlug: variantToSlug(v) }));
}

// SEO copy per variant. These are the head terms — flag 5v5/6v6/7v7 and
// tackle 11 each get their own search intent. Keep titles ≤ ~60 chars,
// descriptions ≤ ~155 chars.
const VARIANT_SEO: Record<
  LibraryVariant,
  { h1: string; title: string; description: string; intro: string }
> = {
  flag_5v5: {
    h1: "5v5 flag football plays",
    title: "5v5 flag football plays · Free playbook library · XO Gridmaker",
    description:
      "Browse a free library of 5v5 flag football plays — pass concepts, RPOs, sweeps, and trick plays. Open any play in the XO editor and drop it into your playbook.",
    intro:
      "Every 5v5 flag play in the XO Gridmaker library. Pass concepts, runs, RPOs, and trick plays — each one opens in the real play editor with coaching cues, and signed-in coaches can add it to a playbook with one click.",
  },
  flag_6v6: {
    h1: "6v6 flag football plays",
    title: "6v6 flag football plays · Free playbook library · XO Gridmaker",
    description:
      "Browse a free library of 6v6 flag football plays — pass concepts, runs, and trick plays sized for the 6-on-6 game. Open any play in the XO editor.",
    intro:
      "Every 6v6 flag play in the XO Gridmaker library. The 6-on-6 game adds a sixth receiver and an extra defender — these concepts are tuned for that spacing.",
  },
  flag_7v7: {
    h1: "7v7 flag football plays",
    title: "7v7 flag football plays · Free playbook library · XO Gridmaker",
    description:
      "Browse a free library of 7v7 flag football plays — Air Raid concepts, mesh, smash, four verticals, and more. Open any play in the XO editor.",
    intro:
      "Every 7v7 flag play in the XO Gridmaker library. The 7-on-7 game opens up the field for full route trees — Air Raid staples and pro-style concepts work cleanly here.",
  },
  tackle_11: {
    h1: "11-on-11 tackle football plays",
    title:
      "11-on-11 tackle football plays · Free playbook library · XO Gridmaker",
    description:
      "Browse a free library of 11-on-11 tackle football plays — full route concepts, RPOs, runs, and trick plays with offensive line and full defense.",
    intro:
      "Every 11-on-11 tackle play in the XO Gridmaker library. Full offensive line, full defense, full route concepts — drop any play into your tackle playbook.",
  },
};

const COMPLEXITY_TONE: Record<string, string> = {
  basic: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  intermediate: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  advanced: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

type Params = { variantSlug: string };

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { variantSlug } = await params;
  const variant = slugToVariant(variantSlug);
  if (!variant) return {};
  const seo = VARIANT_SEO[variant];
  const url = `/learn/library/plays/variant/${variantSlug}`;
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: url },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url,
      type: "website",
    },
  };
}

export default async function VariantRollupPage(
  { params }: { params: Promise<Params> },
) {
  if (!(await isFootballLibraryAvailable())) notFound();
  const { variantSlug } = await params;
  const variant = slugToVariant(variantSlug);
  if (!variant) notFound();
  const seo = VARIANT_SEO[variant];

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Football library",
        item: "/learn/library",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Plays",
        item: "/learn/library/plays",
      },
      {
        "@type": "ListItem",
        position: 4,
        name: VARIANT_LABEL[variant],
        item: `/learn/library/plays/variant/${variantSlug}`,
      },
    ],
  };

  const concepts = [...CONCEPTS]
    .filter((c) => (c.variants ?? []).includes(variant))
    .sort((a, b) => {
      const order = { basic: 0, intermediate: 1, advanced: 2 } as const;
      const ai = order[a.complexity as keyof typeof order] ?? 1;
      const bi = order[b.complexity as keyof typeof order] ?? 1;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(withFullContext(breadcrumbLd)),
        }}
      />

      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Football library · Plays
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
          {seo.h1}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">{seo.intro}</p>
      </header>

      <CategoryNav />

      <div className="mb-6 flex flex-wrap gap-2 text-xs">
        {LIBRARY_VARIANTS.map((v) => {
          const slug = variantToSlug(v);
          const active = v === variant;
          return (
            <Link
              key={v}
              href={`/learn/library/plays/variant/${slug}`}
              className={`rounded-full border px-3 py-1 font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface-raised text-muted hover:border-primary-light hover:text-foreground"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {VARIANT_LABEL[v]}
            </Link>
          );
        })}
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {concepts.map((c) => (
          <li key={c.id}>
            <Link
              href={`/learn/library/plays/${toLearnSlug(c.name)}/${variantSlug}`}
              className="group block h-full rounded-2xl border border-border bg-surface-raised p-5 transition-all hover:-translate-y-0.5 hover:border-primary-light hover:shadow-md"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
                  {c.name}
                </h3>
                <ArrowRight className="mt-1 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
              <p className="line-clamp-3 text-sm leading-relaxed text-muted">
                {c.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.complexity ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      COMPLEXITY_TONE[c.complexity] ?? "bg-surface-inset text-muted"
                    }`}
                  >
                    {c.complexity}
                  </span>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-xs text-muted">
        {concepts.length} {VARIANT_LABEL[variant]} concepts. Library content
        is in active development — concept pages will gain &ldquo;when to
        call it&rdquo; and &ldquo;common mistakes&rdquo; prose in upcoming
        releases.
      </p>
    </div>
  );
}
