"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useTransition } from "react";
import {
  DEFAULT_LIBRARY_CATEGORY,
  LIBRARY_CATEGORIES,
  isLibraryCategory,
  type LibraryCategory,
} from "./categoryConstants";

/**
 * Tab-style category pill for the unified Football Library landing
 * page. Writes the active category to `?cat=` in the URL via
 * `router.replace` so the server component re-renders with the right
 * card grid below.
 *
 * Mirrors VariantPill's URL-param-driven pattern. Lives only on
 * `/learn/library` (the category index pages still use the inter-page
 * `CategoryNav` jumper).
 */

// useSearchParams() forces a CSR bailout — wrap in Suspense so the library
// landing page can be statically prerendered.
export function CategoryPill() {
  return (
    <Suspense fallback={<CategoryPillFallback />}>
      <CategoryPillInner />
    </Suspense>
  );
}

function CategoryPillFallback() {
  return (
    <nav
      aria-label="Football Library category"
      className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface-inset p-1"
    >
      {LIBRARY_CATEGORIES.map((c) => (
        <span
          key={c.value}
          className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-medium ${
            c.value === DEFAULT_LIBRARY_CATEGORY
              ? "bg-surface-raised text-foreground shadow-sm font-semibold"
              : "text-muted"
          }`}
        >
          {c.label}
        </span>
      ))}
    </nav>
  );
}

function CategoryPillInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const raw = searchParams.get("cat");
  const active: LibraryCategory = isLibraryCategory(raw)
    ? raw
    : DEFAULT_LIBRARY_CATEGORY;

  function select(next: LibraryCategory) {
    if (next === active) return;
    const params = new URLSearchParams(searchParams);
    params.set("cat", next);
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <nav
      aria-label="Football Library category"
      className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface-inset p-1"
      data-pending={isPending ? "true" : undefined}
    >
      {LIBRARY_CATEGORIES.map((c) => {
        const isActive = c.value === active;
        const className = `whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
          isActive
            ? "bg-surface-raised text-foreground shadow-sm font-semibold"
            : "text-muted hover:text-foreground"
        }`;
        return (
          <button
            key={c.value}
            type="button"
            onClick={() => select(c.value)}
            className={className}
            aria-current={isActive ? "page" : undefined}
          >
            {c.label}
          </button>
        );
      })}
    </nav>
  );
}
