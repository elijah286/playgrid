import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import { FORMATIONS } from "@/domain/football-kg/defs/formations";
import { ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import { DEFENSIVE_ALIGNMENTS } from "@/domain/play/defensiveAlignments";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { featuredConceptOfTheDay } from "@/lib/learn/featured";
import { toLearnSlug } from "@/lib/learn/links";
import { withFullContext } from "@/lib/seo/ld-json";
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
function uniqueDefenseCount(): number {
  const slugs = new Set<string>();
  for (const a of DEFENSIVE_ALIGNMENTS) {
    const front = (a.front ?? "").trim();
    const coverage = (a.coverage ?? "").trim();
    const name =
      !front || front.toLowerCase() === coverage.toLowerCase()
        ? coverage
        : `${front} ${coverage}`.trim();
    slugs.add(name);
  }
  return slugs.size;
}

type Category = {
  slug: string;
  icon: string;
  title: string;
  meta: string;
  items: string[];
};

export default async function LibraryLandingPage() {
  if (!(await isFootballLibraryAvailable())) notFound();

  const featured = featuredConceptOfTheDay();
  const featuredSlug = toLearnSlug(featured.name);

  // Empty categories (drills, practice plans, coaching articles,
  // glossary) are hidden until they have content. Per user feedback —
  // "Coming soon" cards felt cluttered when the categories truly had no
  // data yet. They'll come back when their catalogs are seeded.
  const CATEGORIES: Category[] = [
    {
      slug: "plays",
      icon: "▶",
      title: "Plays",
      meta: `${CONCEPTS.length} concepts · all variants`,
      items: CONCEPTS.slice(0, 4).map((c) => c.name),
    },
    {
      slug: "formations",
      icon: "▢",
      title: "Formations",
      meta: `${FORMATIONS.length} sets · all variants`,
      items: FORMATIONS.slice(0, 4).map((f) => f.name),
    },
    {
      slug: "routes",
      icon: "↗",
      title: "Routes",
      meta: `${ROUTE_TEMPLATES.length} templates`,
      items: ROUTE_TEMPLATES.slice(0, 4).map((r) => r.name),
    },
    {
      slug: "defense",
      icon: "🛡",
      title: "Defense",
      meta: `${uniqueDefenseCount()} schemes · all variants`,
      items: ["Cover 1 (man)", "Cover 2 (zone)", "Cover 3", "Hot blitz"],
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
            href={`/learn/library/plays/${featuredSlug}`}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            Open {featured.name}
            <ArrowRight className="size-4" />
          </Link>
          <p className="mt-2 text-[11px] text-muted">
            Rotates daily — check back tomorrow for a different concept.
          </p>
        </div>
        <div
          aria-hidden
          className="hidden h-24 w-44 items-center justify-center rounded-xl bg-gradient-to-b from-[#2D8B4E] to-[#1B5E30] text-xs italic text-white/70 md:flex"
        >
          play diagram preview
        </div>
      </section>

      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Browse the library
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CATEGORIES.map((cat) => (
          <Link key={cat.slug} href={`/learn/library/${cat.slug}`} className="group">
            <div className="h-full rounded-2xl border border-border bg-surface-raised p-5 transition-shadow group-hover:border-primary-light group-hover:shadow-md">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light text-base text-primary">
                {cat.icon}
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {cat.title}
              </h3>
              <p className="mb-3 text-xs text-muted">{cat.meta}</p>
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
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-xs text-muted">
        Drills, practice plans, coaching articles, and a full football
        glossary land in upcoming releases — we&apos;ll surface them here as
        each catalog gets seeded.
      </p>
    </div>
  );
}
