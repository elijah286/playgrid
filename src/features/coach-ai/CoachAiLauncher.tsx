"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { BookOpen, GraduationCap, Maximize2, Minimize2, X } from "lucide-react";
import { CoachAiChat } from "./CoachAiChat";
import { CoachAiIcon } from "./CoachAiIcon";
import { cn } from "@/lib/utils";

const PLAYBOOK_ROUTE_RE = /^\/playbooks\/([0-9a-f-]{8,})(?:\/|$)/i;

const DEFAULT_W   = 420;
const DEFAULT_H   = 640;
const MIN_W       = 320;
const MIN_H       = 400;
const EDGE        = 16;

const FONT_SIZES  = [10, 11, 12, 13, 14, 15, 16, 18, 20] as const;
type FontSize = (typeof FONT_SIZES)[number];

const GRADIENT = "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)";

type WindowPos = { top: number; left: number };

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

/**
 * Floating Coach AI launcher.
 *
 *   - Mobile  (<640):  bottom sheet, ~80vh tall (not draggable / resizable)
 *   - Desktop (≥640):  floating window — draggable by header,
 *                      resizable by bottom-right handle (top-left stays fixed),
 *                      font size A−/A+ in header toolbar
 */
const COACH_CAL_CAPABILITIES = [
  "Generate plays and full playbooks instantly",
  "Strategy feedback vs. specific defenses",
  "Bulk formation edits across your playbook",
  "Adjust plays to your team's skill level",
  "Practice and game scheduling help",
];

export function CoachAiLauncher({
  playbookId: playbookIdProp = null,
  isAdmin = false,
  entitled = true,
}: {
  playbookId?: string | null;
  isAdmin?: boolean;
  entitled?: boolean;
}) {
  const [open,          setOpen]          = useState(false);
  const [fullscreen,    setFullscreen]    = useState(false);
  const [adminMode,     setAdminMode]     = useState(false);
  const [playbookMode,  setPlaybookMode]  = useState(false);
  const [promoOpen,     setPromoOpen]     = useState(false);
  // Pulse stops once the user has acknowledged the button
  const [pulseSeen,     setPulseSeen]     = useState(() =>
    typeof window !== "undefined" && window.localStorage.getItem("coach-cal:promo-seen") === "1"
  );
  const promoRef = useRef<HTMLDivElement>(null);
  const promoBtnRef = useRef<HTMLButtonElement>(null);

  const [size, setSize]       = useState<{ w: number; h: number }>({ w: DEFAULT_W, h: DEFAULT_H });
  const [fontSize, setFontSize] = useState<FontSize>(14);

  // Desktop window position (top-left anchor). Null = use Tailwind fallback (mobile / before init).
  const [windowPos, setWindowPos] = useState<WindowPos | null>(null);

  const pathname   = usePathname();
  const playbookId = useMemo<string | null>(() => {
    if (playbookIdProp) return playbookIdProp;
    const m = pathname?.match(PLAYBOOK_ROUTE_RE);
    return m?.[1] ?? null;
  }, [playbookIdProp, pathname]);

  // Clamp a (w, h) pair to the current viewport, leaving an EDGE margin on
  // both sides. Stays within [MIN, viewport - 2*EDGE]. Caller passes the
  // current viewport so this can run during resize handlers without
  // re-reading window each time.
  function clampSize(
    s: { w: number; h: number },
    vw: number,
    vh: number,
  ): { w: number; h: number } {
    const maxW = Math.max(MIN_W, vw - 2 * EDGE);
    const maxH = Math.max(MIN_H, vh - 2 * EDGE);
    return {
      w: Math.max(MIN_W, Math.min(maxW, s.w)),
      h: Math.max(MIN_H, Math.min(maxH, s.h)),
    };
  }

  // ── Restore persisted state ────────────────────────────────────────────────
  const hasRestored = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem("coach-ai:adminMode")    === "1") setAdminMode(true);
      if (window.localStorage.getItem("coach-ai:playbookMode") === "1") setPlaybookMode(true);
      const savedSize = readStorage<{ w: number; h: number } | null>("coach-ai:window-size", null);
      // Clamp restored size: a window resized large on a bigger display must
      // not render off-screen on a smaller viewport.
      if (savedSize?.w && savedSize?.h) {
        setSize(clampSize(savedSize, window.innerWidth, window.innerHeight));
      }
      const savedFont = readStorage<number>("coach-ai:font-size", 14);
      if (FONT_SIZES.includes(savedFont as FontSize)) setFontSize(savedFont as FontSize);
    } catch { /* ignore */ }
    hasRestored.current = true;
  }, []);

  useEffect(() => { if (hasRestored.current) writeStorage("coach-ai:adminMode",    adminMode ? "1" : "0"); },    [adminMode]);
  useEffect(() => { if (hasRestored.current) writeStorage("coach-ai:playbookMode", playbookMode ? "1" : "0"); }, [playbookMode]);
  useEffect(() => { if (hasRestored.current) writeStorage("coach-ai:window-size",  size); },                     [size]);
  useEffect(() => { if (hasRestored.current) writeStorage("coach-ai:font-size",    fontSize); },                 [fontSize]);

  useEffect(() => { if (!playbookId && playbookMode) setPlaybookMode(false); }, [playbookId, playbookMode]);

  const adminTrainingActive    = isAdmin && adminMode;
  const playbookTrainingActive = !adminTrainingActive && !!playbookId && playbookMode;
  const mode: "normal" | "admin_training" | "playbook_training" =
    adminTrainingActive ? "admin_training" : playbookTrainingActive ? "playbook_training" : "normal";

  // ── Keyboard / scroll lock ─────────────────────────────────────────────────
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

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    if (fullscreen) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, fullscreen]);

  // ── Promo popover: close on outside click ─────────────────────────────────
  useEffect(() => {
    if (!promoOpen) return;
    function onDown(e: MouseEvent) {
      if (
        promoRef.current && !promoRef.current.contains(e.target as Node) &&
        promoBtnRef.current && !promoBtnRef.current.contains(e.target as Node)
      ) setPromoOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [promoOpen]);

  // ── Window position init ──────────────────────────────────────────────────
  // Runs when the window opens on desktop. size is already loaded from localStorage
  // by the restore effect (which runs on mount, before any click).
  const posInitialized = useRef(false);

  useEffect(() => {
    if (!open) {
      posInitialized.current = false;
      setWindowPos(null);
      return;
    }
    if (posInitialized.current || fullscreen) return;
    if (typeof window === "undefined" || window.innerWidth < 640) return;
    posInitialized.current = true;
    // Use current size (may differ from DEFAULT if restored from storage)
    const s = size;
    setWindowPos({
      top:  Math.max(EDGE, window.innerHeight - EDGE - s.h),
      left: Math.max(EDGE, window.innerWidth  - EDGE - s.w),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fullscreen]); // intentionally excludes `size` — we read it at init time only

  useEffect(() => {
    if (fullscreen) setWindowPos(null);
  }, [fullscreen]);

  // ── Clamp size + position on viewport resize ──────────────────────────────
  // Size must clamp first (a viewport that shrunk below the saved size would
  // otherwise leave the window protruding even after position clamping).
  const clampToViewport = useCallback(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    let nextSize = size;
    setSize((s) => {
      nextSize = clampSize(s, vw, vh);
      return nextSize;
    });
    setWindowPos((p) => {
      if (!p) return p;
      return {
        top:  Math.max(EDGE, Math.min(vh - EDGE - nextSize.h, p.top)),
        left: Math.max(EDGE, Math.min(vw - EDGE - nextSize.w, p.left)),
      };
    });
  }, [size]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, [open, clampToViewport]);

  // ── Drag (header) — updates windowPos directly ────────────────────────────
  const dragRef = useRef<{ startX: number; startY: number; origPos: WindowPos } | null>(null);

  function onHeaderPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (fullscreen || window.innerWidth < 640 || !windowPos) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origPos: windowPos };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onHeaderPointerMove(e: React.PointerEvent<HTMLElement>) {
    const d = dragRef.current;
    if (!d) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    setWindowPos({
      top:  Math.max(EDGE, Math.min(vh - EDGE - size.h, d.origPos.top  + (e.clientY - d.startY))),
      left: Math.max(EDGE, Math.min(vw - EDGE - size.w, d.origPos.left + (e.clientX - d.startX))),
    });
  }

  function onHeaderPointerUp(e: React.PointerEvent<HTMLElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  // ── Resize (bottom-right handle) — top-left stays fixed ──────────────────
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  function onResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: size.w, origH: size.h };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const r = resizeRef.current;
    if (!r || !windowPos) return;
    // Max dimensions: don't let the window grow beyond the viewport edge
    const maxW = window.innerWidth  - EDGE - windowPos.left;
    const maxH = window.innerHeight - EDGE - windowPos.top;
    const newW = Math.max(MIN_W, Math.min(maxW, r.origW + (e.clientX - r.startX)));
    const newH = Math.max(MIN_H, Math.min(maxH, r.origH + (e.clientY - r.startY)));
    setSize({ w: newW, h: newH });
  }

  function onResizePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  // Inline style for the dialog window.
  // On desktop with windowPos set: use top+left (top-left anchor so resize expands bottom-right).
  // Fallback: let Tailwind classes handle mobile and the brief moment before windowPos initializes.
  const windowPosStyle: React.CSSProperties = !fullscreen && windowPos
    ? { top: windowPos.top, left: windowPos.left, right: "auto", bottom: "auto", width: size.w, height: size.h }
    : !fullscreen
      ? { width: size.w, height: size.h }
      : {};

  return (
    <>
      {/* ── Launcher button ─────────────────────────────────────────────── */}
      {!entitled ? (
        // Non-subscriber: pulsing CTA button that opens promo popover
        <div className="relative">
          <button
            ref={promoBtnRef}
            type="button"
            onClick={() => {
              setPromoOpen((v) => !v);
              if (!pulseSeen) {
                setPulseSeen(true);
                try { window.localStorage.setItem("coach-cal:promo-seen", "1"); } catch { /* ignore */ }
              }
            }}
            aria-label="Try Coach Cal — your AI coaching partner"
            title="Try Coach Cal free for 7 days"
            className="relative inline-flex size-9 items-center justify-center rounded-full shadow-md transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={{ background: GRADIENT }}
          >
            {!pulseSeen && (
              <span
                className="absolute inset-0 rounded-full animate-ping opacity-60"
                style={{ background: GRADIENT }}
                aria-hidden="true"
              />
            )}
            <CoachAiIcon className="size-5 relative" />
            <span className="sr-only">Try Coach Cal</span>
          </button>

          {promoOpen && (
            <div
              ref={promoRef}
              className="absolute top-full right-0 z-50 mt-2 w-72 rounded-2xl border border-border bg-surface-raised p-4 shadow-xl"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-xl" style={{ background: GRADIENT }}>
                  <CoachAiIcon className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Meet Coach Cal</p>
                  <p className="text-[11px] text-muted">Your AI coaching partner</p>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5">
                {COACH_CAL_CAPABILITIES.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-[12px] text-foreground">
                    <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">✓</span>
                    {c}
                  </li>
                ))}
              </ul>
              <a
                href="/pricing"
                className="mt-4 flex w-full items-center justify-center rounded-xl py-2 text-sm font-semibold text-white shadow transition hover:opacity-90"
                style={{ background: GRADIENT }}
                onClick={() => setPromoOpen(false)}
              >
                Start 7-day free trial
              </a>
              <p className="mt-1.5 text-center text-[10px] text-muted">No charge today · cancel anytime</p>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Coach Cal"
          title="Coach Cal"
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-full shadow-md transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            open && "hidden",
          )}
          style={{ background: GRADIENT }}
        >
          <CoachAiIcon className="size-5" />
          <span className="sr-only">Coach Cal</span>
        </button>
      )}

      {open && typeof document !== "undefined" && createPortal(
        <>
          {/* Backdrop (fullscreen / mobile) */}
          <div
            onClick={() => setOpen(false)}
            className={cn(
              "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity",
              fullscreen ? "block" : "block sm:hidden",
            )}
            aria-hidden="true"
          />

          {/* ── Dialog window ───────────────────────────────────────────── */}
          <div
            role="dialog"
            aria-label="Coach Cal chat"
            style={windowPosStyle}
            className={cn(
              "fixed z-50 flex flex-col overflow-hidden rounded-2xl bg-surface-raised text-foreground shadow-2xl ring-1 ring-black/10",
              adminTrainingActive    && "ring-2 ring-amber-400",
              playbookTrainingActive && "ring-2 ring-sky-400",
              fullscreen
                ? "inset-2 sm:inset-4"
                : [
                    // Mobile: bottom sheet
                    "inset-x-2 bottom-2 top-auto h-[80vh]",
                    // Desktop: position controlled by windowPosStyle inline style;
                    // these classes serve as fallback before windowPos initializes
                    "sm:inset-auto sm:right-4 sm:bottom-4 sm:left-auto sm:top-auto",
                  ].join(" "),
            )}
          >
            {/* ── Header ─────────────────────────────────────────────────── */}
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
              {/* Icon container */}
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg",
                  adminTrainingActive
                    ? "bg-amber-200 text-amber-900"
                    : playbookTrainingActive
                      ? "bg-sky-200 text-sky-900"
                      : "",
                )}
                style={!adminTrainingActive && !playbookTrainingActive ? { background: GRADIENT } : undefined}
              >
                <CoachAiIcon className="size-5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold leading-tight text-foreground">
                  Coach Cal
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
                      : "Your AI coaching partner"}
                </div>
              </div>

              {/* ── Toolbar ──────────────────────────────────────────────── */}
              <div className="ml-auto flex items-center gap-0.5">
                {/* Font size A− / A+ */}
                <div className="mr-1 flex items-center rounded-md bg-surface-inset px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => setFontSize((f) => {
                      const idx = FONT_SIZES.indexOf(f);
                      return idx > 0 ? FONT_SIZES[idx - 1] : f;
                    })}
                    disabled={fontSize === FONT_SIZES[0]}
                    className="rounded px-1 py-0.5 text-[11px] font-semibold text-muted transition hover:text-foreground disabled:opacity-30"
                    title="Decrease font size"
                    aria-label="Decrease font size"
                  >
                    A−
                  </button>
                  <span className="mx-0.5 text-[10px] tabular-nums text-muted/50">{fontSize}</span>
                  <button
                    type="button"
                    onClick={() => setFontSize((f) => {
                      const idx = FONT_SIZES.indexOf(f);
                      return idx < FONT_SIZES.length - 1 ? FONT_SIZES[idx + 1] : f;
                    })}
                    disabled={fontSize === FONT_SIZES[FONT_SIZES.length - 1]}
                    className="rounded px-1 py-0.5 text-[11px] font-semibold text-muted transition hover:text-foreground disabled:opacity-30"
                    title="Increase font size"
                    aria-label="Increase font size"
                  >
                    A+
                  </button>
                </div>

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
                    title={playbookTrainingActive ? "Exit playbook training" : "Playbook training"}
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
                    title={adminTrainingActive ? "Exit admin training" : "Admin training"}
                  >
                    <GraduationCap className="size-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setFullscreen((v) => !v)}
                  className="rounded-md p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
                  title={fullscreen ? "Exit full screen" : "Full screen"}
                >
                  {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => { setFullscreen(false); setOpen(false); }}
                  className="rounded-md p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
                  title="Close"
                >
                  <X className="size-4" />
                </button>
              </div>
            </header>

            {/* ── Chat content ─────────────────────────────────────────── */}
            <div className="flex-1 min-h-0" style={{ fontSize: `${fontSize}px` }}>
              <CoachAiChat playbookId={playbookId} mode={mode} />
            </div>

            {/* ── Resize handle (desktop, non-fullscreen) ──────────────── */}
            {!fullscreen && (
              <div
                onPointerDown={onResizePointerDown}
                onPointerMove={onResizePointerMove}
                onPointerUp={onResizePointerUp}
                onPointerCancel={onResizePointerUp}
                className="absolute bottom-0 right-0 hidden sm:flex size-5 cursor-se-resize items-end justify-end pb-1 pr-1 text-muted/30 hover:text-muted/60 transition-colors"
                title="Drag to resize"
                aria-hidden="true"
              >
                <svg viewBox="0 0 10 10" width={10} height={10} fill="currentColor">
                  <circle cx="8" cy="8" r="1.2" />
                  <circle cx="5" cy="8" r="1.2" />
                  <circle cx="8" cy="5" r="1.2" />
                </svg>
              </div>
            )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
