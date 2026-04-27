"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CoachAiIcon } from "./CoachAiIcon";

const STORAGE_KEY = "coach-cal:playbook-cta-dismissed";
const GRADIENT = "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)";

/**
 * First-visit dismissible banner shown on the playbook editor for logged-in
 * users who don't yet have Coach Pro. Renders only on desktop (sm+).
 *
 * `show` is computed server-side: coach_ai beta is "all" AND user lacks the tier.
 */
export function CoachCalPlaybookCta({ show }: { show: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    // Small delay so it doesn't fire instantly on page load
    const id = setTimeout(() => setVisible(true), 1800);
    return () => clearTimeout(id);
  }, [show]);

  function dismiss() {
    setVisible(false);
    try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Try Coach Cal"
      className="fixed bottom-6 left-6 z-40 hidden sm:flex w-80 flex-col rounded-2xl border border-border bg-surface-raised shadow-xl"
    >
      {/* Gradient accent bar */}
      <div className="h-1 w-full rounded-t-2xl" style={{ background: GRADIENT }} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-xl"
              style={{ background: GRADIENT }}
            >
              <CoachAiIcon className="size-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Meet Coach Cal</p>
              <p className="text-[11px] text-muted">Your AI coaching partner</p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded p-0.5 text-muted hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-foreground">
          Generate plays, adjust formations to your team&apos;s skill level, get
          strategy feedback vs. specific defenses — all from a single chat.
        </p>

        <a
          href="/pricing"
          onClick={dismiss}
          className="mt-3 flex w-full items-center justify-center rounded-xl py-2 text-sm font-semibold text-white shadow transition hover:opacity-90"
          style={{ background: GRADIENT }}
        >
          Start 7-day free trial
        </a>
        <p className="mt-1.5 text-center text-[10px] text-muted">
          No charge today · cancel anytime
        </p>
      </div>
    </div>
  );
}
