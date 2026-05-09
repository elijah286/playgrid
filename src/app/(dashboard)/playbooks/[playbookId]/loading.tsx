/**
 * Route-level loading UI shown by Next.js while the playbook page is
 * fetching plays / formations / roster / settings. Renders instantly
 * on tap (e.g. when the user taps "Plays" in the editor footer to go
 * back) so the navigation feels as fast as switching tabs on the
 * playbook page itself.
 *
 * Mirrors the playbook's mobile shell: orange chrome at top, a
 * skeleton toolbar and play card grid, and the bottom nav. Real
 * content swaps in once page.tsx finishes server-rendering.
 */
export default function PlaybookDetailLoading() {
  return (
    <div className="-mt-8 flex flex-col gap-0 pb-20 sm:gap-4 sm:pb-0">
      {/* Mobile-only orange playbook chrome placeholder. The real chrome
          fills in playbook name + initial once data loads. */}
      <div
        className="native-safe-top sticky top-0 z-30 -mx-6 flex items-center gap-2 px-4 py-3 sm:hidden"
        style={{ backgroundColor: "#F26522" }}
      >
        <div className="size-9 rounded-lg bg-white/20" aria-hidden />
        <div className="size-9 rounded-lg bg-white/30" aria-hidden />
        <div className="h-4 flex-1 rounded bg-white/30" aria-hidden />
        <div className="size-9 rounded-lg bg-white/20" aria-hidden />
      </div>

      {/* Desktop placeholder header — keeps the skeleton from looking
          empty on tablets / desktop where the orange chrome is hidden. */}
      <div className="hidden sm:block">
        <div className="h-4 w-24 animate-pulse rounded bg-border" />
        <div className="mt-3 h-8 w-48 animate-pulse rounded-lg bg-border" />
      </div>

      {/* Toolbar row skeleton */}
      <div className="mt-3 flex flex-wrap items-end gap-3 sm:mt-0">
        <div className="h-9 w-24 animate-pulse rounded-lg bg-border" />
        <div className="h-9 flex-1 animate-pulse rounded-lg bg-border" />
        <div className="h-9 w-9 animate-pulse rounded-lg bg-border" />
      </div>

      {/* Section header */}
      <div className="mt-4 flex items-center gap-2 border-b border-border pb-2">
        <div className="h-5 w-20 animate-pulse rounded bg-border" />
        <div className="h-4 w-6 animate-pulse rounded-full bg-border" />
      </div>

      {/* Play card grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-44 animate-pulse rounded-xl border border-border bg-surface-raised"
          />
        ))}
      </div>

      {/* Bottom nav skeleton — keeps the footer chrome stable across
          the navigation transition so it doesn't pop in on swap. */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-surface-raised sm:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 4px)" }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex min-h-[52px] flex-1 items-center justify-center"
          >
            <div className="size-5 rounded-full bg-surface-inset" aria-hidden />
          </div>
        ))}
      </div>
    </div>
  );
}
