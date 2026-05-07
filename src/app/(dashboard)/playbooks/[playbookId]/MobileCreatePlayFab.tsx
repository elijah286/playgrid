"use client";

import { useEffect, useState } from "react";
import { Layers, Plus, X } from "lucide-react";
import { CoachAiIcon } from "@/features/coach-ai/CoachAiIcon";
import { openCoachCal } from "@/features/coach-ai/openCoachCal";

/**
 * Mobile-only floating "+" button for creating a new play, plus the
 * bottom sheet it opens. Replaces the buried "New play" entry in the
 * header kebab — coaches kept missing it because the kebab was visually
 * just an overflow icon.
 *
 * Sheet offers two equally-weighted CTAs side-by-side:
 *   - Pick a formation → existing formation picker
 *   - Generate with Cal → existing Coach Cal entry point
 *
 * The FAB sits ~16px above the bottom nav (which is ~52px tall + safe
 * area). Hidden on `sm:` breakpoint and up — desktop has dedicated
 * "New play" buttons in the toolbar already.
 */
export function MobileCreatePlayFab({
  onPickFormation,
  isViewer,
  creating,
  showCoachCal,
}: {
  onPickFormation: () => void;
  isViewer: boolean;
  creating: boolean;
  /** Hide the Cal CTA when the user has no Coach Cal access at all
   *  (preserves the "Pick a formation" path as a single full-width tile). */
  showCoachCal: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Close the sheet on Escape so it behaves like the other modal sheets
  // in the app (More-sheet in the bottom nav, formation picker, etc.)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (isViewer) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Create new play"
        title="New play"
        disabled={creating}
        // Extended FAB pattern (Material Design): pill shape with an
        // icon + label so coaches don't have to guess what the "+"
        // does. Stays right-anchored above the bottom nav.
        className="fixed right-4 z-30 inline-flex h-14 items-center gap-2 rounded-full bg-primary pl-4 pr-5 text-base font-semibold text-primary-foreground shadow-elevated ring-1 ring-primary/30 transition-transform active:scale-95 disabled:opacity-60 sm:hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
      >
        <Plus className="size-6" aria-hidden />
        <span>New play</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Create new play"
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div
            className="relative w-full rounded-t-2xl border-t border-border bg-surface-raised p-4 shadow-2xl"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}
          >
            <div
              className="mx-auto mb-3 mt-1 h-1 w-10 rounded-full bg-border"
              aria-hidden
            />
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">New play</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-muted hover:bg-surface-inset hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted">
              Start from a formation, or let Coach Cal generate one for you.
            </p>
            <div className={`grid gap-3 ${showCoachCal ? "grid-cols-2" : "grid-cols-1"}`}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPickFormation();
                }}
                disabled={creating}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-base px-3 py-5 text-center transition-colors hover:bg-surface-inset disabled:opacity-50"
              >
                <Layers className="size-6 text-primary" aria-hidden />
                <span className="text-sm font-bold text-foreground">
                  Pick a formation
                </span>
                <span className="text-xs leading-snug text-muted">
                  Start from a saved layout
                </span>
              </button>
              {showCoachCal && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    openCoachCal("playbook_generate_starter");
                  }}
                  className="flex flex-col items-center gap-2 rounded-xl border border-slate-900/10 px-3 py-5 text-center transition-shadow hover:shadow"
                  style={{
                    background:
                      "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)",
                    color: "#0f172a",
                  }}
                >
                  <CoachAiIcon className="size-6" />
                  <span className="text-sm font-bold">Generate with Cal</span>
                  <span className="text-xs leading-snug opacity-80">
                    AI-powered creation
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
