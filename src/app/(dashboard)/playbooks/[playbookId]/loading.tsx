import { Calendar, ListChecks, MessageCircle, MoreHorizontal } from "lucide-react";

/**
 * Route-level loading UI shown by Next.js while the playbook page is
 * fetching plays / formations / roster / settings. Renders instantly
 * on tap (e.g. when the user taps "Plays" in the editor footer to go
 * back) so the navigation feels as fast as switching tabs on the
 * playbook page itself.
 *
 * Mirrors the playbook's mobile shell: orange chrome at top, a
 * skeleton toolbar and play card grid, and the bottom nav. The bottom
 * nav skeleton uses the SAME labels + structure as the real
 * PlaybookBottomNav so the toolbar reads as continuous through the
 * navigation transition rather than collapsing to anonymous dots.
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

      {/* Bottom-nav skeleton — matches the real PlaybookBottomNav's
          label set so the toolbar reads as continuous through the
          navigation transition. Disabled (opacity-60) so it's clearly
          a placeholder. */}
      <nav
        aria-label="Loading"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface-raised opacity-60 sm:hidden"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <NavSkeleton label="Plays" Icon={ListChecks} />
        <NavSkeleton label="Chat" Icon={MessageCircle} />
        <NavSkeleton label="Calendar" Icon={Calendar} />
        <NavSkeleton label="More" Icon={MoreHorizontal} />
      </nav>
    </div>
  );
}

function NavSkeleton({ label, Icon }: { label: string; Icon: React.ElementType }) {
  return (
    <div className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold tracking-tight text-muted">
      <Icon className="size-5" aria-hidden />
      <span className="truncate">{label}</span>
    </div>
  );
}
