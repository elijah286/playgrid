"use client";

import { MessageCirclePlus } from "lucide-react";
import { OPEN_FEEDBACK_EVENT } from "@/components/feedback/FeedbackWidget";
import { cn } from "@/lib/utils";

type Variant = "nav" | "sheet";

/**
 * Dispatches the global `app:open-feedback` event so the
 * [[FeedbackWidget]] (mounted in the dashboard/editor layouts) opens its
 * compose dialog. Use this in the top nav and the mobile More menu — the
 * widget remains the single source of truth for compose/submit logic.
 */
export function FeedbackTrigger({
  variant = "nav",
  onClick,
}: {
  variant?: Variant;
  onClick?: () => void;
}) {
  function trigger() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(OPEN_FEEDBACK_EVENT));
    }
    onClick?.();
  }

  if (variant === "sheet") {
    return (
      <button
        type="button"
        onClick={trigger}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-surface-inset"
      >
        <MessageCirclePlus className="size-4 text-muted" aria-hidden />
        Give feedback
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={trigger}
      className={cn(
        "whitespace-nowrap text-sm text-muted transition-colors hover:text-foreground",
      )}
    >
      Give feedback
    </button>
  );
}
