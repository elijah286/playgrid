// SEO collection pages: "best plays to beat <coverage>" — one indexable URL
// per profiled coverage (/learn/library/plays/vs/cover-3, /tampa-2, …).
// Targets the "best plays to beat cover 3" head-term intent that a single
// concept page can't rank for (that SERP wants a LIST).
//
// Fully PROJECTED from coverageProfiles.ts (the single source of truth for
// matchup verdicts, AGENTS.md Rule 6): the beater list, soft spots, and
// strengths are all read from the profile — no hand-authored matchup data
// lives here. Enrich `coverageProfiles.beaters` to change what a page lists.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { COVERAGE_PROFILES, type CoverageProfile } from "@/domain/play/coverageProfiles";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { learnLink, toLearnSlug } from "@/lib/learn/links";
import { withFullContext } from "@/lib/seo/ld-json";
import { CategoryNav } from "../../../CategoryNav";

export const dynamicParams = false;
export const revalidate = 3600;

export function generateStaticParams() {
  return COVERAGE_PROFILES.map((p) => ({ coverageSlug: toLearnSlug(p.coverage) }));
}

function findCoverageBySlug(slug: string): CoverageProfile | null {
  return COVERAGE_PROFILES.find((p) => toLearnSlug(p.coverage) === slug) ?? null;
}

// Per-coverage head-term copy. Titles ≤ ~60 chars, descriptions ≤ ~155.
const COVERAGE_SEO: Record<
  string,
  { h1: string; title: string; description: string; intro: string }
> = {
  "Cover 0": {
    h1: "Best plays to beat Cover 0",
    title: "Best plays to beat Cover 0 (zero blitz)",
    description:
      "Plays that beat Cover 0 — the no-safety, all-out man blitz. Rub/mesh releases, the quick game, and vertical shots that punish zero help over the top.",
    intro:
      "Cover 0 is pure man with no deep safety, usually paired with pressure. Beat it with rub and mesh releases, the hot quick game, and vertical shots — a single step on a man is a touchdown.",
  },
  "Cover 1": {
    h1: "Best plays to beat Cover 1",
    title: "Best plays to beat Cover 1 (man-free)",
    description:
      "Plays that beat Cover 1 man-free — crossers and rubs that spring a man defender, plus routes worked away from the single free safety.",
    intro:
      "Cover 1 plays man across the board with one free safety in the deep middle. Beat it with natural rubs (mesh, drive), isolation away from the safety, and vertical stress on the single-high help.",
  },
  "Cover 2": {
    h1: "Best plays to beat Cover 2",
    title: "Best plays to beat Cover 2",
    description:
      "Plays that beat Cover 2 — attack the deep-sideline honey hole and split the two safeties. Smash, flood, and four verticals lead the way.",
    intro:
      "Cover 2 splits the deep field between two safeties with corners squatting the flats. Beat it by high-lowing the corner (smash), flooding a side, or splitting the safeties down the seam.",
  },
  "Tampa 2": {
    h1: "Best plays to beat Tampa 2",
    title: "Best plays to beat Tampa 2",
    description:
      "Plays that beat Tampa 2 — the two deep honey holes outside the hashes and the flats before the corner sinks. Smash and flood are the answers.",
    intro:
      "Tampa 2 sends the Mike to the deep middle, plugging the classic Cover 2 hole. Attack the two honey holes outside the hashes and the flats early with corner-flat combos and floods.",
  },
  "Cover 3": {
    h1: "Best plays to beat Cover 3",
    title: "Best plays to beat Cover 3",
    description:
      "Plays that beat Cover 3 — four underneath defenders can't cover five zones. Curl-flat, smash, flood, and snag flood the soft flats and seams.",
    intro:
      "Cover 3 drops three deep and leaves four underneath to cover five short zones. Beat it by flooding the flats and seams — curl-flat, slant-flat, smash, flood, and snag are staples.",
  },
  "Cover 4": {
    h1: "Best plays to beat Cover 4 (quarters)",
    title: "Best plays to beat Cover 4 quarters",
    description:
      "Plays that beat Cover 4 quarters — only three underneath defenders. Stick, snag, and the quick game attack the soft underneath and flats.",
    intro:
      "Cover 4 plays quarters over the top with only three underneath — built to stop the deep ball. Beat it underneath with stick, snag, slant-flat, and the quick game.",
  },
};

type Params = { coverageSlug: string };

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { coverageSlug } = await params;
  const profile = findCoverageBySlug(coverageSlug);
  if (!profile) return { title: "Coverage not found" };
  const seo = COVERAGE_SEO[profile.coverage];
  const url = `/learn/library/plays/vs/${coverageSlug}`;
  return {
    title: seo?.title ?? `Best plays to beat ${profile.coverage}`,
    description: seo?.description ?? profile.summary,
    alternates: { canonical: url },
    openGraph: {
      title: seo?.title ?? `Best plays to beat ${profile.coverage}`,
      description: seo?.description ?? profile.summary,
      url,
      type: "website",
    },
  };
}

export default async function BeatCoveragePage(
  { params }: { params: Promise<Params> },
) {
  if (!(await isFootballLibraryAvailable())) notFound();
  const { coverageSlug } = await params;
  const profile = findCoverageBySlug(coverageSlug);
  if (!profile) notFound();
  const seo = COVERAGE_SEO[profile.coverage];

  // Resolve each beater to its play page (default variant). learnLink
  // returns null if the concept has no page — render those as plain text.
  const beaters = profile.beaters.map((name) => ({
    name,
    href: learnLink({ concept: name, category: "plays" }),
  }));
  const linked = beaters.filter(
    (b): b is { name: string; href: string } => Boolean(b.href),
  );

  const url = `/learn/library/plays/vs/${coverageSlug}`;
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Football library", item: "/learn/library" },
      { "@type": "ListItem", position: 3, name: "Plays", item: "/learn/library/plays" },
      {
        "@type": "ListItem",
        position: 4,
        name: `Beat ${profile.coverage}`,
        item: url,
      },
    ],
  };
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: seo?.h1 ?? `Best plays to beat ${profile.coverage}`,
    itemListElement: linked.map((b, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: b.name,
      url: b.href,
    })),
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(withFullContext(breadcrumbLd)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(withFullContext(itemListLd)) }}
      />

      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Football library · Plays
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
          {seo?.h1 ?? `Best plays to beat ${profile.coverage}`}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">{seo?.intro ?? profile.summary}</p>
      </header>

      <CategoryNav />

      <h2 className="mb-3 mt-2 text-xl font-bold tracking-tight">
        Plays that beat {profile.coverage}
      </h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {beaters.map((b) =>
          b.href ? (
            <li key={b.name}>
              <Link
                href={b.href}
                className="group flex h-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-5 transition-all hover:-translate-y-0.5 hover:border-primary-light hover:shadow-md"
              >
                <span className="text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
                  {b.name}
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            </li>
          ) : (
            <li
              key={b.name}
              className="flex h-full items-center rounded-2xl border border-border bg-surface-raised p-5 text-lg font-semibold text-muted"
            >
              {b.name}
            </li>
          ),
        )}
      </ul>

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Where {profile.coverage} is soft
          </h2>
          <ul className="mt-2 space-y-1.5 pl-6">
            {profile.softSpots.map((s) => (
              <li key={s} className="list-disc text-base leading-relaxed text-muted">
                {s}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Where it&apos;s strong — don&apos;t attack here
          </h2>
          <ul className="mt-2 space-y-1.5 pl-6">
            {profile.strongSpots.map((s) => (
              <li key={s} className="list-disc text-base leading-relaxed text-muted">
                {s}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="mt-10 text-xs text-muted">
        Matchups are derived from XO Gridmaker&apos;s coverage catalog — the same
        engine that grades plays inside Coach Cal.
      </p>
    </div>
  );
}
