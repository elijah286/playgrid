// Variant pill that NAVIGATES on click. Used on every concept page
// (plays/formations/routes/defense slug routes) so a coach scanning
// Mesh in 5v5 can one-tap to the tackle version. Each pill item is a
// real <Link> — SSR-friendly, indexable, no client-side state.
//
// Unsupported variants (concept doesn't define them) render as a
// non-link with reduced opacity + tooltip.

import Link from "next/link";
import {
  LIBRARY_VARIANTS,
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
  /** Variants this concept supports — entries outside this set render
   *  as disabled chips. */
  supportedVariants: ReadonlyArray<LibraryVariant>;
};

export function VariantNavPill({
  category,
  conceptSlug,
  currentVariant,
  supportedVariants,
}: VariantNavPillProps) {
  const supported = new Set(supportedVariants);
  return (
    <nav
      aria-label="Switch variant"
      className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface-inset p-1"
    >
      {LIBRARY_VARIANTS.map((v) => {
        const isActive = v === currentVariant;
        const isSupported = supported.has(v);
        const slug = variantToSlug(v);
        const className = `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors ${
          isActive
            ? "bg-surface-raised font-semibold text-foreground shadow-sm"
            : isSupported
              ? "text-muted hover:bg-surface-raised/60 hover:text-foreground"
              : "cursor-not-allowed text-muted/40"
        }`;
        if (!isSupported) {
          return (
            <span
              key={v}
              className={className}
              title={`Not available in ${VARIANT_LABEL[v]}`}
            >
              {VARIANT_LABEL[v]}
            </span>
          );
        }
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
