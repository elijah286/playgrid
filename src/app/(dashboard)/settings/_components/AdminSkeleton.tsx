import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Loading/streaming chrome for the Site admin page (`/settings`).
 *
 * The Site admin page fetches ~40 server actions before it can render
 * anything, so without a fallback the browser sits on the previous page
 * with no indication that anything is happening. These pieces give the
 * page an instant, layout-stable skeleton:
 *
 *  - `loading.tsx` composes all three for the route-level Suspense
 *    fallback (shown the moment the admin taps "Site Admin").
 *  - `page.tsx` renders `<AdminHeader>` as real content immediately and
 *    uses `<AdminRouteProgress>` + `<AdminBodySkeleton>` as the fallback
 *    for the streamed data boundary.
 *
 * Admin-only surface — none of this is reachable by regular users.
 */

/**
 * Sliding indeterminate progress bar, pinned to the top of the viewport.
 * The `animate-pulse` skeletons below can read as "frozen" on a slow
 * connection; the continuously sliding bar is the unambiguous "we're
 * working on it" signal. Mirrors the treatment used by the playbook
 * detail loading route (`route-progress-bar` in globals.css).
 */
export function AdminRouteProgress() {
  return (
    <div
      aria-hidden
      className="native-safe-top fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden bg-primary/10"
    >
      <div className="route-progress-bar h-full w-1/3 rounded-r-full bg-primary" />
    </div>
  );
}

/**
 * The "Home" back-link + "Site admin" title. Rendered as real (not
 * skeleton) content so the page identity is visible the instant the
 * route paints, even while the data behind it is still streaming in.
 * Kept identical to the header in `page.tsx` so there's no shift when
 * the streamed content swaps in below it.
 */
export function AdminHeader() {
  return (
    <div>
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Home
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
        Site admin
      </h1>
    </div>
  );
}

/**
 * Skeleton for the Site admin body: the desktop sidebar nav + the main
 * content panel. Mirrors the real two-column grid (`SettingsClient`) so
 * the layout doesn't shift when the streamed content replaces it.
 */
export function AdminBodySkeleton() {
  return (
    <div
      className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8"
      aria-hidden
    >
      {/* Sidebar nav skeleton — desktop only, mirrors AdminSidebarNav's
          grouped sections. */}
      <aside className="hidden lg:block">
        <div className="sticky top-4 space-y-5 pr-2">
          {Array.from({ length: 5 }).map((_, group) => (
            <div key={group}>
              <div className="h-3 w-20 animate-pulse rounded bg-border" />
              <div className="mt-2 space-y-1.5">
                {Array.from({ length: 3 }).map((_, item) => (
                  <div
                    key={item}
                    className="h-7 w-full animate-pulse rounded-md bg-border/70"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="min-w-0 space-y-6">
        {/* Mobile tab switcher placeholder (mirrors the "Menu" button). */}
        <div className="lg:hidden">
          <div className="h-11 w-full animate-pulse rounded-lg bg-border" />
        </div>
        {/* Headline metric card (the Overview's first card). */}
        <div className="h-28 w-full animate-pulse rounded-2xl bg-border/80" />
        {/* Metric tiles. */}
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-border/70"
            />
          ))}
        </div>
        {/* Table / chart block. */}
        <div className="h-64 w-full animate-pulse rounded-2xl bg-border/60" />
      </div>
    </div>
  );
}
