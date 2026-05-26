import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import { toLearnSlug } from "@/lib/learn/links";
import { withFullContext } from "@/lib/seo/ld-json";

export const metadata: Metadata = {
  title: "Plays · Football library · XO Gridmaker",
  description:
    "Every football play concept in the XO Gridmaker library — pass, run, RPO, and trick plays. Each opens to a real diagram rendered by the canonical play editor.",
  alternates: { canonical: "/learn/library/plays" },
};

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

export default function PlaysIndexPage() {
  // Group concepts by complexity so basic plays surface first — coaches
  // browsing the catalog usually want install-friendly stuff before deep
  // cuts.
  const concepts = [...CONCEPTS].sort((a, b) => {
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(withFullContext(breadcrumbLd)) }}
      />

      <nav className="mb-6 flex items-center gap-1 text-xs text-muted">
        <Link href="/learn/library" className="hover:text-foreground transition-colors">
          Football library
        </Link>
        <span>›</span>
        <span className="text-foreground">Plays</span>
      </nav>

      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Football library
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Plays</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Every play concept in the catalog. Each page renders the play in the
          canonical XO editor — same diagram a coach would see in the
          builder. Sign in to drop a concept into one of your playbooks.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {concepts.map((c) => (
          <li key={c.id}>
            <Link
              href={`/learn/library/plays/${toLearnSlug(c.name)}`}
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
                <span className="rounded-full bg-surface-inset px-2 py-0.5 text-[10px] font-medium text-muted">
                  {c.variants.length} variant{c.variants.length === 1 ? "" : "s"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-xs text-muted">
        {concepts.length} plays in the catalog. Library content is in active
        development — concept pages will gain &ldquo;when to call it&rdquo; and
        &ldquo;common mistakes&rdquo; prose in upcoming releases.
      </p>
    </div>
  );
}
