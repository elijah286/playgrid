/**
 * Neutral content skeleton for the league area's Suspense boundaries
 * (loading.tsx). The app-wide rail lives in the layout, so it stays put during
 * navigation while this fills the content column — making section switches feel
 * instant instead of frozen on a full server round-trip.
 */
export function LeagueContentSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-8 sm:px-6" aria-hidden>
      <div className="h-7 w-52 rounded bg-foreground/10" />
      <div className="mt-2 h-4 w-72 rounded bg-foreground/5" />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-foreground/5" />
        ))}
      </div>

      <div className="mt-7 h-5 w-32 rounded bg-foreground/10" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-11 rounded-lg bg-foreground/5" />
        ))}
      </div>
    </div>
  );
}
