import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import { FORMATIONS } from "@/domain/football-kg/defs/formations";
import { ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import { DEFENSIVE_ALIGNMENTS } from "@/domain/play/defensiveAlignments";
import type { DefensiveAlignment } from "@/domain/play/defensiveAlignments";
import { generateConceptSkeleton } from "@/domain/play/conceptSkeleton";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";
import { coachDiagramToPlayDocument } from "@/features/coach-ai/coachDiagramConverter";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { featuredConceptOfTheDay } from "@/lib/learn/featured";
import { toLearnSlug } from "@/lib/learn/links";
import { getLibraryVariantCookie } from "@/lib/learn/variant-preference";
import {
  DEFAULT_LIBRARY_VARIANT,
  conceptSupportsVariant,
  defaultVariantForConceptDef,
  slugToVariant,
  variantToSlug,
  VARIANT_LABEL,
  type LibraryVariant,
} from "@/lib/learn/variant";
import { withFullContext } from "@/lib/seo/ld-json";
import { PlayThumbnail } from "@/features/editor/PlayThumbnail";
import { VariantPill } from "./VariantPill";
import { CategoryPill } from "./CategoryPill";
import { LibraryConversionCta } from "./_components/LibraryConversionCta";
import {
  DEFAULT_LIBRARY_CATEGORY,
  isLibraryCategory,
  type LibraryCategory,
} from "./categoryConstants";

export const metadata: Metadata = {
  title: "Football library · Learning Center",
  description:
    "A free, browsable library of football concepts — plays, formations, routes, and defensive schemes. Each concept opens in the XO play editor with coaching breakdowns.",
  alternates: { canonical: "/learn/library" },
  openGraph: {
    title: "Football library",
    description:
      "A free, browsable library of football concepts — plays, formations, routes, and defensive schemes.",
    url: "/learn/library",
    type: "website",
  },
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "/" },
    { "@type": "ListItem", position: 2, name: "Football library", item: "/learn/library" },
  ],
};

/** Group raw defensive alignments by (front, coverage) into unique
 *  schemes — the same grouping the /defense category index uses. */
function defenseDisplayName(a: DefensiveAlignment): string {
  const front = (a.front ?? "").trim();
  const coverage = (a.coverage ?? "").trim();
  if (!front || front.toLowerCase() === coverage.toLowerCase()) return coverage;
  return `${front} ${coverage}`.trim();
}

type GroupedDefense = {
  name: string;
  slug: string;
  description: string;
  variants: string[];
  manCoverage: boolean;
};

function groupDefenses(): GroupedDefense[] {
  const groups = new Map<string, GroupedDefense>();
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
  return Array.from(groups.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

const COMPLEXITY_TONE: Record<string, string> = {
  basic: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  intermediate: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  advanced: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

const COMPLEXITY_ORDER = { basic: 0, intermediate: 1, advanced: 2 } as const;

/** One card row in the unified grid — the four categories all map
 *  their entities into this shape. */
type LibraryCard = {
  key: string;
  name: string;
  description: string;
  href: string;
  chips: Array<{ label: string; tone?: string }>;
};

export default async function LibraryLandingPage(
  { searchParams }: { searchParams: Promise<{ v?: string; cat?: string }> },
) {
  if (!(await isFootballLibraryAvailable())) notFound();
  const { v, cat } = await searchParams;
  const activeCategory: LibraryCategory = isLibraryCategory(cat)
    ? cat
    : DEFAULT_LIBRARY_CATEGORY;
  // Active variant from URL — drives the featured concept, the
  // thumbnail render, and the items shown in each category card.
  // Without this, the landing page sat outside the variant filter:
  // the VariantPill changed `?v=` but nothing on this page consumed
  // it, so coaches saw the same featured concept + same teaser items
  // regardless of which variant they picked.
  const variantFromUrl = v ? slugToVariant(v) : null;
  const variantFromCookie = await getLibraryVariantCookie();
  const variant: LibraryVariant =
    variantFromUrl ?? variantFromCookie ?? DEFAULT_LIBRARY_VARIANT;
  const variantSlug = variantToSlug(variant);

  const featured = featuredConceptOfTheDay(new Date(), variant);
  const featuredSlug = toLearnSlug(featured.name);
  // Prefer the active variant for both the link and the thumbnail
  // when the concept supports it — so the featured card matches what
  // the coach selected. Falls back to the concept's default variant
  // when the active one isn't supported (defensive; the featured
  // pool is already variant-filtered, but a future call site that
  // skips filtering would land here).
  const featuredVariant: LibraryVariant | null = conceptSupportsVariant(
    featured.variants ?? [],
    variant,
  )
    ? variant
    : defaultVariantForConceptDef(featured);
  const featuredHref = featuredVariant
    ? `/learn/library/plays/${featuredSlug}/${variantToSlug(featuredVariant)}`
    : `/learn/library/plays/${featuredSlug}`;

  // Real thumbnail for the featured concept card (previously a
  // placeholder "play diagram preview" tile). We pre-render the
  // concept's PlaySpec → CoachDiagram → PlayDocument chain server-
  // side and pass the layer data to `<PlayThumbnail>` (static SVG,
  // no client JS). Falls back to null when the concept has no
  // skeleton builder yet — the placeholder div still renders.
  let featuredThumbnail: {
    players: import("@/domain/play/types").Player[];
    routes: import("@/domain/play/types").Route[];
    zones?: import("@/domain/play/types").Zone[];
    lineOfScrimmageY: number;
  } | null = null;
  if (featuredVariant) {
    try {
      const skeleton = generateConceptSkeleton(featured.name, {
        variant: featuredVariant,
        strength: "right",
      });
      if (skeleton.ok) {
        const { diagram } = playSpecToCoachDiagram(skeleton.spec);
        const doc = coachDiagramToPlayDocument(diagram);
        featuredThumbnail = {
          players: doc.layers.players,
          routes: doc.layers.routes,
          zones: doc.layers.zones,
          lineOfScrimmageY: doc.lineOfScrimmageY ?? 0.5,
        };
      }
    } catch {
      // Render the placeholder.
    }
  }

  // Build cards for the active category. The four categories all
  // collapse into a uniform `LibraryCard[]` so the grid below stays
  // a single chunk of markup. Routes are variant-agnostic; everything
  // else is variant-filtered.
  let cards: LibraryCard[] = [];
  let activeNote = "";
  if (activeCategory === "plays") {
    const sorted = [...CONCEPTS]
      .sort((a, b) => {
        const ai = COMPLEXITY_ORDER[a.complexity as keyof typeof COMPLEXITY_ORDER] ?? 1;
        const bi = COMPLEXITY_ORDER[b.complexity as keyof typeof COMPLEXITY_ORDER] ?? 1;
        return ai !== bi ? ai - bi : a.name.localeCompare(b.name);
      })
      .filter((c) => (c.variants ?? []).includes(variant));
    cards = sorted.map((c) => ({
      key: c.id,
      name: c.name,
      description: c.description,
      href: `/learn/library/plays/${toLearnSlug(c.name)}/${variantSlug}`,
      chips: c.complexity
        ? [
            {
              label: c.complexity,
              tone:
                COMPLEXITY_TONE[c.complexity] ??
                "bg-surface-inset text-muted",
            },
          ]
        : [],
    }));
    activeNote = `${cards.length} ${cards.length === 1 ? "concept" : "concepts"} in ${VARIANT_LABEL[variant]}`;
  } else if (activeCategory === "formations") {
    const sorted = [...FORMATIONS]
      .sort((a, b) => {
        const ai = COMPLEXITY_ORDER[a.complexity as keyof typeof COMPLEXITY_ORDER] ?? 1;
        const bi = COMPLEXITY_ORDER[b.complexity as keyof typeof COMPLEXITY_ORDER] ?? 1;
        return ai !== bi ? ai - bi : a.name.localeCompare(b.name);
      })
      .filter((f) => (f.variants ?? []).includes(variant));
    cards = sorted.map((f) => ({
      key: f.id,
      name: f.name,
      description: f.description,
      href: `/learn/library/formations/${toLearnSlug(f.name)}?v=${variantSlug}`,
      chips: [
        ...(f.complexity
          ? [
              {
                label: f.complexity,
                tone:
                  COMPLEXITY_TONE[f.complexity] ??
                  "bg-surface-inset text-muted",
              },
            ]
          : []),
        ...((f.tags ?? []).slice(0, 2).map((t) => ({ label: t }))),
      ],
    }));
    activeNote = `${cards.length} ${cards.length === 1 ? "formation" : "formations"} in ${VARIANT_LABEL[variant]}`;
  } else if (activeCategory === "defenses") {
    const grouped = groupDefenses().filter((g) => g.variants.includes(variant));
    cards = grouped.map((g) => ({
      key: g.slug,
      name: g.name,
      description: g.description,
      href: `/learn/library/defense/${g.slug}?v=${variantSlug}`,
      chips: [{ label: g.manCoverage ? "man coverage" : "zone coverage" }],
    }));
    activeNote = `${cards.length} ${cards.length === 1 ? "scheme" : "schemes"} in ${VARIANT_LABEL[variant]}`;
  } else if (activeCategory === "routes") {
    cards = ROUTE_TEMPLATES.map((r) => ({
      key: r.name,
      name: r.name,
      description: r.description ?? "",
      href: `/learn/library/routes/${toLearnSlug(r.name)}`,
      chips: [],
    }));
    activeNote = `${cards.length} route ${cards.length === 1 ? "template" : "templates"} (variant-agnostic — same routes across game types)`;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(withFullContext(breadcrumbLd)) }}
      />

      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Resources
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
          Football library
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          A free, browsable library of football concepts. Each play opens in
          the same editor coaches use to build their playbooks — same
          diagrams, same coaching cues, same depth.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <VariantPill />
      </div>

      <section className="mb-8 grid grid-cols-1 items-center gap-6 rounded-2xl border border-primary-light bg-gradient-to-br from-primary/[0.05] to-emerald-400/[0.05] p-6 md:grid-cols-[1fr_auto]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Featured concept · today
          </p>
          <h2 className="mt-1.5 text-xl font-extrabold tracking-tight">
            {featured.name}
          </h2>
          <p className="mt-1.5 max-w-xl text-sm text-muted">
            {featured.description} Opens in the XO play editor with coaching
            cues, when-to-call guidance, and common mistakes to avoid.
          </p>
          <Link
            href={featuredHref}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            Open {featured.name} ({VARIANT_LABEL[variant]})
            <ArrowRight className="size-4" />
          </Link>
        </div>
        {featuredThumbnail ? (
          <div
            aria-hidden
            className="hidden h-32 w-48 overflow-hidden rounded-xl border border-border bg-surface-raised shadow-sm md:block"
          >
            <PlayThumbnail preview={featuredThumbnail} light />
          </div>
        ) : (
          <div
            aria-hidden
            className="hidden h-24 w-44 items-center justify-center rounded-xl bg-gradient-to-b from-[#2D8B4E] to-[#1B5E30] text-xs italic text-white/70 md:flex"
          >
            play diagram preview
          </div>
        )}
      </section>

      {/* Category selector — left-aligned and prominent so coaches don't
          miss it. Stacks with the variant pill above (same alignment,
          same pill family) so the two filters read as a pair. The old
          "Browse the library" label is dropped — the pill itself names
          what's being browsed. */}
      <div className="mb-5">
        <CategoryPill />
      </div>

      {cards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-surface-inset p-8 text-center text-sm text-muted">
          No {activeCategory} in {VARIANT_LABEL[variant]} yet. Try a different
          variant above.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={card.key}>
              <Link
                href={card.href}
                className="group block h-full rounded-2xl border border-border bg-surface-raised p-5 transition-all hover:-translate-y-0.5 hover:border-primary-light hover:shadow-md"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
                    {card.name}
                  </h3>
                  <ArrowRight className="mt-1 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <p className="line-clamp-3 text-sm leading-relaxed text-muted">
                  {card.description}
                </p>
                {card.chips.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {card.chips.map((c) => (
                      <span
                        key={c.label}
                        className={
                          c.tone
                            ? `rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.tone}`
                            : "rounded-full bg-surface-inset px-2 py-0.5 text-[10px] font-medium text-muted"
                        }
                      >
                        {c.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {activeNote ? (
        <p className="mt-8 text-xs text-muted">{activeNote}</p>
      ) : null}

      <LibraryConversionCta surface="library-hub" />
    </div>
  );
}
