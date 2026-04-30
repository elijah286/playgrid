"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { BookOpen, GraduationCap, Maximize2, Minimize2, Sparkles, X } from "lucide-react";
import { CoachAiChat } from "./CoachAiChat";
import { CoachAiIcon } from "./CoachAiIcon";
import { usePlaybookAnchor } from "./playbook-anchor";
import { cn } from "@/lib/utils";

const PLAYBOOK_ROUTE_RE = /^\/playbooks\/([0-9a-f-]{8,})(?:\/|$)/i;
const PLAY_ROUTE_RE = /^\/plays\/([0-9a-f-]{8,})(?:\/|$)/i;

const DEFAULT_W   = 420;
const DEFAULT_H   = 640;
const MIN_W       = 320;
const MIN_H       = 400;
const EDGE        = 16;

const FONT_SIZES  = [10, 11, 12, 13, 14, 15, 16, 18, 20] as const;
type FontSize = (typeof FONT_SIZES)[number];

const GRADIENT = "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)";

// Re-pulse the non-subscriber promo button after this long since the last
// dismissal — keeps Coach Cal discoverable without being naggy.
const PROMO_REPULSE_MS = 14 * 24 * 60 * 60 * 1000;

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
type CoachCalDemo = { user: string; cal: string };

const COACH_CAL_DEMOS: CoachCalDemo[] = [
  {
    user: "Draw me a curl-flat against Cover-3.",
    cal: "Done — here's the diagram with reads. Want me to add it to your playbook?",
  },
  {
    user: "What plays beat a 5-2 defense?",
    cal: "Try Stick, Curl-Flat, and Slants — your QB has the most time on those fronts.",
  },
  {
    user: "Build a 60-min practice for Tuesday.",
    cal: "10 warm-up · 20 individual · 20 team install · 10 conditioning. Saved to Practice Plans.",
  },
  {
    user: "Schedule our game vs Riverside, Sat 2 PM.",
    cal: "Added to Calendar with a 24-hr reminder. RSVP link sent to roster.",
  },
  {
    user: "Adjust this play for a younger team.",
    cal: "Simplified routes and added a hot read. Want me to apply across the playbook?",
  },
];

/** Path-aware lead — what Coach Cal can most usefully help with given where
 *  the user is right now. Returns a fragment that follows "Coach Cal can". */
function leadForPath(pathname: string | null): string {
  if (!pathname) return "help you build your playbook, plan practices, and more.";
  if (/^\/plays\/[^/]+\/edit/.test(pathname)) {
    return "draw this play, suggest counters, or tune it for your team.";
  }
  if (/^\/playbooks\/[^/]+\/print/.test(pathname)) {
    return "design call sheets and wristbands you can print today.";
  }
  if (/^\/playbooks\/[^/]+/.test(pathname)) {
    return "build out this playbook, plan practices, and schedule games.";
  }
  if (pathname === "/home" || pathname.startsWith("/home")) {
    return "build playbooks, plan practices, and run your season.";
  }
  return "help you build your playbook, plan practices, and schedule games.";
}

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
  // Pulse stops once the user has clicked the button, then re-arms after
  // PROMO_REPULSE_MS so users who dismissed once still get a nudge later.
  const [pulseSeen,     setPulseSeen]     = useState(() => {
    if (typeof window === "undefined") return false;
    const raw = window.localStorage.getItem("coach-cal:promo-seen-at");
    if (!raw) {
      // Legacy "1" sentinel from earlier versions — treat as just-seen.
      return window.localStorage.getItem("coach-cal:promo-seen") === "1";
    }
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < PROMO_REPULSE_MS;
  });
  const promoRef = useRef<HTMLDivElement>(null);
  const promoBtnRef = useRef<HTMLButtonElement>(null);

  const [size, setSize]       = useState<{ w: number; h: number }>({ w: DEFAULT_W, h: DEFAULT_H });
  const [fontSize, setFontSize] = useState<FontSize>(14);

  // Desktop window position (top-left anchor). Null = use Tailwind fallback (mobile / before init).
  const [windowPos, setWindowPos] = useState<WindowPos | null>(null);

  const pathname   = usePathname();
  // Anchor published by the current page (playbook detail page, play
  // editor, etc). Lets us keep the playbook scope stable when the URL
  // doesn't include the playbook id — e.g. on /plays/<playId>.
  const anchor = usePlaybookAnchor();
  const playbookId = useMemo<string | null>(() => {
    if (playbookIdProp) return playbookIdProp;
    const m = pathname?.match(PLAYBOOK_ROUTE_RE);
    if (m?.[1]) return m[1];
    return anchor?.id ?? null;
  }, [playbookIdProp, pathname, anchor?.id]);
  const playId = useMemo<string | null>(() => {
    const m = pathname?.match(PLAY_ROUTE_RE);
    return m?.[1] ?? null;
  }, [pathname]);
  // Display values for the chat header. Only show when we have an anchor
  // for the same playbook the chat is currently scoped to.
  const anchorMatchesScope = !!anchor && !!playbookId && anchor.id === playbookId;
  const anchoredName = anchorMatchesScope ? anchor!.name ?? null : null;
  const anchoredColor = anchorMatchesScope ? anchor!.color ?? null : null;

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
    // Skip drag when the pointer lands on something interactive or inside the
    // scrollable chat content; those areas need their own pointer behaviour.
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, [role='button'], [data-no-drag]")) return;
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
                try { window.localStorage.setItem("coach-cal:promo-seen-at", String(Date.now())); } catch { /* ignore */ }
              }
            }}
            aria-label="Try Coach Cal — your AI coaching partner"
            title="Try Coach Cal free for 7 days"
            className="relative inline-flex size-9 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={{ background: GRADIENT }}
          >
            {!pulseSeen && (
              <span
                className="absolute inset-0 rounded-lg animate-ping opacity-40"
                style={{ background: GRADIENT }}
                aria-hidden="true"
              />
            )}
            <CoachAiIcon className="relative size-6" />
            {/* The "+1" sparkle is a true notification cue — only show it
                until the user has acknowledged the promo, then let the
                button settle into the cluster like a normal action. */}
            {!pulseSeen && (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full bg-white text-primary shadow ring-1 ring-primary/20"
              >
                <Sparkles className="size-2.5" />
              </span>
            )}
            <span className="sr-only">Try Coach Cal AI</span>
          </button>

          {promoOpen && (
            <div
              ref={promoRef}
              className="absolute top-full right-0 z-50 mt-2 w-80 rounded-2xl border border-border bg-surface-raised p-4 shadow-xl"
            >
              <div className="flex items-center gap-2.5">
                {/* The icon now ships its own gradient tile — no wrapper. */}
                <CoachAiIcon className="size-8 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">Meet Coach Cal</p>
                  <p className="text-[11px] text-muted">Your AI coaching partner</p>
                </div>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-foreground">
                Coach Cal can {leadForPath(pathname)}
              </p>
              <CoachCalDemoStrip />
              <a
                href="/pricing"
                className="mt-3 flex w-full items-center justify-center rounded-xl py-2 text-sm font-semibold text-white shadow transition hover:opacity-90"
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
          title="Coach Cal — your AI coaching partner"
          className={cn(
            "relative inline-flex size-9 items-center justify-center rounded-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            open && "hidden",
          )}
          style={{ background: GRADIENT }}
        >
          <CoachAiIcon className="relative size-6" />
          <span className="sr-only">Coach Cal AI</span>
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
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={onHeaderPointerUp}
            onPointerCancel={onHeaderPointerUp}
            className={cn(
              "fixed z-50 flex flex-col overflow-hidden rounded-2xl bg-surface-raised text-foreground shadow-2xl ring-1 ring-black/10 select-none",
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
            {/* Drag handlers live on the dialog wrapper so the whole window
                acts as a drag handle (excluding interactive controls and the
                scrollable chat area, which carry data-no-drag). */}
            <header
              className={cn(
                "flex items-center gap-2 border-b px-3 py-2",
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
                {/* Bare sparkle — wrapper provides the colored tile. */}
                <CoachAiIcon className="size-5 text-primary" bare />
              </div>

              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "inline-block text-sm font-semibold leading-tight text-foreground",
                    anchoredName && "border-b-[2px] pb-0.5",
                  )}
                  style={
                    anchoredName && anchoredColor
                      ? { borderBottomColor: anchoredColor }
                      : undefined
                  }
                >
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
                <div className="truncate text-[11px] leading-tight text-muted">
                  {adminTrainingActive
                    ? "Curating the global knowledge base — confirms before each write."
                    : playbookTrainingActive
                      ? "Curating this playbook's notes — confirms before each write."
                      : anchoredName
                        ? `Anchored to ${anchoredName}`
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
            <div
              data-no-drag
              className="flex-1 min-h-0"
              style={{ fontSize: `${fontSize}px` }}
            >
              <CoachAiChat playbookId={playbookId} playId={playId} mode={mode} />
            </div>

            {/* ── Resize handle (desktop, non-fullscreen) ──────────────── */}
            {!fullscreen && (
              <div
                data-no-drag
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

/**
 * Animated chat preview shown to non-entitled users in the promo popover.
 * Cycles through scripted user/assistant pairs every ~3.5s, fading between
 * them so the popover feels alive without being demanding. Pure decoration —
 * doesn't talk to the API.
 */
function CoachCalDemoStrip() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % COACH_CAL_DEMOS.length);
    }, 3500);
    return () => clearInterval(id);
  }, []);
  const demo = COACH_CAL_DEMOS[idx];
  return (
    <div
      key={idx}
      className="mt-3 space-y-1.5 rounded-xl bg-surface-inset/60 p-2.5 [animation:fadein_400ms_ease-out]"
      style={{
        // inline keyframe via style tag below — keep this self-contained
      }}
    >
      <style>{`@keyframes fadein { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }`}</style>
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-2.5 py-1.5 text-[11px] leading-snug text-white">
          {demo.user}
        </div>
      </div>
      <div className="flex items-end gap-1.5">
        <div
          className="flex size-5 shrink-0 items-center justify-center rounded-lg"
          style={{ background: GRADIENT }}
        >
          <CoachAiIcon className="size-3 text-primary" bare />
        </div>
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-raised px-2.5 py-1.5 text-[11px] leading-snug text-foreground ring-1 ring-border">
          {demo.cal}
        </div>
      </div>
      <div className="flex justify-center gap-1 pt-0.5">
        {COACH_CAL_DEMOS.map((_, i) => (
          <span
            key={i}
            className={cn(
              "size-1 rounded-full transition-colors",
              i === idx ? "bg-primary" : "bg-muted/30",
            )}
          />
        ))}
      </div>
    </div>
  );
}
