"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * Generic Team Coach paywall dialog. Used by feature tabs (Calendar, Practice
 * Plans, Game Mode) when a free coach hits a paid action. Mirrors the look of
 * GameModeUpgradeDialog so the upsell feels consistent across the app.
 */
export function TeamCoachUpgradeDialog({
  open,
  onClose,
  title,
  intro,
  bullets,
  upgradeQuery,
  iconBg = "bg-brand-green",
  Icon,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  intro: string;
  bullets: { Icon: LucideIcon; text: string }[];
  upgradeQuery: string;
  iconBg?: string;
  Icon: LucideIcon;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-5 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex size-9 items-center justify-center rounded-lg text-white ${iconBg}`}
          >
            <Icon className="size-5" />
          </span>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        </div>

        <p className="mt-3 text-sm text-muted">{intro}</p>

        <ul className="mt-4 space-y-2 text-sm text-foreground">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <b.Icon className="mt-0.5 size-4 shrink-0 text-muted" />
              <span>{b.text}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col gap-2">
          <Link
            href={`/pricing?upgrade=${upgradeQuery}`}
            data-web-only
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-primary bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            See Team Coach plan
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium text-muted hover:bg-surface-inset hover:text-foreground"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
