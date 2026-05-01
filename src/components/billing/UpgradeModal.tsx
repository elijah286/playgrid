"use client";

import Link from "next/link";
import { Lock, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** Optional secondary action shown above the upgrade CTA. Use for
   *  "go back to your existing thing" alternatives so the modal isn't
   *  a dead-end paywall. */
  secondaryLabel?: string;
  secondaryHref?: string;
};

export function UpgradeModal({
  open,
  onClose,
  title,
  message,
  ctaLabel = "Upgrade",
  ctaHref = "/pricing",
  secondaryLabel,
  secondaryHref,
}: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
      <div className="relative flex w-full max-w-sm flex-col items-center gap-3 rounded-xl bg-surface-raised p-6 text-center shadow-lg ring-1 ring-border">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
        <Lock className="size-6 text-muted" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted">{message}</p>
        {secondaryLabel && secondaryHref && (
          <Link
            href={secondaryHref}
            onClick={onClose}
            className="inline-flex items-center rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-inset"
          >
            {secondaryLabel}
          </Link>
        )}
        <Link
          href={ctaHref}
          data-web-only
          className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
        >
          {ctaLabel}
        </Link>
      </div>
      </div>
    </div>
  );
}
