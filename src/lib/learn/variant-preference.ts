// Variant preference cookie — remembers the coach's last-chosen
// variant across library pages so navigation between plays doesn't
// reset the game mode to flag_5v5.
//
// Two surfaces write the cookie:
//   1. VariantPill (the `?v=`-style filter on index pages)
//   2. VariantNavPill (the URL-path variant switcher on detail pages)
//
// Read sites:
//   - The /learn/library/plays/[slug] redirect (concept-default page)
//   - Any library index page that picks a default when `?v=` is absent
//
// The cookie is plain text containing the variant id (`flag_7v7`,
// not the URL slug `flag-7v7`) — server reads it directly without a
// slug→id translation step. 1-year expiry; the coach explicitly
// switches when they want a different default.

import {
  LIBRARY_VARIANTS,
  type LibraryVariant,
} from "@/lib/learn/variant";

export const LIBRARY_VARIANT_COOKIE = "xo_library_variant";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Server-side read. Returns the saved variant or null when absent /
 *  malformed. Caller is responsible for falling back to a default.
 *  Async so it can be used from server components alongside the
 *  Next.js `cookies()` API. */
export async function getLibraryVariantCookie(): Promise<LibraryVariant | null> {
  // Lazy-import `next/headers` so this module can also be imported
  // from client components without crashing — only the read helper
  // touches the server-only API.
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const raw = store.get(LIBRARY_VARIANT_COOKIE)?.value ?? null;
  if (!raw) return null;
  return (LIBRARY_VARIANTS as ReadonlyArray<string>).includes(raw)
    ? (raw as LibraryVariant)
    : null;
}

/** Client-side write. Sets the cookie via `document.cookie` so the
 *  next server request picks it up. Path=/ so every library URL
 *  receives it. SameSite=Lax is enough — no cross-site risk here. */
export function setLibraryVariantCookieClient(variant: LibraryVariant): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(variant);
  document.cookie =
    `${LIBRARY_VARIANT_COOKIE}=${value}; Max-Age=${ONE_YEAR_SECONDS}; ` +
    `Path=/; SameSite=Lax`;
}
