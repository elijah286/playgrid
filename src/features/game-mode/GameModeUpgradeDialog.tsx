"use client";

import Link from "next/link";
import { Gamepad2, LineChart, ThumbsUp, Maximize } from "lucide-react";

/**
 * Shown when a free coach taps the Game Mode button. Sells the Team Coach
 * plan by framing Game Mode as a sideline tool that turns called plays into
 * data — full-screen viewing, thumbs + tags, post-game summary saved to the
 * playbook. Primary CTA routes to /pricing.
 */
export function GameModeUpgradeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade to use Game Mode"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-5 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-brand-green text-white">
            <Gamepad2 className="size-5" />
          </span>
          <h2 className="text-lg font-semibold text-foreground">
            Game Mode is a Team Coach feature
          </h2>
        </div>

        <p className="mt-3 text-sm text-muted">
          Game Mode turns your playbook into a sideline tool — and turns every
          called play into data you can learn from after the game.
        </p>

        <ul className="mt-4 space-y-2 text-sm text-foreground">
          <li className="flex items-start gap-2">
            <Maximize className="mt-0.5 size-4 shrink-0 text-muted" />
            <span>
              Full-screen play view with one-tap motion and snap — no menus,
              no hunting.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <ThumbsUp className="mt-0.5 size-4 shrink-0 text-muted" />
            <span>
              Thumbs-up / thumbs-down each call with a quick tag (big play,
              stuffed, penalty…) right from the sideline.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <LineChart className="mt-0.5 size-4 shrink-0 text-muted" />
            <span>
              Save the session with score and notes. Over time you build a
              record of what's actually working in your playbook.
            </span>
          </li>
        </ul>

        <div className="mt-5 flex flex-col gap-2">
          <Link
            href="/pricing?upgrade=game-mode"
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
