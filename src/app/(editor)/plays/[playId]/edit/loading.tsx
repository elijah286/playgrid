import { Calendar, ListChecks, MessageCircle, MoreHorizontal } from "lucide-react";

/**
 * Route-level loading UI shown by Next.js while the editor's server
 * page is fetching play / formation / settings data. Renders instantly
 * on tap so coaches get visual confirmation that the editor is loading
 * — without it, the play card felt unresponsive for the half-second of
 * server work.
 *
 * Mirrors the editor's mobile shell: orange chrome at top, a skeleton
 * field, a skeleton notes card, and the bottom nav. The bottom-nav
 * skeleton uses the SAME labels + structure as the real
 * EditorBottomNav so the toolbar appears continuous through the
 * navigation transition rather than collapsing to anonymous dots.
 */
export default function EditorLoading() {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-2 pb-20 sm:pb-0">
      {/* Mobile-only orange playbook chrome placeholder. The real chrome
          fills in playbook name + initial once data loads. Outer
          bg-surface pt-3/pb-3 mirrors EditorPlaybookChrome so the URL
          bar tints dark and the banner has breathing room below. */}
      <div className="native-safe-top sticky top-0 z-30 -mx-6 bg-surface px-6 pb-3 pt-3 sm:hidden">
        <div
          className="-mx-6 -mt-3 flex items-center gap-2 px-4 py-3"
          style={{ backgroundColor: "#F26522" }}
        >
          <div className="size-9 rounded-lg bg-white/20" aria-hidden />
          <div className="size-9 rounded-lg bg-white/30" aria-hidden />
          <div className="h-4 flex-1 rounded bg-white/30" aria-hidden />
        </div>
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

      {/* Bottom-nav skeleton — matches the real EditorBottomNav's
          label set so the toolbar reads as continuous through the
          navigation transition. Disabled (opacity-50) so it's clearly
          a placeholder; real labels become live once the page mounts. */}
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
