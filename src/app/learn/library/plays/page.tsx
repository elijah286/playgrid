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
import { DEFAULT_LIBRARY_VARIANT } from "@/lib/learn/variant";
import { getLibraryVariantCookie } from "@/lib/learn/variant-preference";
import { CategoryNav } from "../CategoryNav";
import { VariantPill } from "../VariantPill";
import { LibraryConversionCta } from "../_components/LibraryConversionCta";

// Canonical for this page points at the corresponding variant rollup
// (/learn/library/plays/variant/{slug}). The rollup has the indexable
// per-variant H1 + metadata Google ranks for "5v5 flag football plays"
// queries; this page is the coach-facing browsing UX (cookie-persisted
// variant + variant pill) but should never compete with the rollup for
// search ranking. Two URLs, one ranking signal.
export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ v?: string }> },
): Promise<Metadata> {
  const { v } = await searchParams;
  const variantFromUrl = v ? slugToVariant(v) : null;
  const variantFromCookie = await getLibraryVariantCookie();
  const variant: LibraryVariant =
    variantFromUrl ?? variantFromCookie ?? DEFAULT_LIBRARY_VARIANT;
  const canonical = `/learn/library/plays/variant/${variantToSlug(variant)}`;
  return {
    title: "Plays · Football library",
    description:
      "Every football play concept in the XO Gridmaker library — pass, run, RPO, and trick plays. Each opens to a real diagram rendered by the canonical play editor.",
    alternates: { canonical },
  };
}

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "/" },
    { "@type": "ListItem", position: 2, name: "Football library", item: "/learn/library" },
    { "@type": "ListItem", position: 3, name: "Plays", item: "/learn/library/plays" },
  ],
};

const COMPLEXITY_TONE: Record<string, string> = {
  basic: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  intermediate: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  advanced: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

export default async function PlaysIndexPage(
  { searchParams }: { searchParams: Promise<{ v?: string }> },
) {
  if (!(await isFootballLibraryAvailable())) notFound();
  const { v } = await searchParams;
  // Variant resolution order:
  //   1. `?v=` URL param (explicit, wins)
  //   2. `xo_library_variant` cookie (coach's saved preference)
  //   3. flag_5v5 (highest-volume default)
  // The cookie is what makes "switch to 7v7 on a play page, then
  // browse to a different play" land on 7v7 — without it, every page
  // without `?v=` snapped back to flag_5v5.
  const variantFromUrl = v ? slugToVariant(v) : null;
  const variantFromCookie = await getLibraryVariantCookie();
  const variant: LibraryVariant =
    variantFromUrl ?? variantFromCookie ?? DEFAULT_LIBRARY_VARIANT;
  const variantSlug = variantToSlug(variant);

  // Group concepts by complexity so basic plays surface first — coaches
  // browsing the catalog usually want install-friendly stuff before deep
  // cuts.
  const allConcepts = [...CONCEPTS].sort((a, b) => {
    const order = { basic: 0, intermediate: 1, advanced: 2 } as const;
    const ai = order[a.complexity as keyof typeof order] ?? 1;
    const bi = order[b.complexity as keyof typeof order] ?? 1;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });
  // Filter to concepts supported in the current variant.
  const concepts = allConcepts.filter((c) =>
    (c.variants ?? []).includes(variant),
  );
  const hiddenCount = allConcepts.length - concepts.length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(withFullContext(breadcrumbLd)) }}
      />

      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Football library
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Plays</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Every play concept available for {VARIANT_LABEL[variant]}. Each
          page opens the play in the XO editor — the same diagram a coach
          would see in the builder. Sign in to drop a concept into one of
          your playbooks.
        </p>
      </header>

      <CategoryNav />

      <div className="mb-6">
        <VariantPill />
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

      <LibraryConversionCta surface="library-plays-index" />

      <p className="mt-10 text-xs text-muted">
        {concepts.length} concepts in {VARIANT_LABEL[variant]}
        {hiddenCount > 0
          ? ` (${hiddenCount} more available in other variants — switch the variant filter above)`
          : ""}
        . Library content is in active development — concept pages will gain
        &ldquo;when to call it&rdquo; and &ldquo;common mistakes&rdquo; prose
        in upcoming releases.
      </p>

      <p className="mt-3 text-xs text-muted">
        Browse by variant:{" "}
        {LIBRARY_VARIANTS.map((vv, i, arr) => (
          <span key={vv}>
            <Link
              href={`/learn/library/plays/variant/${variantToSlug(vv)}`}
              className="text-primary hover:underline"
            >
              {VARIANT_LABEL[vv]} plays
            </Link>
            {i < arr.length - 1 ? ", " : ""}
          </span>
        ))}
        .
      </p>
    </div>
  );
}
