"use client";

import { useEffect, useRef, useState } from "react";
import { useIsNativeApp } from "@/lib/native/useIsNativeApp";
import { hapticImpact } from "@/lib/native/haptics";
import { isReloadBlocked, triggerAppReload } from "@/lib/native/reloadGuard";

// Pull tuning, in px of *finger* travel after resistance.
//  - THRESHOLD: how far you pull to arm a refresh (release past it = reload).
//  - MAX_PULL: how far the indicator can travel; the rubber-band caps here.
//  - RESISTANCE: damps finger movement so the pull feels elastic, not 1:1.
const THRESHOLD = 72;
const MAX_PULL = 110;
const RESISTANCE = 0.5;

type Phase = "idle" | "pulling" | "refreshing";

/**
 * Native-only pull-to-refresh. The app is a Capacitor WebView pointed at the
 * live site, so there's no browser chrome to reload from — this gives coaches
 * the standard "pull down at the top to refresh" gesture, which reloads the
 * WebView and picks up the latest deploy.
 *
 * Implemented as a custom touch gesture rather than by re-enabling native
 * overscroll bounce: `overscroll-behavior: none` stays in place (it's what
 * keeps the colored header from tearing away from the status bar), and we
 * drive our own indicator instead.
 *
 * Guards (via reloadGuard): never fires at a non-top scroll position, inside a
 * scrolled/locked region (modals, the Cal thread), or while the play editor is
 * mid-edit — so a pull can't discard unsaved work. Returns null on the web,
 * where the browser already owns this gesture.
 */
export function PullToRefresh() {
  const native = useIsNativeApp();
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");

  // Mutable gesture bookkeeping, touched only inside the touch handlers (never
  // during render). `phase` here mirrors the React state so handlers can read
  // the current phase and skip redundant setState calls.
  const g = useRef({
    tracking: false,
    armed: false,
    startY: 0,
    startX: 0,
    phase: "idle" as Phase,
  });

  useEffect(() => {
    if (!native) return;

    const setPhase2 = (p: Phase) => {
      if (g.current.phase === p) return;
      g.current.phase = p;
      setPhase(p);
    };

    const atTop = () => window.scrollY <= 0;

    // The page-level pull only makes sense when no nested surface owns the
    // scroll. Bail if body scroll is locked (modal / fullscreen overlay), or
    // if the touch began inside a scrolled scroll-container or an explicitly
    // opted-out region (`data-no-ptr`).
    const startedInOwnedRegion = (target: EventTarget | null): boolean => {
      if (getComputedStyle(document.body).overflowY === "hidden") return true;
      let el = target as HTMLElement | null;
      while (el && el !== document.body) {
        if (el.dataset?.noPtr != null) return true;
        const oy = getComputedStyle(el).overflowY;
        if ((oy === "auto" || oy === "scroll") && el.scrollTop > 0) return true;
        el = el.parentElement;
      }
      return false;
    };

    const cancel = () => {
      g.current.tracking = false;
      g.current.armed = false;
      setPhase2("idle");
      setPull(0);
    };

    const onStart = (e: TouchEvent) => {
      g.current.tracking = false;
      g.current.armed = false;
      if (g.current.phase === "refreshing") return;
      if (e.touches.length !== 1) return;
      if (!atTop()) return;
      if (isReloadBlocked()) return;
      if (startedInOwnedRegion(e.target)) return;
      g.current.tracking = true;
      g.current.startY = e.touches[0].clientY;
      g.current.startX = e.touches[0].clientX;
    };

    const onMove = (e: TouchEvent) => {
      if (!g.current.tracking) return;
      const dy = e.touches[0].clientY - g.current.startY;
      const dx = e.touches[0].clientX - g.current.startX;
      // Not a downward pull (scrolling up) or mostly horizontal → hand it back.
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
        cancel();
        return;
      }
      // We own this gesture now: stop the page from scrolling under us.
      if (e.cancelable) e.preventDefault();
      setPhase2("pulling");
      const dist = Math.min(MAX_PULL, dy * RESISTANCE);
      setPull(dist);
      const armed = dist >= THRESHOLD;
      if (armed && !g.current.armed) void hapticImpact("medium");
      g.current.armed = armed;
    };

    const onEnd = () => {
      if (!g.current.tracking) return;
      const armed = g.current.armed;
      g.current.tracking = false;
      g.current.armed = false;
      if (armed && !isReloadBlocked()) {
        setPhase2("refreshing");
        setPull(THRESHOLD);
        // Let the spinner paint one frame before the synchronous reload.
        setTimeout(() => triggerAppReload(), 150);
        // Safety net: if the reload was blocked at the last instant (e.g. an
        // edit started), clear the spinner instead of leaving it stuck.
        setTimeout(() => {
          setPhase2("idle");
          setPull(0);
        }, 2500);
      } else {
        setPhase2("idle");
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [native]);

  if (!native) return null;

  const refreshing = phase === "refreshing";
  const progress = Math.min(1, pull / THRESHOLD);
  const visible = phase !== "idle";

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center"
      style={{
        transform: `translateY(${pull}px)`,
        opacity: visible ? 1 : 0,
        transition:
          phase === "pulling"
            ? "none"
            : "transform 200ms ease, opacity 200ms ease",
      }}
    >
      <div
        className="flex size-9 items-center justify-center rounded-full border border-border bg-surface-raised shadow-md"
        // Start ~46px above the safe-area top so it's hidden behind the header
        // at rest, then ride down into view as the pull grows.
        style={{ marginTop: "calc(env(safe-area-inset-top) - 46px)" }}
      >
        <svg
          viewBox="0 0 24 24"
          className={`size-5 text-primary ${refreshing ? "animate-spin" : ""}`}
          style={
            refreshing ? undefined : { transform: `rotate(${progress * 180}deg)` }
          }
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {refreshing ? (
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          ) : (
            <>
              <path d="M12 5v14" />
              <path d="M19 12l-7 7-7-7" />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
