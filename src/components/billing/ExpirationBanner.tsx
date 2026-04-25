import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { ExpirationNotice } from "@/lib/billing/expiration-notice";

const TIER_LABELS: Record<"free" | "coach" | "coach_ai", string> = {
  free: "Free",
  coach: "Coach",
  coach_ai: "Coach AI",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ExpirationBanner({ notice }: { notice: ExpirationNotice }) {
  const tierLabel = TIER_LABELS[notice.tier] ?? notice.tier;
  const dateLabel = formatDate(notice.expiresAt);

  const message =
    notice.state === "expired"
      ? `Your ${tierLabel} plan ended on ${dateLabel}. You've lost access to paid features.`
      : notice.source === "comp"
        ? `Your comp ${tierLabel} access ends on ${dateLabel} (${notice.daysLeft} day${notice.daysLeft === 1 ? "" : "s"}).`
        : `Your ${tierLabel} plan is set to cancel on ${dateLabel} (${notice.daysLeft} day${notice.daysLeft === 1 ? "" : "s"}). You'll lose access to paid features.`;

  return (
    <div data-web-only className="border-b border-red-700 bg-red-600 text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 py-2 text-sm">
        <AlertTriangle className="size-4 shrink-0" />
        <p className="flex-1 min-w-[200px] font-medium">{message}</p>
        <Link
          href="/pricing"
          className="inline-flex items-center rounded-lg bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
        >
          {notice.state === "expired" ? "Renew plan" : "Keep my plan"}
        </Link>
      </div>
    </div>
  );
}
