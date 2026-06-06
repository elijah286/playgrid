"use client";

import { useOfflineGate } from "@/components/offline/OfflineGate";
import { CoachAiIcon } from "./CoachAiIcon";
import { closeCoachCal, openCoachCal } from "./openCoachCal";
import { useCoachCalOpen } from "./useCoachCalOpen";

/**
 * Mobile bottom-nav Cal button. Styled like Instagram's compose
 * button: a svelte circle around the Cal mark that bubbles slightly
 * above the nav row, distinguishing the AI chat from the flat tab
 * buttons next to it. Highlights when the chat panel is open.
 *
 * Use this in any mobile bottom nav that wants a Cal slot — it
 * dispatches `coach-cal:open` (or `:close` if already open) so the
 * launcher (mounted with acceptGlobalCommands somewhere on the page)
 * catches it. Tapping the button toggles the panel.
 */
export function CalNavButton() {
  const isActive = useCoachCalOpen();
  const { isGated, reason } = useOfflineGate();
  return (
    <button
      type="button"
      onClick={() => (isActive ? closeCoachCal() : openCoachCal())}
      disabled={isGated}
      aria-label="Open Coach Cal"
      aria-current={isActive ? "true" : undefined}
      title={isGated ? reason : "Coach Cal"}
      className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold tracking-tight transition-colors ${
        isActive ? "text-primary" : "text-muted hover:text-foreground"
      } ${isGated ? "opacity-50" : ""}`}
    >
      <span
        className={`-mt-3 inline-flex size-9 items-center justify-center rounded-full ring-1 transition-shadow ${
          isActive
            ? "ring-primary/40 shadow-md"
            : "ring-black/10 shadow-sm"
        }`}
        style={{
          background: "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)",
        }}
      >
        <CoachAiIcon className="size-5" />
      </span>
      <span className="truncate">Cal</span>
    </button>
  );
}
