import type { Metadata } from "next";
import Link from "next/link";
import { withFullContext } from "@/lib/seo/ld-json";
import { VariantPill } from "./VariantPill";

export const metadata: Metadata = {
  title: "Football Library · Learning Center · XO Gridmaker",
  description:
    "A free, browsable library of football concepts — plays, formations, routes, defenses, drills, and practice plans. Filter by 5v5 Flag, 6v6 Flag, 7v7 Flag, or tackle football.",
  alternates: { canonical: "/learn/library" },
  openGraph: {
    title: "Football Library · XO Gridmaker",
    description:
      "A free, browsable library of football concepts — plays, formations, routes, defenses, drills, and practice plans.",
    url: "/learn/library",
    type: "website",
  },
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "/" },
    { "@type": "ListItem", position: 2, name: "Learn", item: "/learn" },
    { "@type": "ListItem", position: 3, name: "Football Library", item: "/learn/library" },
  ],
};

type Category = {
  slug: string;
  icon: string;
  title: string;
  meta: string;
  items: string[];
  comingSoon?: boolean;
};

const CATEGORIES: Category[] = [
  {
    slug: "plays",
    icon: "▶",
    title: "Plays",
    meta: "concepts · all variants",
    items: ["Mesh", "Smash", "Four Verticals", "Stick"],
    comingSoon: true,
  },
  {
    slug: "formations",
    icon: "▢",
    title: "Formations",
    meta: "sets · all variants",
    items: ["Trips", "Spread", "Ace", "Empty"],
    comingSoon: true,
  },
  {
    slug: "routes",
    icon: "↗",
    title: "Routes",
    meta: "templates",
    items: ["Slant", "Post", "Wheel", "Mesh in-route"],
    comingSoon: true,
  },
  {
    slug: "defense",
    icon: "🛡",
    title: "Defense",
    meta: "coverages · all variants",
    items: ["Cover 1 (man)", "Cover 2 (zone)", "Cover 3", "Hot blitz"],
    comingSoon: true,
  },
  {
    slug: "drills",
    icon: "🏃",
    title: "Drills",
    meta: "drills · all variants",
    items: ["Mesh release", "Pull-the-flag agility", "QB footwork ladder"],
    comingSoon: true,
  },
  {
    slug: "practice-planning",
    icon: "🗓",
    title: "Practice planning",
    meta: "templates · ages PreK–HS",
    items: ["First week of season", "Pre-game install", "Mid-season tune-up"],
    comingSoon: true,
  },
  {
    slug: "coaching",
    icon: "💡",
    title: "Coaching",
    meta: "articles · all ages",
    items: [
      "Teaching mesh to 7-year-olds",
      "Building culture in flag",
      "Game-day clock mgmt",
    ],
    comingSoon: true,
  },
  {
    slug: "glossary",
    icon: "📖",
    title: "Glossary",
    meta: "alphabetical reference",
    items: ["Slant", "Bracket coverage", "RPO", "Hot route"],
    comingSoon: true,
  },
];

export default function LibraryLandingPage() {
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
          A free, browsable library of football concepts — plays, formations,
          routes, defenses, drills, and practice plans. Each concept will
          render in the same canonical editor that powers the play designer.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <VariantPill />
      </div>

      {/* Featured concept — placeholder until the first realized page lands.
          Phase 1c builds /learn/library/plays/mesh; until then this callout
          previews what the concept pages will be and links to nothing. */}
      <section className="mb-8 grid grid-cols-1 items-center gap-6 rounded-2xl border border-primary-light bg-gradient-to-br from-primary/[0.05] to-emerald-400/[0.05] p-6 md:grid-cols-[1fr_auto]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Coming soon
          </p>
          <h2 className="mt-1.5 text-xl font-extrabold tracking-tight">
            Mesh — the 5v5 Flag answer to man coverage
          </h2>
          <p className="mt-1.5 max-w-xl text-sm text-muted">
            Two crossing in-routes at 6 yards against man, with the flat as the
            cheap completion against zone. Concept pages launch in the next
            release — each one renders the play in the canonical editor with
            coaching cues, common mistakes, and an "Add to my playbook" CTA.
          </p>
        </div>
        <div
          aria-hidden
          className="flex h-24 w-44 items-center justify-center rounded-xl bg-gradient-to-b from-[#2D8B4E] to-[#1B5E30] text-xs italic text-white/70"
        >
          play diagram preview
        </div>
      </section>

      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Browse the library
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CATEGORIES.map((cat) => (
          <CategoryCard key={cat.slug} cat={cat} />
        ))}
      </div>

      <p className="mt-10 text-xs text-muted">
        The library is in active development. Concept pages render plays via
        the canonical XO play editor — same diagrams the builder shows,
        every concept will have an &ldquo;Add to my playbook&rdquo; button for
        signed-in coaches.
      </p>
    </div>
  );
}

function CategoryCard({ cat }: { cat: Category }) {
  const content = (
    <div className="h-full rounded-2xl border border-border bg-surface-raised p-5 transition-shadow group-hover:border-primary-light group-hover:shadow-md">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light text-base text-primary">
        {cat.icon}
      </div>
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-base font-semibold text-foreground">{cat.title}</h3>
        {cat.comingSoon ? (
          <span className="rounded-full bg-surface-inset px-2 py-0.5 text-[10px] font-medium text-muted">
            Coming soon
          </span>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-muted">{cat.meta}</p>
      <ul className="space-y-1.5 text-xs text-muted">
        {cat.items.map((item) => (
          <li key={item} className="before:mr-1.5 before:text-primary before:content-['→']">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );

  if (cat.comingSoon) {
    return <div className="group cursor-not-allowed opacity-70">{content}</div>;
  }
  return (
    <Link href={`/learn/library/${cat.slug}`} className="group">
      {content}
    </Link>
  );
}
