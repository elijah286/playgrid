"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Tab-style category nav for the four Football Library index pages.
// Lives above the variant pill on Plays / Formations / Defenses / Routes
// index pages so coaches can jump sideways between catalog types without
// going back to /learn/library first.
//
// VARIANT PERSISTENCE.
// The active variant comes from two surfaces:
//   1. The `?v=` query param (used on /learn/library hub + every category
//      index when a coach has clicked the variant pill).
//   2. The `/learn/library/plays/variant/{slug}` path segment (used on
//      the indexable-for-SEO variant rollup pages).
// Either way, the variant carries forward when the coach jumps to
// another category — clicking "Formations" from a 7v7 context lands on
// 7v7 formations, never a default reset.
//
// The "Plays" link is special: when a variant is active, it points at
// the rollup URL (/learn/library/plays/variant/{slug}) rather than the
// query-param index. That keeps coaches on the canonical SEO surface
// and gives Google one consistent destination for "Plays" clicks site-
// wide.
//
// Routes is variant-agnostic — clicking it always drops the variant
// because the routes catalog is shared across all variants.

const CATEGORIES = [
  { label: "Plays", key: "plays" as const },
  { label: "Formations", key: "formations" as const },
  { label: "Defenses", key: "defenses" as const },
  { label: "Routes", key: "routes" as const },
];

// Normalise variant slugs that appear in the wild. URLs prefer hyphen
// form ("flag-5v5"); legacy bookmarks and the internal id use underscore
// form ("flag_5v5"). Accept both, emit hyphen.
const VARIANT_HYPHEN = new Set([
  "flag-5v5",
  "flag-6v6",
  "flag-7v7",
  "tackle-11",
]);
function normaliseVariantSlug(raw: string | null): string | null {
  if (!raw) return null;
  const hyphenated = raw.replace("_", "-");
  return VARIANT_HYPHEN.has(hyphenated) ? hyphenated : null;
}

export function CategoryNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Variant resolution order: path segment on variant rollups wins, then
  // ?v= query param. Cookie isn't read here because the cookie is
  // server-side state — if the URL doesn't carry the variant, we
  // intentionally don't synthesise one client-side (CategoryNav stays a
  // pure URL→link transform).
  const rollupMatch = pathname.match(
    /^\/learn\/library\/plays\/variant\/([^/]+)/,
  );
  const pathVariant = rollupMatch
    ? normaliseVariantSlug(rollupMatch[1] ?? null)
    : null;
  const queryVariant = normaliseVariantSlug(searchParams.get("v"));
  const variantSlug = pathVariant ?? queryVariant;

  const isPlaysActive =
    pathname === "/learn/library/plays" ||
    pathname.startsWith("/learn/library/plays/");
  const isFormationsActive =
    pathname === "/learn/library/formations" ||
    pathname.startsWith("/learn/library/formations/");
  const isDefensesActive =
    pathname === "/learn/library/defense" ||
    pathname.startsWith("/learn/library/defense/");
  const isRoutesActive =
    pathname === "/learn/library/routes" ||
    pathname.startsWith("/learn/library/routes/");

  function hrefFor(key: (typeof CATEGORIES)[number]["key"]): string {
    switch (key) {
      case "plays":
        return variantSlug
          ? `/learn/library/plays/variant/${variantSlug}`
          : "/learn/library/plays";
      case "formations":
        return variantSlug
          ? `/learn/library/formations?v=${variantSlug}`
          : "/learn/library/formations";
      case "defenses":
        return variantSlug
          ? `/learn/library/defense?v=${variantSlug}`
          : "/learn/library/defense";
      case "routes":
        // Routes catalog is shared across variants — intentionally drop
        // the `?v=` here.
        return "/learn/library/routes";
    }
  }

  function isActive(key: (typeof CATEGORIES)[number]["key"]): boolean {
    switch (key) {
      case "plays":
        return isPlaysActive;
      case "formations":
        return isFormationsActive;
      case "defenses":
        return isDefensesActive;
      case "routes":
        return isRoutesActive;
    }
  }

  return (
    <nav
      aria-label="Football Library categories"
      className="mb-4 inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface-inset p-1"
    >
      {CATEGORIES.map((c) => {
        const active = isActive(c.key);
        const className = `whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
          active
            ? "bg-surface-raised text-foreground shadow-sm font-semibold"
            : "text-muted hover:text-foreground"
        }`;
        if (active) {
          return (
            <span key={c.key} className={className} aria-current="page">
              {c.label}
            </span>
          );
        }
        return (
          <Link key={c.key} href={hrefFor(c.key)} className={className}>
            {c.label}
          </Link>
        );
      })}
    </nav>
  );
}
