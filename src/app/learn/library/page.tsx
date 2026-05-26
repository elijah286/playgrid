import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import { FORMATIONS } from "@/domain/football-kg/defs/formations";
import { ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import { DEFENSIVE_ALIGNMENTS } from "@/domain/play/defensiveAlignments";
import { generateConceptSkeleton } from "@/domain/play/conceptSkeleton";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";
import { coachDiagramToPlayDocument } from "@/features/coach-ai/coachDiagramConverter";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { featuredConceptOfTheDay } from "@/lib/learn/featured";
import { toLearnSlug } from "@/lib/learn/links";
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

export const metadata: Metadata = {
  title: "Football library · Learning Center · XO Gridmaker",
  description:
    "A free, browsable library of football concepts — plays, formations, routes, and defensive schemes. Each concept renders in the canonical play editor with coaching breakdowns.",
  alternates: { canonical: "/learn/library" },
  openGraph: {
    title: "Football library · XO Gridmaker",
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

// Unique (front, coverage) defensive schemes — same grouping as the
// /defense category page, but inline so we don't pay an import cost.
// Optionally filters to a specific variant (matching the
// defense/page.tsx grouping logic).
function uniqueDefenseNames(variant?: LibraryVariant): string[] {
  const slugs = new Map<string, Set<string>>();
  for (const a of DEFENSIVE_ALIGNMENTS) {
    const front = (a.front ?? "").trim();
    const coverage = (a.coverage ?? "").trim();
    const name =
      !front || front.toLowerCase() === coverage.toLowerCase()
        ? coverage
        : `${front} ${coverage}`.trim();
    if (!slugs.has(name)) slugs.set(name, new Set<string>());
    slugs.get(name)!.add(a.variant);
  }
  const out: string[] = [];
  for (const [name, variants] of slugs) {
    if (!variant || variants.has(variant)) out.push(name);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

type Category = {
  slug: string;
  icon: string;
  title: string;
  items: string[];
  count: number;
  countNoun: string;
};

export default async function LibraryLandingPage(
  { searchParams }: { searchParams: Promise<{ v?: string }> },
) {
  if (!(await isFootballLibraryAvailable())) notFound();
  const { v } = await searchParams;
  // Active variant from URL — drives the featured concept, the
  // thumbnail render, and the items shown in each category card.
  // Without this, the landing page sat outside the variant filter:
  // the VariantPill changed `?v=` but nothing on this page consumed
  // it, so coaches saw the same featured concept + same teaser items
  // regardless of which variant they picked.
  const variant: LibraryVariant =
    (v ? slugToVariant(v) : null) ?? DEFAULT_LIBRARY_VARIANT;
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

  // Empty categories (drills, practice plans, coaching articles,
  // glossary) are hidden until they have content. Per user feedback —
  // "Coming soon" cards felt cluttered when the categories truly had no
  // data yet. They'll come back when their catalogs are seeded.
  //
  // Items + count are variant-scoped (matching what the category index
  // pages show) so the landing card is consistent with what the coach
  // sees after clicking through. Routes are variant-agnostic — a Slant
  // is a Slant regardless of game type — so they don't filter.
  const conceptsInVariant = CONCEPTS.filter((c) =>
    (c.variants ?? []).includes(variant),
  );
  const formationsInVariant = FORMATIONS.filter((f) =>
    (f.variants ?? []).includes(variant),
  );
  const defenseNamesInVariant = uniqueDefenseNames(variant);
  const CATEGORIES: Category[] = [
    {
      slug: "plays",
      icon: "▶",
      title: "Plays",
      items: conceptsInVariant.slice(0, 4).map((c) => c.name),
      count: conceptsInVariant.length,
      countNoun: "concepts",
    },
    {
      slug: "formations",
      icon: "▢",
      title: "Formations",
      items: formationsInVariant.slice(0, 4).map((f) => f.name),
      count: formationsInVariant.length,
      countNoun: "sets",
    },
    {
      slug: "routes",
      icon: "↗",
      title: "Routes",
      items: ROUTE_TEMPLATES.slice(0, 4).map((r) => r.name),
      count: ROUTE_TEMPLATES.length,
      countNoun: "templates",
    },
    {
      slug: "defense",
      icon: "🛡",
      title: "Defense",
      items: defenseNamesInVariant.slice(0, 4),
      count: defenseNamesInVariant.length,
      countNoun: "schemes",
    },
  ];

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
          A free, browsable library of football concepts. Each play renders in
          the same canonical editor that powers the in-app play designer —
          same diagrams, same coaching cues, same depth.
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
            {featured.description} Renders live in the canonical play editor
            with coaching cues, when-to-call guidance, and common mistakes to
            avoid.
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

      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Browse the library
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CATEGORIES.map((cat) => {
          // Routes are variant-agnostic; everything else is filtered
          // to the active variant. The category landing page reads
          // the same `?v=` so navigation lands on a consistent view.
          const href =
            cat.slug === "routes"
              ? `/learn/library/${cat.slug}`
              : `/learn/library/${cat.slug}?v=${variantSlug}`;
          return (
            <Link key={cat.slug} href={href} className="group">
              <div className="flex h-full flex-col rounded-2xl border border-border bg-surface-raised p-5 transition-shadow group-hover:border-primary-light group-hover:shadow-md">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light text-base text-primary">
                  {cat.icon}
                </div>
                <h3 className="mb-3 text-base font-semibold text-foreground">
                  {cat.title}
                </h3>
                <ul className="space-y-1.5 text-xs text-muted">
                  {cat.items.map((item) => (
                    <li
                      key={item}
                      className="before:mr-1.5 before:text-primary before:content-['→']"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
                {/* Count sits in the card footer — coaches read this
                  * as "there are more beyond what you see." The arrow
                  * mirrors the per-item arrow so it reads as a
                  * sibling "view all" affordance. */}
                <p className="mt-auto pt-3 text-xs font-semibold text-muted transition-colors group-hover:text-primary">
                  <span className="inline-flex items-center gap-1">
                    {cat.count} {cat.countNoun}
                    <ArrowRight className="size-3" />
                  </span>
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
