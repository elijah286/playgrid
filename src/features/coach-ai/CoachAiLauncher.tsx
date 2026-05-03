"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  AppWindow,
  Check,
  ChevronDown,
  GraduationCap,
  Maximize2,
  Minimize2,
  PanelRight,
  Sparkles,
  X,
} from "lucide-react";
import { CoachAiChat } from "./CoachAiChat";
import { CoachAiIcon } from "./CoachAiIcon";
import { usePlaybookAnchor } from "./playbook-anchor";
import { listPlaybooksAction, type PlaybookRow } from "@/app/actions/playbooks";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics/track";

const PLAYBOOK_ROUTE_RE = /^\/playbooks\/([0-9a-f-]{8,})(?:\/|$)/i;
const PLAY_ROUTE_RE    = /^\/plays\/([0-9a-f-]{8,})(?:\/|$)/i;

const DEFAULT_W    = 420;
const DEFAULT_H    = 640;
const MIN_W        = 320;
const MIN_H        = 400;
const EDGE         = 16;
const DEFAULT_DOCK_W = 380;
const MIN_DOCK_W     = 280;
const MAX_DOCK_W     = 680;

const FONT_SIZES  = [10, 11, 12, 13, 14, 15, 16, 18, 20] as const;
type FontSize = (typeof FONT_SIZES)[number];

const GRADIENT = "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)";

const PROMO_REPULSE_MS = 14 * 24 * 60 * 60 * 1000;

type WindowPos  = { top: number; left: number };
type PanelMode  = "float" | "docked" | "fullscreen";

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

function hexToRgba(hex: string | null | undefined, alpha: number): string | null {
  if (!hex) return null;
  const h = hex.trim().replace(/^#/, "");
  if (h.length !== 3 && h.length !== 6) return null;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
  const [panelMode,     setPanelMode]     = useState<PanelMode>("float");
  const [adminMode,     setAdminMode]     = useState(false);
  const [promoOpen,     setPromoOpen]     = useState(false);
  const [pulseSeen,     setPulseSeen]     = useState(() => {
    if (typeof window === "undefined") return false;
    const raw = window.localStorage.getItem("coach-cal:promo-seen-at");
    if (!raw) {
      return window.localStorage.getItem("coach-cal:promo-seen") === "1";
    }
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < PROMO_REPULSE_MS;
  });
  const promoRef    = useRef<HTMLDivElement>(null);
  const promoBtnRef = useRef<HTMLButtonElement>(null);

  const [size,       setSize]       = useState<{ w: number; h: number }>({ w: DEFAULT_W, h: DEFAULT_H });
  const [dockedWidth, setDockedWidth] = useState(DEFAULT_DOCK_W);
  const [fontSize, setFontSize] = useState<FontSize>(14);

  const [contextOpen,    setContextOpen]    = useState(false);
  const [playbookList,   setPlaybookList]   = useState<PlaybookRow[] | null>(null);
  const [loadingPlaybooks, setLoadingPlaybooks] = useState(false);
  const contextPopoverRef = useRef<HTMLDivElement>(null);
  const contextBtnRef     = useRef<HTMLButtonElement>(null);

  const [windowPos, setWindowPos] = useState<WindowPos | null>(null);

  const pathname = usePathname();
  const anchor   = usePlaybookAnchor();
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

  const anchorMatchesScope = !!anchor && !!playbookId && anchor.id === playbookId;
  const anchoredName  = anchorMatchesScope ? anchor!.name  ?? null : null;
  const anchoredColor = anchorMatchesScope ? anchor!.color ?? null : null;

  function clampSize(s: { w: number; h: number }, vw: number, vh: number) {
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
      if (window.localStorage.getItem("coach-ai:adminMode") === "1") setAdminMode(true);
      try { window.localStorage.removeItem("coach-ai:playbookMode"); } catch { /* ignore */ }
      const savedSize = readStorage<{ w: number; h: number } | null>("coach-ai:window-size", null);
      if (savedSize?.w && savedSize?.h) {
        setSize(clampSize(savedSize, window.innerWidth, window.innerHeight));
      }
      const savedFont = readStorage<number>("coach-ai:font-size", 14);
      if (FONT_SIZES.includes(savedFont as FontSize)) setFontSize(savedFont as FontSize);
      const savedMode = readStorage<string>("coach-ai:panel-mode", "float");
      if (savedMode === "float" || savedMode === "docked") setPanelMode(savedMode as PanelMode);
      const savedDockW = readStorage<number>("coach-ai:dock-width", DEFAULT_DOCK_W);
      if (savedDockW >= MIN_DOCK_W && savedDockW <= MAX_DOCK_W) setDockedWidth(savedDockW);
    } catch { /* ignore */ }
    hasRestored.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (hasRestored.current) writeStorage("coach-ai:adminMode",   adminMode ? "1" : "0"); }, [adminMode]);
  useEffect(() => { if (hasRestored.current) writeStorage("coach-ai:window-size", size); },                  [size]);
  useEffect(() => { if (hasRestored.current) writeStorage("coach-ai:font-size",   fontSize); },              [fontSize]);
  useEffect(() => { if (hasRestored.current) writeStorage("coach-ai:dock-width",  dockedWidth); },           [dockedWidth]);
  useEffect(() => {
    if (!hasRestored.current) return;
    if (panelMode === "float" || panelMode === "docked") {
      writeStorage("coach-ai:panel-mode", panelMode);
    }
  }, [panelMode]);

  const adminTrainingActive = isAdmin && adminMode;
  const mode: "normal" | "admin_training" = adminTrainingActive ? "admin_training" : "normal";

  // ── Docked body class + CSS variable ──────────────────────────────────────
  // Adds padding-right to body so main content doesn't hide under the panel.
  // Only on viewports >= 1024px where docked mode is exposed.
  useEffect(() => {
    const shouldDock = open && panelMode === "docked" && typeof window !== "undefined" && window.innerWidth >= 1024;
    document.documentElement.style.setProperty("--coach-dock-w", `${dockedWidth}px`);
    if (shouldDock) {
      document.documentElement.classList.add("coach-docked");
    } else {
      document.documentElement.classList.remove("coach-docked");
    }
    return () => { document.documentElement.classList.remove("coach-docked"); };
  }, [open, panelMode, dockedWidth]);

  // ── Keyboard / scroll lock ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (contextOpen) { setContextOpen(false); return; }
      if (panelMode === "fullscreen" || panelMode === "docked") setPanelMode("float");
      else setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, panelMode, contextOpen]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    if (panelMode === "fullscreen") document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, panelMode]);

  useEffect(() => {
    let cancelled = false;
    function load() {
      if (playbookList === null) setLoadingPlaybooks(true);
      listPlaybooksAction().then((res) => {
        if (cancelled) return;
        setPlaybookList(res.ok ? res.playbooks : []);
        setLoadingPlaybooks(false);
      }).catch(() => {
        if (cancelled) return;
        setPlaybookList((p) => p ?? []);
        setLoadingPlaybooks(false);
      });
    }
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!contextOpen) return;
    function onDown(e: MouseEvent) {
      if (
        contextPopoverRef.current && !contextPopoverRef.current.contains(e.target as Node) &&
        contextBtnRef.current    && !contextBtnRef.current.contains(e.target as Node)
      ) { setContextOpen(false); }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [contextOpen]);

  useEffect(() => {
    if (!promoOpen) return;
    function onDown(e: MouseEvent) {
      if (
        promoRef.current    && !promoRef.current.contains(e.target as Node) &&
        promoBtnRef.current && !promoBtnRef.current.contains(e.target as Node)
      ) {
        track({
          event: "coach_cal_cta_dismiss",
          target: "header_promo_popover",
          metadata: { surface: "header_promo_popover", method: "outside_click" },
        });
        setPromoOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [promoOpen]);

  // ── Window position init ──────────────────────────────────────────────────
  const posInitialized = useRef(false);

  // Clear position and reset init flag whenever we leave float mode so that
  // switching back to float re-anchors to the bottom-right corner.
  useEffect(() => {
    if (panelMode !== "float") {
      posInitialized.current = false;
      setWindowPos(null);
    }
  }, [panelMode]);

  useEffect(() => {
    if (!open) {
      posInitialized.current = false;
      setWindowPos(null);
      return;
    }
    if (posInitialized.current || panelMode !== "float") return;
    if (typeof window === "undefined" || window.innerWidth < 640) return;
    posInitialized.current = true;
    const s = size;
    setWindowPos({
      top:  Math.max(EDGE, window.innerHeight - EDGE - s.h),
      left: Math.max(EDGE, window.innerWidth  - EDGE - s.w),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, panelMode]);

  // ── Clamp size + position on viewport resize ──────────────────────────────
  const clampToViewport = useCallback(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    let nextSize = size;
    setSize((s) => { nextSize = clampSize(s, vw, vh); return nextSize; });
    setWindowPos((p) => {
      if (!p) return p;
      return {
        top:  Math.max(EDGE, Math.min(vh - EDGE - nextSize.h, p.top)),
        left: Math.max(EDGE, Math.min(vw - EDGE - nextSize.w, p.left)),
      };
    });
    // Re-evaluate docked class after resize (may drop below 1024px threshold)
    const shouldDock = open && panelMode === "docked" && vw >= 1024;
    document.documentElement.style.setProperty("--coach-dock-w", `${dockedWidth}px`);
    if (shouldDock) document.documentElement.classList.add("coach-docked");
    else            document.documentElement.classList.remove("coach-docked");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, open, panelMode, dockedWidth]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, [open, clampToViewport]);

  // ── Drag (header) — float mode only ───────────────────────────────────────
  const dragRef = useRef<{ startX: number; startY: number; origPos: WindowPos } | null>(null);

  function onHeaderPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (panelMode !== "float" || window.innerWidth < 640 || !windowPos) return;
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

  // ── Resize (bottom-right handle) — float mode only ───────────────────────
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

  // ── Dock divider drag ─────────────────────────────────────────────────────
  const dividerRef = useRef<{ startX: number; origW: number } | null>(null);

  function onDividerPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dividerRef.current = { startX: e.clientX, origW: dockedWidth };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDividerPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dividerRef.current;
    if (!d) return;
    const delta = d.startX - e.clientX; // dragging left = wider
    const newW = Math.max(MIN_DOCK_W, Math.min(MAX_DOCK_W, d.origW + delta));
    setDockedWidth(newW);
  }

  function onDividerPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dividerRef.current) return;
    dividerRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  // ── Docked mode handler ───────────────────────────────────────────────────
  function handleSetMode(next: PanelMode) {
    if (next === "docked" && panelMode !== "docked") {
      setWindowPos(null);
    }
    setPanelMode(next);
  }

  // ── Inline style for the dialog ──────────────────────────────────────────
  const windowPosStyle: React.CSSProperties =
    panelMode === "fullscreen" || panelMode === "docked"
      ? {}
      : windowPos
        ? { top: windowPos.top, left: windowPos.left, right: "auto", bottom: "auto", width: size.w, height: size.h }
        : { width: size.w, height: size.h };

  return (
    <>
      {/* ── Launcher button ─────────────────────────────────────────────── */}
      {!entitled ? (
        <div className="relative">
          <button
            ref={promoBtnRef}
            type="button"
            onClick={() => {
              setPromoOpen((v) => {
                if (!v) {
                  track({
                    event: "coach_cal_cta_impression",
                    target: "header_promo_popover",
                    metadata: { surface: "header_promo_popover", path: pathname ?? null },
                  });
                }
                return !v;
              });
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
                onClick={() => {
                  track({
                    event: "coach_cal_cta_click",
                    target: "header_promo_popover",
                    metadata: { surface: "header_promo_popover", action: "start_trial", path: pathname ?? null },
                  });
                  setPromoOpen(false);
                }}
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
          {/* Backdrop — fullscreen and mobile only */}
          <div
            onClick={() => setOpen(false)}
            className={cn(
              "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity",
              panelMode === "fullscreen" ? "block" : "block sm:hidden",
            )}
            aria-hidden="true"
          />

          {/* ── Dialog window ───────────────────────────────────────────── */}
          <div
            role="dialog"
            aria-label="Coach Cal chat"
            style={{
              ...windowPosStyle,
              ...(panelMode === "docked" ? { width: dockedWidth } : {}),
            }}
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={onHeaderPointerUp}
            onPointerCancel={onHeaderPointerUp}
            className={cn(
              "fixed z-50 flex flex-col overflow-hidden bg-surface-raised text-foreground shadow-2xl select-none",
              // Ring / border
              panelMode === "docked"
                ? "border-l border-border"
                : "rounded-2xl ring-1 ring-black/10",
              adminTrainingActive && "ring-2 ring-amber-400",
              // Position
              panelMode === "fullscreen"
                ? "inset-2 sm:inset-4"
                : panelMode === "docked"
                  ? "inset-y-0 right-0 hidden lg:flex"
                  : [
                      // Mobile: bottom sheet
                      "inset-x-2 bottom-2 top-auto h-[80vh]",
                      // Desktop: position controlled by windowPosStyle
                      "sm:inset-auto sm:right-4 sm:bottom-4 sm:left-auto sm:top-auto",
                    ].join(" "),
            )}
          >
            {/* ── Dock divider (docked mode only) ────────────────────────── */}
            {panelMode === "docked" && (
              <div
                data-no-drag
                onPointerDown={onDividerPointerDown}
                onPointerMove={onDividerPointerMove}
                onPointerUp={onDividerPointerUp}
                onPointerCancel={onDividerPointerUp}
                className="absolute inset-y-0 -left-1 z-10 w-3 cursor-col-resize group flex items-stretch"
                title="Drag to resize panel"
                aria-hidden="true"
              >
                {/* 2px visible stripe centered in the 12px hit zone */}
                <div className="mx-auto w-0.5 bg-border transition-colors group-hover:bg-primary/50 group-active:bg-primary" />
              </div>
            )}

            {/* ── Header ─────────────────────────────────────────────────── */}
            <header
              className={cn(
                "flex items-center gap-2 border-b px-3 py-2",
                panelMode === "float" && "sm:cursor-grab sm:active:cursor-grabbing",
                adminTrainingActive
                  ? "border-amber-300 bg-amber-50/60 dark:bg-amber-950/30"
                  : "border-border",
              )}
              style={
                !adminTrainingActive && anchoredColor
                  ? {
                      backgroundColor: hexToRgba(anchoredColor, 0.10) ?? undefined,
                      borderBottomColor: hexToRgba(anchoredColor, 0.25) ?? undefined,
                    }
                  : undefined
              }
            >
              {/* Icon */}
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg",
                  adminTrainingActive ? "bg-amber-200 text-amber-900" : "",
                )}
                style={!adminTrainingActive ? { background: GRADIENT } : undefined}
              >
                <CoachAiIcon className="size-5 text-primary" bare />
              </div>

              {/* Title + context switcher */}
              <div className="min-w-0 flex-1 relative">
                <div className="flex items-center gap-1">
                  <div
                    className={cn(
                      "inline-block text-sm font-semibold leading-tight text-foreground",
                      anchoredName && "border-b-[2px] pb-0.5",
                    )}
                    style={anchoredName && anchoredColor ? { borderBottomColor: anchoredColor } : undefined}
                  >
                    Coach Cal
                    {adminTrainingActive && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 ring-1 ring-amber-300 dark:text-amber-200">
                        <GraduationCap className="size-3" /> Training
                      </span>
                    )}
                  </div>
                  <button
                    ref={contextBtnRef}
                    type="button"
                    onClick={() => setContextOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={contextOpen}
                    aria-label="Switch playbook context"
                    title="Switch playbook context"
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted transition hover:bg-surface-inset hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ChevronDown
                      className={cn("size-3.5 transition-transform", contextOpen && "rotate-180")}
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <div className="truncate text-[11px] leading-tight text-muted">
                  {adminTrainingActive
                    ? "Curating the global knowledge base — confirms before each write."
                    : anchoredName
                      ? `Anchored to ${anchoredName}`
                      : "Your AI coaching partner"}
                </div>

                {contextOpen && (
                  <div
                    ref={contextPopoverRef}
                    role="listbox"
                    aria-label="Switch playbook context"
                    className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-surface-raised shadow-xl ring-1 ring-black/5"
                  >
                    <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                      Anchor Coach Cal to
                    </div>
                    {loadingPlaybooks && (
                      <div className="px-2 pb-2 text-[12px] text-muted">Loading playbooks…</div>
                    )}
                    {!loadingPlaybooks && (playbookList?.length ?? 0) === 0 && (
                      <div className="px-2 pb-2 text-[12px] text-muted">No playbooks yet.</div>
                    )}
                    {!loadingPlaybooks && playbookList?.map((pb) => {
                      const isCurrent = pb.id === playbookId;
                      return (
                        <Link
                          key={pb.id}
                          href={`/playbooks/${pb.id}`}
                          onClick={() => setContextOpen(false)}
                          role="option"
                          aria-selected={isCurrent}
                          className={cn(
                            "flex items-center gap-2 mx-1 mb-0.5 rounded-md px-2 py-1.5 text-[12px] transition-colors",
                            isCurrent
                              ? "bg-surface-inset text-foreground"
                              : "text-foreground hover:bg-surface-inset",
                          )}
                        >
                          {/* Color swatch — always present; neutral dot when no color */}
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: pb.color ?? "var(--color-muted-light)" }}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{pb.name}</div>
                            {pb.season && <div className="truncate text-[10px] text-muted">{pb.season}</div>}
                          </div>
                          {isCurrent && (
                            <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Toolbar ──────────────────────────────────────────────── */}
              <div className="ml-auto flex items-center gap-0.5">
                {/* Font size A− / A+ */}
                <div className="mr-1 flex items-center rounded-md bg-surface-inset px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => setFontSize((f) => { const i = FONT_SIZES.indexOf(f); return i > 0 ? FONT_SIZES[i - 1] : f; })}
                    disabled={fontSize === FONT_SIZES[0]}
                    className="rounded px-1 py-0.5 text-[11px] font-semibold text-muted transition hover:text-foreground disabled:opacity-30"
                    title="Decrease font size" aria-label="Decrease font size"
                  >A−</button>
                  <span className="mx-0.5 text-[10px] tabular-nums text-muted/50">{fontSize}</span>
                  <button
                    type="button"
                    onClick={() => setFontSize((f) => { const i = FONT_SIZES.indexOf(f); return i < FONT_SIZES.length - 1 ? FONT_SIZES[i + 1] : f; })}
                    disabled={fontSize === FONT_SIZES[FONT_SIZES.length - 1]}
                    className="rounded px-1 py-0.5 text-[11px] font-semibold text-muted transition hover:text-foreground disabled:opacity-30"
                    title="Increase font size" aria-label="Increase font size"
                  >A+</button>
                </div>

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

                {/* ── Panel mode buttons ─────────────────────────────────── */}
                <div className="flex items-center">
                  {/* Float — always visible */}
                  <button
                    type="button"
                    onClick={() => handleSetMode("float")}
                    title="Floating window"
                    aria-label="Floating window"
                    className={cn(
                      "rounded-md p-1.5 transition",
                      panelMode === "float"
                        ? "bg-surface-inset text-foreground"
                        : "text-muted hover:bg-surface-inset hover:text-foreground",
                    )}
                  >
                    <AppWindow className="size-4" />
                  </button>

                  {/* Docked — desktop only (lg+) */}
                  <button
                    type="button"
                    onClick={() => handleSetMode(panelMode === "docked" ? "float" : "docked")}
                    title="Dock to side"
                    aria-label="Dock to side"
                    className={cn(
                      "hidden lg:flex rounded-md p-1.5 transition",
                      panelMode === "docked"
                        ? "bg-surface-inset text-foreground"
                        : "text-muted hover:bg-surface-inset hover:text-foreground",
                    )}
                  >
                    <PanelRight className="size-4" />
                  </button>

                  {/* Fullscreen */}
                  <button
                    type="button"
                    onClick={() => handleSetMode(panelMode === "fullscreen" ? "float" : "fullscreen")}
                    title={panelMode === "fullscreen" ? "Exit full screen" : "Full screen"}
                    aria-label={panelMode === "fullscreen" ? "Exit full screen" : "Full screen"}
                    className={cn(
                      "rounded-md p-1.5 transition",
                      panelMode === "fullscreen"
                        ? "bg-surface-inset text-foreground"
                        : "text-muted hover:bg-surface-inset hover:text-foreground",
                    )}
                  >
                    {panelMode === "fullscreen" ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                  </button>

                </div>

                <button
                  type="button"
                  onClick={() => { setPanelMode("float"); setOpen(false); }}
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

            {/* ── Resize handle (float mode, desktop only) ──────────────── */}
            {panelMode === "float" && (
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
 */
function CoachCalDemoStrip() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => { setIdx((i) => (i + 1) % COACH_CAL_DEMOS.length); }, 3500);
    return () => clearInterval(id);
  }, []);
  const demo = COACH_CAL_DEMOS[idx];
  return (
    <div
      key={idx}
      className="mt-3 space-y-1.5 rounded-xl bg-surface-inset/60 p-2.5 [animation:fadein_400ms_ease-out]"
    >
      <style>{`@keyframes fadein { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }`}</style>
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-2.5 py-1.5 text-[11px] leading-snug text-white">
          {demo.user}
        </div>
      </div>
      <div className="flex items-end gap-1.5">
        <div className="flex size-5 shrink-0 items-center justify-center rounded-lg" style={{ background: GRADIENT }}>
          <CoachAiIcon className="size-3 text-primary" bare />
        </div>
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-raised px-2.5 py-1.5 text-[11px] leading-snug text-foreground ring-1 ring-border">
          {demo.cal}
        </div>
      </div>
      <div className="flex justify-center gap-1 pt-0.5">
        {COACH_CAL_DEMOS.map((_, i) => (
          <span key={i} className={cn("size-1 rounded-full transition-colors", i === idx ? "bg-primary" : "bg-muted/30")} />
        ))}
      </div>
    </div>
  );
}
