"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useInboxBadge } from "@/features/dashboard/InboxBadgeContext";

/**
 * Shell-native alerts bell. Reuses the same badge count as production
 * (useInboxBadge — 60s poll), but links to the in-shell /app/alerts instead of
 * opening the production drawer, so the coach stays in the new shell. Urgency
 * is shown visually (amber) as well as in the label.
 */
export function ShellAlertsButton() {
  const { count, urgent } = useInboxBadge();
  return (
    <Link
      href="/app/alerts"
      aria-label={count > 0 ? `Alerts — ${count}${urgent ? " urgent" : ""}` : "Alerts"}
      className="relative inline-flex size-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-inset hover:text-foreground"
    >
      <Bell className="size-5" aria-hidden />
      {count > 0 && (
        <span
          className={`absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white ring-2 ring-surface-raised ${
            urgent ? "bg-warning" : "bg-primary"
          }`}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
