/**
 * Route-level loading UI for /pricing. Shown by Next.js the instant the
 * user taps any link to this route, while the page's server component
 * runs auth + entitlement + trial-eligibility + site-settings queries.
 *
 * Without this, navigating from the Coach Cal preview ("Upgrade to
 * Coach Pro") looks broken: Cal closes, the previous page stays on
 * screen for 1–3s, and the user re-clicks thinking nothing happened.
 * The skeleton + progress bar give an unambiguous "we heard you,
 * we're loading" signal as soon as the click registers.
 *
 * Layout mirrors the real /pricing page (header band, three pricing
 * cards) so the visual diff at swap-in is small.
 */
export default function PricingLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      {/* Indeterminate progress bar — pinned to top, slides continuously
          while the server render streams. Same treatment used on
          /playbooks/[id] loading; matches sites users already know. */}
      <div
        aria-hidden
        className="native-safe-top fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden bg-primary/10"
      >
        <div className="route-progress-bar h-full w-1/3 rounded-r-full bg-primary" />
      </div>

      {/* Header */}
      <div>
        <div className="h-4 w-20 animate-pulse rounded bg-border" />
        <div className="mt-3 h-8 w-32 animate-pulse rounded-lg bg-border" />
        <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-border" />
      </div>

      {/* Monthly/Annual toggle placeholder */}
      <div className="flex justify-center">
        <div className="h-9 w-40 animate-pulse rounded-lg bg-border" />
      </div>

      {/* Three pricing cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <PricingCardSkeleton key={i} highlighted={i === 2} />
        ))}
      </div>

      <div className="mx-auto h-4 w-32 animate-pulse rounded bg-border" />
    </div>
  );
}

function PricingCardSkeleton({ highlighted }: { highlighted: boolean }) {
  return (
    <div
      className={[
        "flex flex-col rounded-2xl border p-6",
        highlighted
          ? "border-primary/40 bg-primary/[0.03] ring-2 ring-primary/20"
          : "border-border bg-surface-raised",
      ].join(" ")}
    >
      {/* Plan name + tagline */}
      <div className="mb-4">
        <div className="h-5 w-28 animate-pulse rounded bg-border" />
        <div className="mt-2 h-3 w-48 max-w-full animate-pulse rounded bg-border" />
      </div>

      {/* Price */}
      <div className="mb-5 flex items-baseline gap-2">
        <div className="h-9 w-16 animate-pulse rounded bg-border" />
        <div className="h-3 w-12 animate-pulse rounded bg-border" />
      </div>

      {/* Feature rows */}
      <ul className="mb-6 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="flex items-start gap-2">
            <div className="mt-1 size-4 shrink-0 animate-pulse rounded bg-border" />
            <div
              className="h-3 animate-pulse rounded bg-border"
              style={{ width: `${60 + ((i * 13) % 35)}%` }}
            />
          </li>
        ))}
      </ul>

      {/* CTA button */}
      <div className="mt-auto h-9 w-full animate-pulse rounded-lg bg-border" />
    </div>
  );
}
