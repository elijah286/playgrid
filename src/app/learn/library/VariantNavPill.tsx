// Variant pill that NAVIGATES on click. Used on every concept page
// (plays/formations/routes/defense slug routes) so a coach scanning
// Mesh in 5v5 can one-tap to the tackle version. Each pill item is
// a real <Link> — SSR-friendly, indexable, no client-side state.
//
// Only renders variants the concept actually supports — unavailable
// variants are HIDDEN entirely (not just disabled) per user feedback
// 2026-05-26: "if a play isn't available for another game type, the
// option to select it should not be shown."
//
// When only one variant is supported, renders as an informational
// chip ("11v11 Tackle only") rather than a single-option pill — the
// variant is informational, not selectable.

import Link from "next/link";
import {
  VARIANT_LABEL,
  variantToSlug,
  type LibraryVariant,
} from "@/lib/learn/variant";

export type VariantNavPillProps = {
  /** Category segment of the URL — "plays" / "formations" / "routes" /
   *  "defense". */
  category: string;
  /** Concept slug — "mesh" / "trips" / "slant" / "cover-2". */
  conceptSlug: string;
  /** The variant currently being viewed. */
  currentVariant: LibraryVariant;
  /** Variants this concept supports. Entries outside this set are
   *  HIDDEN — coaches see only the variants they can actually pick. */
  supportedVariants: ReadonlyArray<LibraryVariant>;
};

export function VariantNavPill({
  category,
  conceptSlug,
  currentVariant,
  supportedVariants,
}: VariantNavPillProps) {
  if (supportedVariants.length === 1) {
    const only = supportedVariants[0];
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-inset px-3 py-1.5 text-xs font-medium text-muted"
        aria-label="Football variant"
      >
        <span className="text-foreground font-semibold">{VARIANT_LABEL[only]}</span>
        <span className="text-muted">only</span>
      </div>
    );
  }
  return (
    <nav
      aria-label="Switch variant"
      className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface-inset p-1"
    >
      {supportedVariants.map((v) => {
        const isActive = v === currentVariant;
        const slug = variantToSlug(v);
        const className = `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors ${
          isActive
            ? "bg-surface-raised font-semibold text-foreground shadow-sm"
            : "text-muted hover:bg-surface-raised/60 hover:text-foreground"
        }`;
        if (isActive) {
          return (
            <span key={v} className={className} aria-current="page">
              {VARIANT_LABEL[v]}
            </span>
          );
        }
        return (
          <Link
            key={v}
            href={`/learn/library/${category}/${conceptSlug}/${slug}`}
            className={className}
          >
            {VARIANT_LABEL[v]}
          </Link>
        );
      })}
    </nav>
  );
}
