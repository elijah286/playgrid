"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, GraduationCap, Maximize2, Minimize2, X } from "lucide-react";
import { CoachAiChat } from "./CoachAiChat";
import { CoachAiIcon } from "./CoachAiIcon";
import { cn } from "@/lib/utils";

const PLAYBOOK_ROUTE_RE = /^\/playbooks\/([0-9a-f-]{8,})(?:\/|$)/i;

/**
 * Floating Coach AI launcher.
 *
 * Layout responds to viewport (Tailwind sm/lg breakpoints):
 *   - Mobile  (<640):    bottom sheet, ~80vh tall
 *   - Tablet  (640-1024): right-side drawer, full height, ~420 wide
 *   - Desktop (≥1024):   floating window, bottom-right, 420 × 640
 *
 * Fullscreen toggle expands to the entire viewport on any size.
 *
 * Admin Training Mode (admin-only) swaps in tools that let the agent
 * curate the global KB. Visual cue: amber border + label.
 */
export function CoachAiLauncher({
  playbookId: playbookIdProp = null,
  isAdmin = false,
}: {
  playbookId?: string | null;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [playbookMode, setPlaybookMode] = useState(false);

  const pathname = usePathname();
  const playbookId = useMemo<string | null>(() => {
    if (playbookIdProp) return playbookIdProp;
    const m = pathname?.match(PLAYBOOK_ROUTE_RE);
    return m?.[1] ?? null;
  }, [playbookIdProp, pathname]);

  // Exit playbook training automatically when the user navigates off the playbook.
  useEffect(() => {
    if (!playbookId && playbookMode) setPlaybookMode(false);
  }, [playbookId, playbookMode]);

  // Modes are mutually exclusive — admin wins.
  const adminTrainingActive = isAdmin && adminMode;
  const playbookTrainingActive = !adminTrainingActive && !!playbookId && playbookMode;
  const trainingActive = adminTrainingActive || playbookTrainingActive;
  const mode: "normal" | "admin_training" | "playbook_training" = adminTrainingActive
    ? "admin_training"
    : playbookTrainingActive
      ? "playbook_training"
      : "normal";

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
          "inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm transition hover:bg-primary/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          open && "hidden",
        )}
      >
        <CoachAiIcon className="size-5" />
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
              adminTrainingActive && "ring-2 ring-amber-400",
              playbookTrainingActive && "ring-2 ring-sky-400",
              fullscreen
                ? "inset-2 rounded-2xl sm:inset-4"
                : [
                    "inset-x-2 bottom-2 top-auto h-[80vh] rounded-2xl",
                    "sm:inset-y-2 sm:right-2 sm:left-auto sm:bottom-auto sm:top-2 sm:h-auto sm:w-[420px] sm:rounded-2xl",
                    "lg:inset-auto lg:right-4 lg:bottom-4 lg:top-auto lg:h-[640px] lg:w-[420px]",
                  ].join(" "),
            )}
          >
            <header
              className={cn(
                "flex items-center gap-2 border-b px-3 py-2",
                adminTrainingActive
                  ? "border-amber-300 bg-amber-50/60 dark:bg-amber-950/30"
                  : playbookTrainingActive
                    ? "border-sky-300 bg-sky-50/60 dark:bg-sky-950/30"
                    : "border-border",
              )}
            >
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-lg",
                  adminTrainingActive
                    ? "bg-amber-200 text-amber-900"
                    : playbookTrainingActive
                      ? "bg-sky-200 text-sky-900"
                      : "bg-primary/10 text-primary",
                )}
              >
                <CoachAiIcon className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight text-foreground">
                  Coach AI
                  {adminTrainingActive && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 ring-1 ring-amber-300 dark:text-amber-200">
                      <GraduationCap className="size-3" /> Training
                    </span>
                  )}
                  {playbookTrainingActive && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-800 ring-1 ring-sky-300 dark:text-sky-200">
                      <BookOpen className="size-3" /> Playbook
                    </span>
                  )}
                </div>
                <div className="text-[11px] leading-tight text-muted">
                  {adminTrainingActive
                    ? "Curating the global knowledge base — confirms before each write."
                    : playbookTrainingActive
                      ? "Curating this playbook's notes — confirms before each write."
                      : "Beta · grounded in your league rules"}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1">
                {playbookId && !adminTrainingActive && (
                  <button
                    type="button"
                    onClick={() => setPlaybookMode((v) => !v)}
                    aria-pressed={playbookTrainingActive}
                    className={cn(
                      "rounded-md p-1.5 transition",
                      playbookTrainingActive
                        ? "bg-sky-500/20 text-sky-800 hover:bg-sky-500/30 dark:text-sky-200"
                        : "text-muted hover:bg-surface-inset hover:text-foreground",
                    )}
                    aria-label={playbookTrainingActive ? "Exit playbook training" : "Enter playbook training"}
                    title={playbookTrainingActive ? "Exit playbook training" : "Playbook training (capture team-specific knowledge)"}
                  >
                    <BookOpen className="size-4" />
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setAdminMode((v) => !v)}
                    aria-pressed={adminTrainingActive}
                    className={cn(
                      "rounded-md p-1.5 transition",
                      adminTrainingActive
                        ? "bg-amber-500/20 text-amber-800 hover:bg-amber-500/30 dark:text-amber-200"
                        : "text-muted hover:bg-surface-inset hover:text-foreground",
                    )}
                    aria-label={adminTrainingActive ? "Exit admin training" : "Enter admin training"}
                    title={adminTrainingActive ? "Exit admin training" : "Admin training (curate global KB)"}
                  >
                    <GraduationCap className="size-4" />
                  </button>
                )}
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
              <CoachAiChat playbookId={playbookId} mode={mode} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
