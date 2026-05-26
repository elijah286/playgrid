// Shared shell for the text-only Library entity pages (formations,
// routes, defenses). Plays use their own renderer because they have
// PlayEditor diagrams; everything else gets this lighter shell for now.
// Diagrams come in a follow-up pass.

import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { withFullContext } from "@/lib/seo/ld-json";

export type LibraryEntityProps = {
  /** "formations" | "routes" | "defense" */
  category: string;
  /** Display name shown on the page (e.g. "Trips Right"). */
  name: string;
  /** URL slug (already toLearnSlug'd by the caller). */
  slug: string;
  /** Aliases that should appear as small chips and JSON-LD keywords. */
  aliases?: string[];
  /** Category chip label ("Formation", "Route", "Defense"). */
  categoryLabel: string;
  /** Single-paragraph headline description. */
  description: string;
  /** Longer prose body. Falls back to description when absent. */
  body?: string;
  /** Tag chips (e.g. "spread", "balanced"). */
  tags?: string[];
  /** Complexity chip ("basic" / "intermediate" / "advanced"). */
  complexity?: string | null;
  /** Variants this entity is defined for. */
  variants?: string[];
  /** Pretty variant labels for the "also works in" panel. */
  variantLabels?: Record<string, string>;
  /** "Related" rail rendered in the sidebar. Each entry is a slug + name
   *  within the SAME category. */
  related?: Array<{ name: string; slug: string }>;
  /** Optional plain-English "where you see this" cross-reference (e.g.
   *  "Used by Mesh, Smash, Drive"). */
  usedByLine?: string;
};

const CATEGORY_TONE: Record<string, string> = {
  formations: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  routes: "bg-primary-light text-primary",
  defense: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

export function LibraryEntityPage(props: LibraryEntityProps) {
  const {
    category,
    name,
    slug,
    aliases = [],
    categoryLabel,
    description,
    body,
    tags = [],
    complexity = null,
    variants = [],
    variantLabels = {},
    related = [],
    usedByLine,
  } = props;

  const categoryHref = `/learn/library/${category}`;
  const categoryTitle = categoryLabel.endsWith("s") ? categoryLabel : `${categoryLabel}s`;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Football library", item: "/learn/library" },
      { "@type": "ListItem", position: 3, name: categoryTitle, item: categoryHref },
      { "@type": "ListItem", position: 4, name, item: `${categoryHref}/${slug}` },
    ],
  };

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: `${name} — football ${categoryLabel.toLowerCase()}`,
    description,
    articleSection: "Football library",
    keywords: [name, ...aliases].join(", "),
  };

  return (
    <article className="mx-auto max-w-3xl px-6 py-10 text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(withFullContext(breadcrumbLd)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(withFullContext(articleLd)) }}
      />

      <nav className="mb-6 flex items-center gap-1 text-xs text-muted">
        <Link href="/learn/library" className="hover:text-foreground transition-colors">
          Football library
        </Link>
        <span>›</span>
        <Link href={categoryHref} className="hover:text-foreground transition-colors">
          {categoryTitle}
        </Link>
        <span>›</span>
        <span className="text-foreground">{name}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Football library · {categoryTitle}
          </p>
          <h1 className="mt-1 text-4xl font-extrabold tracking-tight">{name}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
                CATEGORY_TONE[category] ?? "bg-surface-inset text-muted"
              }`}
            >
              {categoryLabel}
            </span>
            {complexity ? (
              <span className="rounded-full bg-surface-inset px-3 py-0.5 text-xs font-medium text-muted capitalize">
                {complexity}
              </span>
            ) : null}
            {tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className="rounded-full bg-surface-inset px-3 py-0.5 text-xs font-medium text-muted"
              >
                {t}
              </span>
            ))}
            {aliases.slice(0, 2).map((a) => (
              <span
                key={a}
                className="rounded-full bg-surface-inset px-3 py-0.5 text-xs font-medium text-muted"
              >
                aka {a}
              </span>
            ))}
          </div>
        </div>
        <Link
          href={categoryHref}
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          All {categoryTitle.toLowerCase()}
        </Link>
      </header>

      <p className="mb-4 text-lg leading-relaxed text-foreground">{description}</p>

      {body && body !== description ? (
        <div className="prose prose-sm mt-4 max-w-none text-base leading-relaxed text-muted">
          {body.split(/\n\n+/).map((para, i) => (
            <p key={i} className="mt-3">
              {para}
            </p>
          ))}
        </div>
      ) : null}

      {usedByLine ? (
        <p className="mt-6 rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-muted">
          <strong className="font-semibold text-foreground">Used by: </strong>
          {usedByLine}
        </p>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {variants.length > 0 ? (
          <div className="rounded-2xl border border-border bg-surface-raised p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Available variants
            </h4>
            <ul className="mt-2 space-y-1.5 text-sm">
              {variants.map((v) => (
                <li key={v} className="flex items-center justify-between">
                  <span>{variantLabels[v] ?? v}</span>
                  <span className="text-xs text-emerald-500">✓</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {related.length > 0 ? (
          <div className="rounded-2xl border border-border bg-surface-raised p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
              <BookOpen className="mr-1 inline size-3.5" />
              Related {categoryTitle.toLowerCase()}
            </h4>
            <ul className="mt-2 space-y-1.5">
              {related.slice(0, 6).map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`${categoryHref}/${r.slug}`}
                    className="flex items-center justify-between text-sm hover:text-primary"
                  >
                    <span>{r.name}</span>
                    <ArrowRight className="size-3.5 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <p className="mt-10 text-xs text-muted">
        Diagram rendering for {categoryLabel.toLowerCase()}s lands in an
        upcoming release — this page will gain a canonical PlayEditor render
        like the play pages already have.
      </p>
    </article>
  );
}
