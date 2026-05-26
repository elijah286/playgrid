"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Library variants — kept in lockstep with LIBRARY_VARIANTS in
// src/lib/learn/variant.ts (the source of truth used by URLs and
// generateStaticParams). 8v8 Tackle was previously listed here as a
// visual placeholder; removed 2026-05-26 because it's not a real
// catalog variant and clicking it 404'd downstream pages.
const VARIANTS = [
  { value: "all", label: "All variants", slug: null },
  { value: "flag_5v5", label: "5v5 Flag", slug: "flag-5v5" },
  { value: "flag_6v6", label: "6v6 Flag", slug: "flag-6v6" },
  { value: "flag_7v7", label: "7v7 Flag", slug: "flag-7v7" },
  { value: "tackle_11", label: "11v11 Tackle", slug: "tackle-11" },
] as const;

type VariantValue = (typeof VARIANTS)[number]["value"];

/** Persistent variant filter for the Football Library. Tracked on the
 *  URL as `?v=flag-5v5` so navigation between library pages preserves
 *  the coach's selection. Visible on the landing page + category
 *  index pages; detail pages embed a smaller variant chip that links
 *  back to the category with the variant pre-selected.
 *
 *  Behavior:
 *  - Click a variant → updates `?v=...` on the current URL, replacing
 *    the history entry (no back-button noise).
 *  - "All variants" clears the param.
 *  - Reading code consumes `searchParams.v` server-side to filter
 *    catalog lists. This component is the WRITE side; consumers
 *    handle the READ side per page.
 */
export function VariantPill() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = (searchParams.get("v") ?? "all") as string;

  // Normalise the URL slug to the internal id (URL uses hyphens, the
  // internal id uses underscores so we can pass it straight to
  // generateConceptSkeleton, etc.). Both are accepted so an old
  // bookmark with the underscore form still resolves.
  const activeValue: VariantValue =
    (VARIANTS.find((v) => v.slug === current || v.value === current)?.value ??
      "all") as VariantValue;

  const onSelect = useCallback(
    (value: VariantValue) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === "all") {
        next.delete("v");
      } else {
        const v = VARIANTS.find((x) => x.value === value);
        if (v?.slug) next.set("v", v.slug);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <div
      role="tablist"
      aria-label="Filter by football variant"
      className="inline-flex gap-0.5 rounded-xl border border-border bg-surface-inset p-1"
    >
      {VARIANTS.map((v) => {
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
