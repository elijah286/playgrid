"use client";

import { useEffect, useState } from "react";
import { CoachAiIcon } from "@/features/coach-ai/CoachAiIcon";
import { CoachCalCTA } from "@/features/coach-ai/CoachCalCTA";
import { track } from "@/lib/analytics/track";

const DISMISS_KEY = "xo:editor-cal-nudge-dismissed";

/**
 * Proactive, discoverable "let Cal build this play" nudge for the empty-editor
 * moment. Cal isn't beta-gated and every free coach gets 5 free prompts, but
 * the only always-visible entry is a small header icon — so ~85% of new coaches
 * never discover the AI. This puts a one-tap, benefit-led CTA (and the free-
 * prompt count, which was otherwise only visible INSIDE the open chat) in front
 * of a coach staring at a blank play, on both mobile and desktop.
 *
 * Rendered by PlayEditorClient only for free coaches with prompts left, on an
 * empty play (no routes drawn). Dismissible; the dismissal persists in
 * localStorage and is also set when the coach opens Cal from here — once they've
 * discovered Cal, the nudge has done its job.
 */
export function EditorCalNudge({
  freePromptsRemaining,
}: {
  freePromptsRemaining: number;
}) {
  // Start hidden and reveal after mount so the localStorage read doesn't cause
  // a hydration mismatch. Impression is tracked only once it actually shows.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* private mode / storage disabled — just show it */
    }
    if (!dismissed) {
      setVisible(true);
      track({
        event: "coach_cal_cta_impression",
        target: "editor_empty_nudge",
        metadata: { surface: "editor_empty_nudge" },
      });
    }
  }, []);

  function dismiss(reason: "close" | "opened") {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    if (reason === "close") {
      track({
        event: "coach_cal_cta_dismiss",
        target: "editor_empty_nudge",
        metadata: { surface: "editor_empty_nudge" },
      });
    }
    setVisible(false);
  }

  if (!visible) return null;

  const promptWord = freePromptsRemaining === 1 ? "prompt" : "prompts";

  return (
    <div
      className="relative flex items-start gap-3 rounded-xl border border-indigo-200/70 bg-gradient-to-br from-blue-50 to-violet-50 p-3 pr-9 shadow-sm dark:border-indigo-400/20 dark:from-indigo-950/40 dark:to-violet-950/30 sm:items-center"
      role="note"
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/70 ring-1 ring-indigo-200/60 dark:bg-white/10 dark:ring-white/10 sm:mt-0">
        <CoachAiIcon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          New here? Let Cal build this play for you.
        </p>
        <p className="mt-0.5 text-xs leading-snug text-slate-600 dark:text-slate-300">
          Describe your team and Cal drafts a play — formation, routes, and notes
          — in seconds. You have{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {freePromptsRemaining} free {promptWord}
          </span>
          .
        </p>
        <div className="mt-2">
          <CoachCalCTA
            entryPoint="editor_build_play"
            variant="primary"
            label="Build this play with Cal"
            afterClick={() => dismiss("opened")}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => dismiss("close")}
        aria-label="Dismiss"
        className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/60 hover:text-slate-600 dark:hover:bg-white/10"
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
          <path
            d="M6 6l8 8M14 6l-8 8"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
