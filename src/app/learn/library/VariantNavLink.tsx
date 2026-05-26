"use client";

// Client wrapper for the VariantNavPill's per-variant <Link>. Writes
// the library variant cookie BEFORE the navigation commits so the
// next page (which may not have a variant in its URL — e.g. the
// /learn/library/plays/[slug] redirect, or any concept index) picks
// up the new choice and renders accordingly.
//
// Kept as its own tiny component so the parent VariantNavPill can
// stay a server component (Link rendering is SSR-friendly, the cookie
// write only needs to run on click in the browser).

import Link from "next/link";
import { setLibraryVariantCookieClient } from "@/lib/learn/variant-preference";
import type { LibraryVariant } from "@/lib/learn/variant";

export function VariantNavLink({
  href,
  variant,
  className,
  label,
}: {
  href: string;
  variant: LibraryVariant;
  className: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      onClick={() => setLibraryVariantCookieClient(variant)}
      className={className}
    >
      {label}
    </Link>
  );
}
