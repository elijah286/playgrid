/**
 * Route-level loading UI shown by Next.js while the editor's server
 * page is fetching play / formation / settings data. Renders instantly
 * on tap so coaches get visual confirmation that the editor is loading
 * — without it, the play card felt unresponsive for the half-second of
 * server work.
 *
 * Mirrors the editor's mobile shell: orange chrome at top, a skeleton
 * field, a skeleton notes card, and the bottom nav. Real content
 * swaps in once page.tsx finishes server-rendering.
 */
export default function EditorLoading() {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-2 pb-20 sm:pb-0">
      {/* Mobile-only orange playbook chrome placeholder. The real chrome
          fills in playbook name + initial once data loads. */}
      <div
        className="sticky top-0 z-30 -mx-6 -mt-5 flex items-center gap-2 px-4 py-3 sm:hidden"
        style={{ backgroundColor: "#F26522" }}
      >
        <div className="size-9 rounded-lg bg-white/20" aria-hidden />
        <div className="size-9 rounded-lg bg-white/30" aria-hidden />
        <div className="h-4 flex-1 rounded bg-white/30" aria-hidden />
      </div>

      {/* Field skeleton: matches the field-viewport mobile cap so the
          placeholder doesn't jump in size when the real canvas mounts. */}
      <div className="mx-auto flex w-full items-center justify-center">
        <div
          className="field-viewport relative w-full overflow-hidden rounded-md bg-surface-inset"
          style={{ aspectRatio: "2 / 1" }}
        >
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        </div>
      </div>

      {/* Notes card skeleton */}
      <div className="rounded-lg border border-border bg-surface-raised p-3">
        <div className="mb-2 h-4 w-24 rounded bg-surface-inset" aria-hidden />
        <div className="h-12 rounded bg-surface-inset" aria-hidden />
      </div>

      {/* Bottom nav skeleton — keeps the footer chrome stable across
          the navigation transition so users don't see it pop in. */}
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

function Spinner() {
  return (
    <svg
      className="size-6 animate-spin text-primary"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeOpacity="0.25"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
