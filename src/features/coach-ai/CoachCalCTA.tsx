"use client";

import { CoachAiIcon } from "./CoachAiIcon";
import { openCoachCal } from "./openCoachCal";
import {
  ENTRY_POINTS,
  type CoachCalEntryPointId,
  type EntryPointContext,
} from "./entry-points";
import { cn } from "@/lib/utils";

const GRADIENT = "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)";

type Variant = "primary" | "subtle";

/**
 * Shared in-app CTA for opening Coach Cal with a pre-populated, auto-submitted
 * prompt. The visual treatment (gradient + Cal mark) is the recognizable hint
 * that "this button uses AI" and stays consistent across every entry point.
 *
 *   primary — gradient pill, used for hero placements (empty states, big CTAs).
 *   subtle  — light gradient pill, used inline alongside other controls.
 */
export function CoachCalCTA({
  entryPoint,
  context,
  variant = "subtle",
  label,
  className,
  disabled,
}: {
  entryPoint: CoachCalEntryPointId;
  context?: EntryPointContext;
  variant?: Variant;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const config = ENTRY_POINTS[entryPoint];
  const finalLabel = label ?? config.ctaLabel;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => openCoachCal(entryPoint, context)}
      title="Coach Cal can do this for you"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary"
          ? "px-3.5 py-2 text-sm text-foreground shadow-sm hover:shadow"
          : "px-2.5 py-1 text-xs text-foreground ring-1 ring-inset ring-black/5 hover:ring-primary/30",
        className,
      )}
      style={{ background: GRADIENT }}
    >
      <CoachAiIcon className={variant === "primary" ? "size-5" : "size-4"} />
      <span>{finalLabel}</span>
    </button>
  );
}
