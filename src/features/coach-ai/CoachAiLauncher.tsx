"use client";

import { useEffect, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { CoachAiChat } from "./CoachAiChat";
import { CoachAiIcon } from "./CoachAiIcon";
import { cn } from "@/lib/utils";

/**
 * Floating Coach AI launcher.
 *
 * Layout responds to viewport (Tailwind sm/lg breakpoints):
 *   - Mobile  (<640):    bottom sheet, ~80vh tall
 *   - Tablet  (640-1024): right-side drawer, full height, ~420 wide
 *   - Desktop (≥1024):   floating window, bottom-right, 420 × 640
 *
 * Fullscreen toggle expands to the entire viewport on any size.
 */
export function CoachAiLauncher({ playbookId = null }: { playbookId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Esc closes (or exits fullscreen first).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (fullscreen) setFullscreen(false);
      else setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, fullscreen]);

  // Lock body scroll when fullscreen on small screens.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    if (fullscreen) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, fullscreen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Coach AI"
        title="Coach AI (beta)"
        className={cn(
          "fixed z-40 flex items-center justify-center rounded-full shadow-lg",
          "bg-primary text-primary-foreground hover:opacity-90 transition",
          "size-12 right-4 bottom-20 sm:bottom-4 sm:right-4",
          open && "hidden",
        )}
      >
        <CoachAiIcon className="size-6" />
        <span className="sr-only">Coach AI</span>
      </button>

      {open && (
        <>
          {/* Backdrop only when fullscreen or on mobile (bottom sheet). */}
          <div
            onClick={() => setOpen(false)}
            className={cn(
              "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity",
              fullscreen ? "block" : "block sm:hidden",
            )}
            aria-hidden="true"
          />

          <div
            role="dialog"
            aria-label="Coach AI chat"
            className={cn(
              "fixed z-50 flex flex-col overflow-hidden bg-surface-raised text-foreground shadow-2xl ring-1 ring-black/10 transition-all",
              fullscreen
                ? "inset-2 rounded-2xl sm:inset-4"
                : [
                    // mobile: bottom sheet
                    "inset-x-2 bottom-2 top-auto h-[80vh] rounded-2xl",
                    // tablet: right drawer (full height)
                    "sm:inset-y-2 sm:right-2 sm:left-auto sm:bottom-auto sm:top-2 sm:h-auto sm:w-[420px] sm:rounded-2xl",
                    // desktop: floating window
                    "lg:inset-auto lg:right-4 lg:bottom-4 lg:top-auto lg:h-[640px] lg:w-[420px]",
                  ].join(" "),
            )}
          >
            <header className="flex items-center gap-2 border-b border-border px-3 py-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CoachAiIcon className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight text-foreground">
                  Coach AI
                </div>
                <div className="text-[11px] leading-tight text-muted">
                  Beta · grounded in your league rules
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFullscreen((v) => !v)}
                  className="rounded-md p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
                  aria-label={fullscreen ? "Exit full screen" : "Full screen"}
                  title={fullscreen ? "Exit full screen" : "Full screen"}
                >
                  {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFullscreen(false);
                    setOpen(false);
                  }}
                  className="rounded-md p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
                  aria-label="Close Coach AI"
                  title="Close"
                >
                  <X className="size-4" />
                </button>
              </div>
            </header>
            <div className="flex-1 min-h-0">
              <CoachAiChat playbookId={playbookId} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
