"use client";

import { CircleCheck } from "lucide-react";

/**
 * Marks a play as genuinely available offline on THIS device — its data and its
 * page are both cached, so it opens with no signal.
 *
 * Deliberately only rendered for plays that are actually ready (see
 * useOfflinePlayReadiness): a missing glyph means "not ready or not checked",
 * never a promise. Over-claiming here is what strands a coach on a sideline.
 */
export function OfflineReadyGlyph({ className }: { className?: string }) {
  const label = "Available offline on this device";
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex shrink-0 items-center text-emerald-600 dark:text-emerald-400 ${className ?? ""}`}
    >
      <CircleCheck className="size-3.5" />
    </span>
  );
}
