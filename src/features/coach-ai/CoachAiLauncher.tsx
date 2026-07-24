"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  AppWindow,
  Check,
  ChevronDown,
  Download,
  GraduationCap,
  Maximize2,
  Minimize2,
  PanelRight,
  Sparkles,
  X,
} from "lucide-react";
import { CoachAiChat } from "./CoachAiChat";
import type { CoachAiTurn } from "@/app/actions/coach-ai";
import { CoachAiHeaderPreview } from "./CoachAiHeaderPreview";
import { CoachAiIcon } from "./CoachAiIcon";
import { CoachAiPreviewChat } from "./CoachAiPreviewChat";
import type { CoachCalEntryPointId } from "./entry-points";
import type { CoachCalOpenDetail } from "./openCoachCal";
import { usePlaybookAnchor } from "./playbook-anchor";
import { usePlayAnchor } from "./play-anchor";
import { listPlaybooksAction, type PlaybookRow } from "@/app/actions/playbooks";
import type { SubscriptionTier } from "@/lib/billing/entitlement";
import { cn } from "@/lib/utils";
import { hapticImpact } from "@/lib/native/haptics";
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

export function CoachAiLauncher({
  playbookId: playbookIdProp = null,
  isAdmin = false,
  canDebugCal = false,
  entitled = true,
  acceptGlobalCommands = false,
  evalDays,
  imageUploadAvailable = false,
  userTier = null,
  coachProTrialUsed = false,
}: {
  playbookId?: string | null;
  isAdmin?: boolean;
  /** Site admin, or a non-admin account granted Cal debug tools — gates the
   *  download-thread button and the assistant messages' "Copy JSON" option. */
  canDebugCal?: boolean;
  entitled?: boolean;
  /**
   * When true, this launcher subscribes to the `coach-cal:open` window event
   * dispatched by in-app CTAs. The launcher is mounted up to twice (global
   * header + mobile playbook header); only one — the global one — should
   * own programmatic opens so we don't render two stacked dialogs.
   */
  acceptGlobalCommands?: boolean;
  /** Coach AI eval window length in days (admin-configurable). */
  evalDays: number;
  /**
   * Whether the photo/file attach affordance (paperclip) is visible in
   * the chat input. 2026-05-21: gated behind the `coach_ai_image_upload`
   * beta flag while the hand-drawn play-sheet vision pipeline is
   * unreliable. Default false; the global header computes this server-
   * side via isBetaFeatureAvailable.
   */
  imageUploadAvailable?: boolean;
  /**
   * Current user's subscription tier. Lets the preview/upsell surfaces
   * distinguish `free` (eligible for trial) from `coach`-paid (must
   * upgrade with proration). Null = unauthenticated.
   */
  userTier?: SubscriptionTier | null;
  /**
   * True iff this user already used the Coach Pro trial. Suppresses
   * trial-promise copy on preview surfaces — Stripe won't grant a
   * second trial so we don't promise one.
   */
  coachProTrialUsed?: boolean;
}) {
  const [open,          setOpen]          = useState(false);
  const [panelMode,     setPanelMode]     = useState<PanelMode>("float");
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

  const [size,       setSize]       = useState<{ w: number; h: number }>({ w: DEFAULT_W, h: DEFAULT_H });
  const [dockedWidth, setDockedWidth] = useState(DEFAULT_DOCK_W);
  const [fontSize, setFontSize] = useState<FontSize>(14);

  // Live thread mirror — kept in a ref (lossless, no re-render on every turn)
  // plus a length state so the admin "download thread" button can disable
  // itself when there's nothing to export. Fed by CoachAiChat.onTurnsChange.
  const threadRef = useRef<CoachAiTurn[]>([]);
  const [threadLen, setThreadLen] = useState(0);
  const handleTurnsChange = useCallback((next: CoachAiTurn[]) => {
    threadRef.current = next;
    setThreadLen(next.length);
  }, []);

  // Tracks whether the viewport is narrow enough that the panel should
  // render as a CSS-controlled bottom sheet (50vh), ignoring the saved
  // window size that's only meaningful for desktop float mode. Without
  // this, an old saved `size` from a desktop session leaks across to
  // mobile and overrides the `h-[50vh]` class via inline style.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 639px)");
    setIsNarrow(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const [contextOpen,    setContextOpen]    = useState(false);
  const [playbookList,   setPlaybookList]   = useState<PlaybookRow[] | null>(null);
  const [loadingPlaybooks, setLoadingPlaybooks] = useState(false);
  const contextPopoverRef = useRef<HTMLDivElement>(null);
  const contextBtnRef     = useRef<HTMLButtonElement>(null);
  const dialogRef         = useRef<HTMLDivElement>(null);

  const [windowPos, setWindowPos] = useState<WindowPos | null>(null);

  // Programmatic-open state (driven by the `coach-cal:open` window event).
  // For entitled users, the prompt is forwarded to the chat which auto-submits.
  // For non-entitled users, we render a read-only preview chat with a tailored
  // upsell — the chat input stays disabled and the only path forward is the
  // trial CTA.
  const [injectedPrompt, setInjectedPrompt] = useState<
    { text: string; autoSubmit: boolean; key: number } | null
  >(null);
  const [previewState, setPreviewState] = useState<
    { entryPoint: CoachCalEntryPointId; prompt: string; key: number } | null
  >(null);

  const pathname = usePathname();
  const anchor   = usePlaybookAnchor();
  const playAnchor = usePlayAnchor();
  const resolvedPlaybookId = useMemo<string | null>(() => {
    if (playbookIdProp) return playbookIdProp;
    const m = pathname?.match(PLAYBOOK_ROUTE_RE);
    if (m?.[1]) return m[1];
    return anchor?.id ?? null;
  }, [playbookIdProp, pathname, anchor?.id]);
  const playId = useMemo<string | null>(() => {
    const m = pathname?.match(PLAY_ROUTE_RE);
    return m?.[1] ?? null;
  }, [pathname]);
  const inPlaybookContext = playId !== null || (pathname?.match(PLAYBOOK_ROUTE_RE) != null);

  // Sticky last-known playbookId. Three scenarios it has to handle:
  //
  //   1. Hard load on /plays/[playId]/edit — anchor not yet published. We
  //      flash the pending state briefly, then settle (no chat history to
  //      lose; first mount is the only one).
  //   2. Navigation between /playbooks/X and /plays/Y/edit (in the same
  //      playbook) — there's a transient frame where the previous page's
  //      PlaybookAnchorPublisher cleanup has run but the new one's effect
  //      hasn't. Without a sticky cache, resolvedPlaybookId would briefly
  //      flip to null, unmounting CoachAiChat and resetting the panel
  //      mid-navigation. The ref carries the previous value across the gap.
  //   3. Navigation to a global route (/home, /pricing, etc.) — clear the
  //      cache so an open Cal doesn't keep showing a stale playbook scope.
  const lastGoodPlaybookIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (resolvedPlaybookId !== null) {
      lastGoodPlaybookIdRef.current = resolvedPlaybookId;
    } else if (!inPlaybookContext) {
      lastGoodPlaybookIdRef.current = null;
    }
    // resolved=null + inPlaybookContext=true → transient gap, hold the cache
  }, [resolvedPlaybookId, inPlaybookContext]);

  const playbookId = resolvedPlaybookId ?? (inPlaybookContext ? lastGoodPlaybookIdRef.current : null);

  // Pending only on the very first paint of /plays/[playId]/edit before the
  // anchor publishes. After we've ever seen a valid playbookId for this
  // route, the sticky cache covers transient nulls so we never flap back
  // to pending mid-session.
  const playbookPending = playId !== null && playbookId === null;

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
      try { window.localStorage.removeItem("coach-ai:playbookMode"); } catch { /* ignore */ }
      const savedSize = readStorage<{ w: number; h: number } | null>("coach-ai:window-size", null);
      if (savedSize?.w && savedSize?.h) {
        setSize(clampSize(savedSize, window.innerWidth, window.innerHeight));
      }
      const savedFont = readStorage<number>("coach-ai:font-size", 14);
      if (FONT_SIZES.includes(savedFont as FontSize)) setFontSize(savedFont as FontSize);
      const savedMode = readStorage<string | null>("coach-ai:panel-mode", null);
      const wide = window.innerWidth >= 1024;
      if (savedMode === "docked" && wide) {
        setPanelMode("docked");
      } else if (savedMode === "float") {
        setPanelMode("float");
      } else if (!savedMode && wide) {
        // Fresh user on a wide viewport — default to docked so the chat
        // doesn't obscure the page they're working on.
        setPanelMode("docked");
      }
      // else: leave float (initial) — narrow viewport, or saved=docked but
      // we're on mobile (docked is hidden lg:flex; would render invisibly).
      const savedDockW = readStorage<number>("coach-ai:dock-width", DEFAULT_DOCK_W);
      if (savedDockW >= MIN_DOCK_W && savedDockW <= MAX_DOCK_W) setDockedWidth(savedDockW);
      // Restore `open` from sessionStorage so a remount during
      // `router.refresh()` (e.g. after Cal saves notes — chat dispatches
      // `coach-ai-mutated`, editor + chat both refresh, server header
      // re-runs and momentarily can re-derive coachAiAvailable, which
      // re-evaluates the conditional that mounts the launcher) doesn't
      // reset open=false and visually close the panel mid-conversation.
      // sessionStorage scope keeps a fresh tab opening with Cal closed
      // — only mid-session remounts restore. Surfaced 2026-05-05.
      if (window.sessionStorage.getItem("coach-cal:open") === "1") {
        setOpen(true);
      }
    } catch { /* ignore */ }
    hasRestored.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist `open` to sessionStorage so the restore effect above can pick
  // it up after a remount. Gated on hasRestored to avoid clobbering the
  // restored value with the initial useState(false) before restore runs.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasRestored.current) return;
    try {
      if (open) window.sessionStorage.setItem("coach-cal:open", "1");
      else      window.sessionStorage.removeItem("coach-cal:open");
    } catch { /* ignore */ }
  }, [open]);

  // Broadcast open/closed state so sibling surfaces (e.g. the playbook
  // floating CTA) can hide themselves while the chat is on screen — the toast
  // is meant to nudge users *toward* Cal and is redundant once Cal is open.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__coachCalChatOpen = open;
    window.dispatchEvent(
      new CustomEvent("coach-cal:state-change", { detail: { open } }),
    );
  }, [open]);

  // Close the dialog when the route changes. The launcher is mounted
  // globally in SiteHeaderShell, so it survives navigation — without this,
  // clicking an in-chat link (e.g. the "Upgrade to Coach Pro" CTA on the
  // preview surface) leaves the dialog overlaying the destination page.
  // Skip the first effect run so the sessionStorage restore (which
  // re-opens after a `router.refresh()` remount) isn't immediately undone.
  const firstPathnameRef = useRef(true);
  useEffect(() => {
    if (firstPathnameRef.current) {
      firstPathnameRef.current = false;
      return;
    }
    setOpen(false);
    setInjectedPrompt(null);
    setPreviewState(null);
  }, [pathname]);

  // Subscribe to the global `coach-cal:open` event. Only the launcher with
  // acceptGlobalCommands handles it, so mounting two launchers (global +
  // mobile playbook header) doesn't produce duplicate dialogs.
  useEffect(() => {
    if (!acceptGlobalCommands) return;
    function onOpen(e: CustomEvent<CoachCalOpenDetail>) {
      const { entryPoint, prompt, key } = e.detail;
      setOpen(true);
      // Don't override panelMode — respect the user's saved preference
      // (float vs docked) so opening from a CTA matches the way they've
      // been working with Cal in this session.
      if (entitled) {
        setPreviewState(null);
        // Generic open (no entry point): just open the empty chat — the
        // user wants to start fresh, not be hit with an auto-submitted
        // prompt. Specific entry points still inject + auto-submit.
        if (entryPoint && prompt) {
          setInjectedPrompt({ text: prompt, autoSubmit: true, key });
        } else {
          setInjectedPrompt(null);
        }
      } else {
        setInjectedPrompt(null);
        // Non-entitled with no entry point: open the launcher's default
        // marketing preview rather than a CTA-specific upsell.
        if (entryPoint) {
          setPreviewState({ entryPoint, prompt, key });
        } else {
          setPreviewState(null);
        }
      }
    }
    function onClose() { closeDialog(); }
    window.addEventListener("coach-cal:open", onOpen);
    window.addEventListener("coach-cal:close", onClose);
    return () => {
      window.removeEventListener("coach-cal:open", onOpen);
      window.removeEventListener("coach-cal:close", onClose);
    };
    // closeDialog is stable enough — it only mutates local state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptGlobalCommands, entitled]);

  // Slide animation state. `slideIn` drives the translate-y transition:
  //   - On open: starts false so first paint is offscreen, then flips
  //     to true on the next frame → slides up.
  //   - On close: flipped to false → slides down. After the transition
  //     duration the panel unmounts (open=false).
  // Double rAF: a single rAF fires before the browser has painted the
  // initial mount in some cases, so React's two state updates batch
  // and the transition skips. Waiting two frames guarantees the
  // browser has painted translate-y-full before we flip to 0.
  const [slideIn, setSlideIn] = useState(false);
  useEffect(() => {
    if (!open) {
      setSlideIn(false);
      return;
    }
    let r1 = 0;
    let r2 = 0;
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setSlideIn(true));
    });
    return () => {
      if (r1) cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
  }, [open]);

  function closeDialog() {
    setSlideIn(false);
    window.setTimeout(() => {
      setOpen(false);
      // Only reset fullscreen — keep docked/float across close so the
      // user's chosen panel mode persists into the next open.
      setPanelMode((m) => (m === "fullscreen" ? "float" : m));
      setInjectedPrompt(null);
      setPreviewState(null);
    }, 200);
  }

  useEffect(() => { if (hasRestored.current) writeStorage("coach-ai:window-size", size); },                  [size]);
  useEffect(() => { if (hasRestored.current) writeStorage("coach-ai:font-size",   fontSize); },              [fontSize]);
  useEffect(() => { if (hasRestored.current) writeStorage("coach-ai:dock-width",  dockedWidth); },           [dockedWidth]);
  useEffect(() => {
    if (!hasRestored.current) return;
    if (panelMode === "float" || panelMode === "docked") {
      writeStorage("coach-ai:panel-mode", panelMode);
    }
  }, [panelMode]);

  // Admin training mode was driven by a header toggle that has been removed —
  // Cal is trained out-of-band, not through the UI. Kept as a constant so the
  // existing header styling resolves to its normal-mode branches.
  const adminTrainingActive = false;
  const mode: "normal" | "admin_training" = adminTrainingActive ? "admin_training" : "normal";

  // ── Admin: download the full thread for debugging bad Cal responses ───────
  // Builds a self-contained document: a readable transcript (role, tool calls,
  // raw message text including ```play / ```spec fences) plus a lossless JSON
  // appendix carrying every field (proposals, chips, proposal states) so a
  // debugging pass loses nothing the client knew about the conversation.
  const downloadThread = useCallback(() => {
    if (typeof window === "undefined") return;
    const turns = threadRef.current;
    if (turns.length === 0) return;

    const scope = mode === "normal" ? (playbookId ?? "global") : "global";
    const exportedAt = new Date().toISOString();
    const lines: string[] = [];

    lines.push("# Coach Cal thread export");
    lines.push("");
    lines.push(`- Exported: ${exportedAt}`);
    lines.push(`- Mode: ${mode}`);
    lines.push(`- Playbook ID: ${playbookId ?? "—"}`);
    lines.push(`- Play ID: ${playId ?? "—"}`);
    lines.push(`- Scope: ${scope}`);
    lines.push(`- Turns: ${turns.length}`);
    lines.push(`- URL: ${window.location.href}`);
    lines.push(`- User agent: ${window.navigator.userAgent}`);
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Transcript");

    turns.forEach((turn, i) => {
      lines.push("");
      lines.push(`### Turn ${i + 1} — ${turn.role.toUpperCase()}`);
      if (turn.role === "assistant") {
        const tools = turn.toolCalls && turn.toolCalls.length > 0 ? turn.toolCalls.join(", ") : "none";
        lines.push(`Tool calls: ${tools}`);
        const proposals: string[] = [];
        if (turn.playbookChips?.length) proposals.push(`${turn.playbookChips.length} playbook chip(s)`);
        if (turn.noteProposals?.length) proposals.push(`${turn.noteProposals.length} note proposal(s)`);
        if (turn.saveDefenseProposals?.length) proposals.push(`${turn.saveDefenseProposals.length} defense proposal(s)`);
        if (proposals.length) lines.push(`Proposals: ${proposals.join(", ")} (full detail in JSON appendix)`);
      }
      lines.push("");
      lines.push(turn.text && turn.text.length > 0 ? turn.text : "_(empty)_");
    });

    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Raw JSON (lossless)");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(turns, null, 2));
    lines.push("```");
    lines.push("");

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coach-cal-thread-${scope}-${exportedAt.replace(/[:.]/g, "-")}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [mode, playbookId, playId]);

  // ── Docked body class + CSS variable ──────────────────────────────────────
  // Adds padding-right to body so main content doesn't hide under the panel.
  // Only on viewports >= 1024px where docked mode is exposed.
  //
  // The launcher is mounted twice (global header + mobile-only PlaybookHeader).
  // Both run this effect, so cleanup must only remove the class if THIS
  // instance was the one that added it — otherwise unmounting the hidden
  // mobile copy on navigation wipes the class while the desktop copy is still
  // open, and the page renders flush under the dock until the next splitter
  // drag re-fires the effect.
  const addedDockClassRef = useRef(false);
  useEffect(() => {
    const shouldDock = open && panelMode === "docked" && typeof window !== "undefined" && window.innerWidth >= 1024;
    document.documentElement.style.setProperty("--coach-dock-w", `${dockedWidth}px`);
    if (shouldDock) {
      document.documentElement.classList.add("coach-docked");
      addedDockClassRef.current = true;
    } else if (addedDockClassRef.current) {
      document.documentElement.classList.remove("coach-docked");
      addedDockClassRef.current = false;
    }
    return () => {
      if (addedDockClassRef.current) {
        document.documentElement.classList.remove("coach-docked");
        addedDockClassRef.current = false;
      }
    };
  }, [open, panelMode, dockedWidth]);

  // ── Keyboard / scroll lock ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (contextOpen) { setContextOpen(false); return; }
      if (panelMode === "fullscreen" || panelMode === "docked") setPanelMode("float");
      else closeDialog();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, panelMode, contextOpen]);

  // Android hardware back button — guaranteed exit path from Cal. Without
  // this, the system back press falls through to Capacitor's default
  // (exit the app) and the user gets stuck inside Cal if a header
  // control is ever obscured (the original report). Only registered
  // while Cal is open so the default back behavior is unchanged
  // elsewhere. iOS has no hardware back button — this is a no-op there.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        if (cancelled) return;
        const handle = await App.addListener("backButton", () => {
          if (contextOpen) { setContextOpen(false); return; }
          closeDialog();
        });
        cleanup = () => { void handle.remove(); };
      } catch {
        /* Capacitor not available (web) — back button is irrelevant */
      }
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
    // closeDialog is a stable local fn defined inside the component; it
    // closes over setters whose identities are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contextOpen]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    if (panelMode === "fullscreen") document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, panelMode]);

  // Tap outside the panel closes it (mobile + docked desktop). Skip
  // for fullscreen since the backdrop already handles that. Skip taps
  // on the Cal nav button since clicking it toggles — letting both
  // close and re-open fire would loop. Gated on slideIn so taps that
  // land mid-exit-animation don't trigger a re-close.
  useEffect(() => {
    if (!open || !slideIn) return;
    if (panelMode === "fullscreen" || panelMode === "docked") return;
    function onDocPointer(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (dialogRef.current?.contains(target)) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('[aria-label="Open Coach Cal"]')) return;
      closeDialog();
    }
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slideIn, panelMode]);

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

  // ── Swipe-to-dismiss (mobile bottom-sheet) ───────────────────────────────
  // The standard bottom-sheet metaphor: drag the header/grabber down to
  // dismiss. Desktop float uses the header to *move* the window instead, so
  // this only arms on narrow viewports in float mode. Tracks the finger 1:1
  // (clamped so the sheet can't lift above its resting position); a release
  // past the threshold or a downward flick closes, otherwise it snaps back.
  const swipeRef = useRef<{ startY: number; startX: number; startT: number; active: boolean; pointerId: number } | null>(null);
  const [swipeDy, setSwipeDy] = useState<number | null>(null);

  function onSheetSwipeDown(e: React.PointerEvent<HTMLElement>) {
    if (!isNarrow || panelMode !== "float") return;
    const target = e.target as HTMLElement;
    // Don't hijack taps on interactive chrome (mode buttons, close, context
    // switcher) or on scroll/drag-exempt regions.
    if (target.closest("button, a, input, textarea, select, [role='button'], [data-no-drag]")) return;
    swipeRef.current = {
      startY: e.clientY,
      startX: e.clientX,
      startT: e.timeStamp,
      active: false,
      pointerId: e.pointerId,
    };
  }

  function onSheetSwipeMove(e: React.PointerEvent<HTMLElement>) {
    const s = swipeRef.current;
    if (!s) return;
    const dy = e.clientY - s.startY;
    const dx = e.clientX - s.startX;
    if (!s.active) {
      // Wait until the gesture is clearly a downward drag before claiming it,
      // so a horizontal swipe or a jittery tap doesn't start a dismiss.
      if (dy > 6 && dy > Math.abs(dx)) {
        s.active = true;
        try { (e.currentTarget as HTMLElement).setPointerCapture(s.pointerId); } catch { /* ignore */ }
      } else if (Math.abs(dx) > 10 || dy < -6) {
        swipeRef.current = null;
        return;
      } else {
        return;
      }
    }
    setSwipeDy(Math.max(0, dy));
  }

  function onSheetSwipeEnd(e: React.PointerEvent<HTMLElement>) {
    const s = swipeRef.current;
    if (!s) return;
    swipeRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(s.pointerId); } catch { /* ignore */ }
    const dy = swipeDy ?? 0;
    setSwipeDy(null);
    if (!s.active) return;
    const sheetH = dialogRef.current?.offsetHeight ?? 0;
    // Dismiss on a decisive drag (~30% of the sheet, capped so tall sheets
    // don't demand a huge pull) or on a quick downward flick.
    const distThreshold = Math.min(120, sheetH * 0.3 || 120);
    const elapsed = e.timeStamp - s.startT;
    const flick = dy > 48 && elapsed < 250;
    if (dy > distThreshold || flick) {
      void hapticImpact("light");
      closeDialog();
    }
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
  // On narrow viewports the panel is a CSS-controlled bottom sheet — no
  // inline width/height, so the `h-[50vh]` class wins and a stale
  // desktop-saved size doesn't bleed in.
  const windowPosStyle: React.CSSProperties =
    isNarrow || panelMode === "fullscreen" || panelMode === "docked"
      ? {}
      : windowPos
        ? { top: windowPos.top, left: windowPos.left, right: "auto", bottom: "auto", width: size.w, height: size.h }
        : { width: size.w, height: size.h };

  return (
    <>
      {/* ── Launcher button ─────────────────────────────────────────────── */}
      {/* One button for both entitled and non-entitled users — clicking opens
          the chat panel. Non-entitled users see the marketing preview surface
          (CoachAiHeaderPreview) inside the chat instead of a real chat. */}
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (!entitled) {
            if (!pulseSeen) {
              setPulseSeen(true);
              try { window.localStorage.setItem("coach-cal:promo-seen-at", String(Date.now())); } catch { /* ignore */ }
            }
            track({
              event: "coach_cal_cta_impression",
              target: "header_chat",
              metadata: { surface: "header_chat", path: pathname ?? null },
            });
          } else {
            // Close the measurement gap: entitled coaches opening Cal from the
            // header icon previously emitted no event, so real Cal opens were
            // undercounted (only the promo path was instrumented).
            track({
              event: "coach_cal_cta_click",
              target: "header_chat",
              metadata: { surface: "header_chat", path: pathname ?? null },
            });
          }
        }}
        aria-label={entitled ? "Open Coach Cal" : "Try Coach Cal — your AI coaching partner"}
        title={entitled ? "Coach Cal — your AI coaching partner" : `Try Coach Cal free for ${evalDays} days`}
        className={cn(
          "relative inline-flex size-9 items-center justify-center rounded-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          open && "hidden",
        )}
        style={{ background: GRADIENT }}
      >
        {!entitled && !pulseSeen && (
          <span
            className="absolute inset-0 rounded-lg animate-ping opacity-40"
            style={{ background: GRADIENT }}
            aria-hidden="true"
          />
        )}
        <CoachAiIcon className="relative size-6" />
        {!entitled && !pulseSeen && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full bg-white text-primary shadow ring-1 ring-primary/20"
          >
            <Sparkles className="size-2.5" />
          </span>
        )}
        <span className="sr-only">{entitled ? "Coach Cal AI" : "Try Coach Cal AI"}</span>
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <>
          {/* Backdrop — fullscreen mode only. Mobile half-sheet
              intentionally has no scrim so coaches can keep reading
              the page Cal is acting on; the panel sits above the
              bottom nav, leaving the rest of the page visible and
              fully interactive. Closes via the X in the panel header. */}
          <div
            onClick={closeDialog}
            className={cn(
              "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity",
              panelMode === "fullscreen" ? "block" : "hidden",
            )}
            aria-hidden="true"
          />

          {/* Mobile half-sheet: a light, NON-blocking dim behind the sheet so it
              reads as a floating panel (the distinction was hard to see on a
              dark page). pointer-events-none keeps the page Cal is acting on
              fully tappable — it just recedes. Sits below the panel (z-30) and
              above the page; the bottom nav (z-40) stays lit. */}
          <div
            className={cn(
              "pointer-events-none fixed inset-0 z-20 bg-black/40 transition-opacity sm:hidden",
              isNarrow && panelMode !== "fullscreen" && panelMode !== "docked"
                ? "block"
                : "hidden",
            )}
            aria-hidden="true"
          />

          {/* ── Dialog window ───────────────────────────────────────────── */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-label="Coach Cal chat"
            style={{
              // Mobile float: pin above the bottom nav and constrain
              // height to half the viewport. Inline-style version of
              // the positioning because Tailwind arbitrary-values choke
              // on the env() comma inside calc(), leading to silently
              // dropped `bottom`.
              ...(isNarrow && panelMode !== "fullscreen" && panelMode !== "docked"
                ? {
                    bottom:
                      "calc(env(safe-area-inset-bottom, 0px) + 52px)",
                    height: "50vh",
                  }
                : {}),
              ...windowPosStyle,
              ...(panelMode === "docked" ? { width: dockedWidth } : {}),
              // Follow the finger during a swipe-to-dismiss drag. Inline
              // transform overrides the translate-y class; transition:none
              // keeps it 1:1. Clearing swipeDy hands control back to the
              // class so the open/close/snap-back transition animates.
              ...(swipeDy != null
                ? { transform: `translateY(${swipeDy}px)`, transition: "none" }
                : {}),
            }}
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={onHeaderPointerUp}
            onPointerCancel={onHeaderPointerUp}
            className={cn(
              "fixed flex flex-col overflow-hidden bg-surface-raised text-foreground select-none",
              // z-index. Mobile float sits BEHIND the bottom nav (z-40)
              // so the footer toolbar stays on top — slide-in/out from
              // below visually disappears under the footer chrome.
              // Fullscreen + docked stay above their respective
              // backdrops at z-50.
              panelMode === "fullscreen" || panelMode === "docked"
                ? "z-50"
                : "z-30 sm:z-50",
              // Edges + shadow. Mobile float reads as an extension of
              // the bottom nav: rounded top, soft upward-only shadow,
              // no bottom edge or downward shadow so the panel and the
              // footer appear as one continuous chrome. Desktop float
              // and fullscreen keep their floating-window treatment.
              panelMode === "docked"
                ? "border-l border-border shadow-2xl"
                : panelMode === "fullscreen"
                  ? "rounded-2xl ring-1 ring-black/10 shadow-2xl"
                  : // Mobile half-sheet: a CLEAR raised edge so it reads as a
                    // panel floating over the page (a plain border-black/10 +
                    // soft shadow vanished on a dark background). A theme border
                    // (bright hairline in dark mode) + a deep upward shadow give
                    // it obvious elevation; desktop float keeps its ring/shadow.
                    "rounded-t-2xl border-t border-border shadow-[0_-14px_44px_-8px_rgba(0,0,0,0.45)] dark:border-white/15 sm:rounded-2xl sm:border-0 sm:ring-1 sm:ring-black/10 sm:shadow-2xl",
              adminTrainingActive && "ring-2 ring-amber-400",
              // Position. Fullscreen uses a custom class instead of
              // `inset-2 sm:inset-4` so it can respect
              // env(safe-area-inset-*) — otherwise on Android the status
              // bar overlays the header and the X / minimize buttons
              // become non-tappable (touches in the status bar area are
              // intercepted by the OS). See `.cal-panel-fullscreen` in
              // globals.css.
              panelMode === "fullscreen"
                ? "cal-panel-fullscreen"
                : panelMode === "docked"
                  ? "cal-panel-docked right-0 hidden lg:flex"
                  : [
                      // Mobile: bottom HALF-sheet, lifted above the
                      // bottom nav. `bottom`/`height` are set via inline
                      // style on the parent (Tailwind arbitrary values
                      // choke on the env() comma in calc()). Here we
                      // pin horizontal edges and unset top so the inline
                      // bottom + height take effect.
                      "inset-x-0 top-auto",
                      // Animation: translate-y for reliable slide-up on
                      // open and slide-down on close. The closing state
                      // holds the panel mounted for the transition
                      // duration before unmount. Initial render with
                      // !mounted gets `translate-y-full` so the first
                      // paint is offscreen, then the next paint
                      // transitions to translate-y-0.
                      "transition-transform duration-200 ease-out",
                      slideIn ? "translate-y-0" : "translate-y-full",
                      // Desktop: position controlled by windowPosStyle.
                      // Reset translate so desktop float doesn't get
                      // shifted off-screen.
                      "sm:inset-auto sm:right-4 sm:bottom-4 sm:left-auto sm:top-auto sm:h-auto sm:translate-y-0 sm:transition-none",
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

            {/* ── Grabber (mobile bottom-sheet swipe-to-dismiss affordance) ─ */}
            {isNarrow && panelMode === "float" && (
              <div
                onPointerDown={onSheetSwipeDown}
                onPointerMove={onSheetSwipeMove}
                onPointerUp={onSheetSwipeEnd}
                onPointerCancel={onSheetSwipeEnd}
                className="flex shrink-0 items-center justify-center pt-2 pb-1 touch-none sm:hidden"
                aria-hidden="true"
              >
                <div className="h-1 w-9 rounded-full bg-muted/40" />
              </div>
            )}

            {/* ── Header ─────────────────────────────────────────────────── */}
            <header
              onPointerDown={onSheetSwipeDown}
              onPointerMove={onSheetSwipeMove}
              onPointerUp={onSheetSwipeEnd}
              onPointerCancel={onSheetSwipeEnd}
              className={cn(
                "flex items-center gap-2 border-b px-3 py-2",
                // Claim the vertical drag for swipe-to-dismiss — but only when
                // the context popover is closed, so its scrollable list keeps
                // its own touch scrolling.
                isNarrow && panelMode === "float" && !contextOpen && "touch-none",
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
                      ? // Show the play name alongside the playbook when the
                        // coach is in a play view, so they can verify Cal's
                        // anchor matches the diagram on screen. Falls back to
                        // playbook-only when there's no play in scope.
                        playId && playAnchor?.id === playId && playAnchor.name
                        ? `Anchored to ${anchoredName} · ${playAnchor.name}`
                        : `Anchored to ${anchoredName}`
                      : "Your AI coaching partner"}
                </div>

                {contextOpen && (
                  <div
                    ref={contextPopoverRef}
                    role="listbox"
                    aria-label="Switch playbook context"
                    className="absolute left-0 top-full z-10 mt-1 max-h-72 w-max min-w-[16rem] max-w-[20rem] overflow-auto rounded-lg border border-border bg-surface-raised shadow-xl ring-1 ring-black/5"
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
                {/* Admin-only: download the full thread as a debugging
                    document (transcript + lossless JSON). Replaces the old
                    font-size / training-toggle affordances. */}
                {canDebugCal && (
                  <button
                    type="button"
                    onClick={downloadThread}
                    disabled={threadLen === 0}
                    className="rounded-md p-1.5 text-muted transition hover:bg-surface-inset hover:text-foreground disabled:opacity-30"
                    title="Download thread (debug)"
                    aria-label="Download thread for debugging"
                  >
                    <Download className="size-4" />
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
                  onClick={closeDialog}
                  className="rounded-md p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
                  title="Close"
                >
                  <X className="size-4" />
                </button>
              </div>
            </header>

            {/* ── Chat content ─────────────────────────────────────────── */}
            {/* fontSize is desktop-only; mobile inherits the system font
                size so Dynamic Type / browser zoom takes over. */}
            <div
              data-no-drag
              className="flex-1 min-h-0"
              style={isNarrow ? undefined : { fontSize: `${fontSize}px` }}
            >
              {previewState ? (
                <CoachAiPreviewChat
                  entryPoint={previewState.entryPoint}
                  prompt={previewState.prompt}
                  evalDays={evalDays}
                  userTier={userTier}
                  coachProTrialUsed={coachProTrialUsed}
                  onCtaClick={() => setOpen(false)}
                />
              ) : !entitled ? (
                // Non-entitled user opened from the header icon (or after
                // closing a CTA-driven preview) — show the general welcome
                // surface so the chat is never empty for them.
                <CoachAiHeaderPreview evalDays={evalDays} userTier={userTier} coachProTrialUsed={coachProTrialUsed} onCtaClick={() => setOpen(false)} />
              ) : playbookPending ? (
                <CoachAiChatPending />
              ) : (
                <CoachAiChat
                  playbookId={playbookId}
                  playId={playId}
                  playName={playId && playAnchor?.id === playId ? playAnchor.name ?? null : null}
                  mode={mode}
                  isAdmin={isAdmin}
                  canDebugCal={canDebugCal}
                  injectedPrompt={injectedPrompt}
                  imageUploadAvailable={imageUploadAvailable}
                  onTurnsChange={handleTurnsChange}
                />
              )}
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

function CoachAiChatPending() {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="inline-flex items-center gap-1 text-sm text-muted" aria-label="Loading">
        <span className="size-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: "0ms" }} />
        <span className="size-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: "120ms" }} />
        <span className="size-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: "240ms" }} />
      </span>
    </div>
  );
}

