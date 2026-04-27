"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, GraduationCap, Maximize2, Minimize2, X } from "lucide-react";
import { CoachAiChat } from "./CoachAiChat";
import { CoachAiIcon } from "./CoachAiIcon";
import { cn } from "@/lib/utils";

const PLAYBOOK_ROUTE_RE = /^\/playbooks\/([0-9a-f-]{8,})(?:\/|$)/i;

const DEFAULT_W = 420;
const DEFAULT_H = 640;
const EDGE = 16; // gap from viewport edge

/**
 * Floating Coach AI launcher.
 *
 *   - Mobile  (<640):     bottom sheet, ~80vh tall (not draggable)
 *   - Desktop (≥640):     floating window, draggable by header,
 *                         clamped to viewport, sized to never exceed it
 *
 * Fullscreen toggle expands to the entire viewport on any size.
 *
 * Admin / Playbook Training Modes swap in tools that let the agent curate
 * the global or per-playbook KB. Visual cues: amber / sky border + label.
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

  // ── Floating-window position (sm+, non-fullscreen) ─────────────────────────
  // Stored as top-left in viewport coordinates. Null = use default
  // (anchored bottom-right). Once the user drags, we switch to explicit coords
  // and clamp on every viewport resize so the window never escapes the screen.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: DEFAULT_W, h: DEFAULT_H });
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Recompute size + clamp position whenever viewport changes or window opens.
  const reflow = useCallback(() => {
    if (typeof window === "undefined") return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(DEFAULT_W, vw - EDGE * 2);
    const h = Math.min(DEFAULT_H, vh - EDGE * 2);
    setSize({ w, h });
    setPos((p) => {
      if (!p) return p;
      const x = Math.max(EDGE, Math.min(p.x, vw - w - EDGE));
      const y = Math.max(EDGE, Math.min(p.y, vh - h - EDGE));
      return { x, y };
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    reflow();
    window.addEventListener("resize", reflow);
    return () => window.removeEventListener("resize", reflow);
  }, [open, reflow]);

  // Reset position when closed so reopen lands at the default anchor.
  useEffect(() => {
    if (!open) setPos(null);
  }, [open]);

  function onHeaderPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (fullscreen) return;
    if (typeof window === "undefined" || window.innerWidth < 640) return;
    // Only react to plain primary-button drags on the header itself, not on
    // the action buttons (which set their own click handlers).
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    e.preventDefault();
    const rect = dialogRef.current?.getBoundingClientRect();
    const origX = pos?.x ?? rect?.left ?? window.innerWidth - size.w - EDGE;
    const origY = pos?.y ?? rect?.top ?? window.innerHeight - size.h - EDGE;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX, origY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onHeaderPointerMove(e: React.PointerEvent<HTMLElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = Math.max(EDGE, Math.min(d.origX + dx, vw - size.w - EDGE));
    const y = Math.max(EDGE, Math.min(d.origY + dy, vh - size.h - EDGE));
    setPos({ x, y });
  }

  function onHeaderPointerUp(e: React.PointerEvent<HTMLElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  // Inline style applied to the dialog when floating (sm+, non-fullscreen).
  // Mobile and fullscreen use class-based positioning instead.
  const floatStyle: React.CSSProperties | undefined =
    typeof window !== "undefined" && !fullscreen && window.innerWidth >= 640
      ? pos
        ? { left: pos.x, top: pos.y, width: size.w, height: size.h }
        : { right: EDGE, bottom: EDGE, width: size.w, height: size.h }
      : undefined;

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
            ref={dialogRef}
            role="dialog"
            aria-label="Coach AI chat"
            style={floatStyle}
            className={cn(
              "fixed z-50 flex flex-col overflow-hidden rounded-2xl bg-surface-raised text-foreground shadow-2xl ring-1 ring-black/10",
              adminTrainingActive && "ring-2 ring-amber-400",
              playbookTrainingActive && "ring-2 ring-sky-400",
              fullscreen
                ? "inset-2 sm:inset-4"
                : // Mobile bottom sheet — desktop overrides via inline floatStyle.
                  "inset-x-2 bottom-2 top-auto h-[80vh] sm:inset-auto",
            )}
          >
            <header
              onPointerDown={onHeaderPointerDown}
              onPointerMove={onHeaderPointerMove}
              onPointerUp={onHeaderPointerUp}
              onPointerCancel={onHeaderPointerUp}
              className={cn(
                "flex items-center gap-2 border-b px-3 py-2 select-none",
                !fullscreen && "sm:cursor-grab sm:active:cursor-grabbing",
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
