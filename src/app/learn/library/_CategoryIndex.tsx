import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { withFullContext } from "@/lib/seo/ld-json";
import { CategoryNav } from "./CategoryNav";
import { VariantPill } from "./VariantPill";

export type CategoryIndexProps = {
  category: string;
  title: string;
  description: string;
  entities: Array<{
    name: string;
    slug: string;
    description: string;
    chips?: string[];
  }>;
  /** Trailing note (e.g. "Diagram rendering coming soon"). */
  note?: string;
  /** Routes are variant-agnostic — a Slant is a Slant — so the
   *  routes category index doesn't show the variant filter. Plays,
   *  formations, and defense pages keep it. */
  hideVariantPill?: boolean;
};

export function CategoryIndex({
  category,
  title,
  description,
  entities,
  note,
  hideVariantPill = false,
}: CategoryIndexProps) {
  const categoryHref = `/learn/library/${category}`;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Football library", item: "/learn/library" },
      { "@type": "ListItem", position: 3, name: title, item: categoryHref },
    ],
  };

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
        <span className="text-foreground">{title}</span>
      </nav>

      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Football library
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>
      </header>

      {/* Category nav — sibling-page jumper so a coach scanning Plays
          can sidestep to Formations / Defenses / Routes without bouncing
          back to /learn/library. Preserves variant where applicable. */}
      <CategoryNav />

      {/* Variant filter — same persistent pill the library landing
          uses. Tracked on the URL so navigation between library
          pages preserves the coach's selection. Hidden on routes
          (variant-agnostic content). */}
      {!hideVariantPill && (
        <div className="mb-6">
          <VariantPill />
        </div>
      )}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entities.map((e) => (
          <li key={e.slug}>
            <Link
              href={`${categoryHref}/${e.slug}`}
              className="group block h-full rounded-2xl border border-border bg-surface-raised p-5 transition-all hover:-translate-y-0.5 hover:border-primary-light hover:shadow-md"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
                  {e.name}
                </h3>
                <ArrowRight className="mt-1 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
              <p className="line-clamp-3 text-sm leading-relaxed text-muted">
                {e.description}
              </p>
              {(e.chips ?? []).length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {e.chips!.map((c) => (
                    <span
                      key={c}
                      className="rounded-full bg-surface-inset px-2 py-0.5 text-[10px] font-medium text-muted"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      {note ? <p className="mt-10 text-xs text-muted">{note}</p> : null}
    </div>
  );
}
