"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Library variants — kept in lockstep with LIBRARY_VARIANTS in
// src/lib/learn/variant.ts (the source of truth used by URLs and
// generateStaticParams). 8v8 Tackle was previously listed here as a
// visual placeholder; removed 2026-05-26 because it's not a real
// catalog variant. "All variants" was also previously an option;
// removed 2026-05-26 because every play / formation / defense is
// inherently variant-specific (a 3-4 means nothing in 5v5 flag; the
// "Mesh" diagram is structurally different in 5v5 vs 7v7), so the
// library always renders ONE variant at a time.
const VARIANTS = [
  { value: "flag_5v5", label: "5v5 Flag", slug: "flag-5v5" },
  { value: "flag_6v6", label: "6v6 Flag", slug: "flag-6v6" },
  { value: "flag_7v7", label: "7v7 Flag", slug: "flag-7v7" },
  { value: "tackle_11", label: "11v11 Tackle", slug: "tackle-11" },
] as const;

type VariantValue = (typeof VARIANTS)[number]["value"];

// Default-variant constants moved to `src/lib/learn/variant.ts` so
// server components can import them — this file is `"use client"`,
// and Next.js wraps non-component exports from client modules as
// "client references" that server components can't call. Importing
// directly from the server-safe variant module avoids the
// production-only runtime crash that produced the `routes/[slug]`
// "Something went wrong" error (2026-05-26).
import {
  DEFAULT_LIBRARY_VARIANT,
  DEFAULT_LIBRARY_VARIANT_SLUG,
} from "@/lib/learn/variant";
import { setLibraryVariantCookieClient } from "@/lib/learn/variant-preference";

/** Persistent variant filter for the Football Library. Tracked on the
 *  URL as `?v=flag-5v5` so navigation between library pages preserves
 *  the coach's selection. Visible on the landing page + category
 *  index pages; detail pages embed it scoped to their entity's
 *  supported variants.
 *
 *  Behavior:
 *  - Click a variant → updates `?v=...` on the current URL, replacing
 *    the history entry (no back-button noise).
 *  - No `?v=` falls through to the DEFAULT_LIBRARY_VARIANT (5v5 Flag).
 *  - Reading code consumes `searchParams.v` server-side to filter
 *    catalog lists. This component is the WRITE side; consumers
 *    handle the READ side per page.
 *
 *  `supportedVariants` (optional) — when provided, ONLY those
 *  variants render as pill options. Used on detail pages where the
 *  entity is variant-specific (e.g., the 3-4 Cover 1 page passes
 *  ["tackle_11"] because 3-4 is tackle-only — coaches shouldn't see
 *  a 5v5 Flag option that 404s). Defaults to all four library
 *  variants (used by the landing + category index pages).
 */
export function VariantPill({
  supportedVariants,
}: {
  supportedVariants?: readonly VariantValue[];
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("v") ?? DEFAULT_LIBRARY_VARIANT_SLUG;
  const visibleVariants = supportedVariants && supportedVariants.length > 0
    ? VARIANTS.filter((v) => supportedVariants.includes(v.value))
    : VARIANTS;

  // Normalise the URL slug to the internal id (URL uses hyphens, the
  // internal id uses underscores so we can pass it straight to
  // generateConceptSkeleton, etc.). Both are accepted so an old
  // bookmark with the underscore form still resolves.
  const activeValue: VariantValue =
    (VARIANTS.find((v) => v.slug === current || v.value === current)?.value ??
      DEFAULT_LIBRARY_VARIANT);

  const onSelect = useCallback(
    (value: VariantValue) => {
      // Persist the choice so other library pages default to it.
      setLibraryVariantCookieClient(value);
      const next = new URLSearchParams(searchParams.toString());
      const v = VARIANTS.find((x) => x.value === value);
      if (v) next.set("v", v.slug);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // When only one variant is supported (e.g. tackle-only entity),
  // there's nothing to choose. Show it as a chip rather than a tab —
  // the variant is informational, not selectable.
  if (visibleVariants.length === 1) {
    const only = visibleVariants[0];
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-inset px-3 py-1.5 text-xs font-medium text-muted"
        aria-label="Football variant"
      >
        <span className="text-foreground font-semibold">{only.label}</span>
        <span className="text-muted">only</span>
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label="Filter by football variant"
      className="inline-flex gap-0.5 rounded-xl border border-border bg-surface-inset p-1"
    >
      {visibleVariants.map((v) => {
        const active = activeValue === v.value;
        return (
          <button
            key={v.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(v.value)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-surface-raised text-foreground shadow-sm font-semibold"
                : "text-muted hover:text-foreground"
            }`}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
