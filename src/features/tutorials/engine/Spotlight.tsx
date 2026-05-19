"use client";

import { useEffect } from "react";
import { ANCHOR_PULSE_EVENT } from "./AnchorPulse";

/**
 * Visual spotlight: dim everywhere except the target element, plus a
 * blue glow around the target. Also enforces the tour's intended path
 * by blocking clicks that don't land on an allowed surface.
 *
 * Glow implementation: **the glow is a CSS property of the target
 * element**, not a separately positioned overlay. The Spotlight
 * component sets `data-tutor-spotlit` on the active target element(s);
 * a CSS rule in globals.css applies `position: relative; z-index:
 * <above dim>; box-shadow: <blue glow>` so the element pops above the
 * dim with its glow. The glow follows the element naturally on scroll
 * / layout shift because it *is* the element — not an overlay
 * tracking it.
 *
 * Click blocking: a capture-phase click listener on the document
 * allows clicks only on:
 *   - The spotlit element or its descendants (the thing the step is
 *     about — clicks always work here).
 *   - Any element under a `[data-tutor-allow]` ancestor (escape hatch
 *     for portaled popovers that open from the spotlit element, e.g.
 *     the formation picker dropdown).
 *   - The tutorial card itself (`[data-tutor-card]`) so Back / Next /
 *     Exit are always reachable.
 *
 * Everything else gets `preventDefault` + `stopPropagation`, and a
 * one-shot blue ripple fires on the spotlit element so the coach
 * sees where the tour wants them.
 *
 * A MutationObserver re-checks the document for the target so the
 * spotlight transfers correctly when:
 *   - A panel that wasn't yet mounted appears (e.g. the opponent
 *     overlay after Done is clicked).
 *   - The visible copy of a dual-rendered component swaps (mobile
 *     `sm:hidden` vs desktop `hidden sm:block`).
 *   - The element itself gets re-mounted by its parent.
 */
export function Spotlight({
  anchor,
  allow = [],
  dim = true,
}: {
  anchor: string | string[] | null;
  /** Extra `data-tutor` keys whose elements should be click-through
   *  even though they aren't the spotlit target. Used to whitelist
   *  the gate's `nudgeAnchor` (e.g. the Done button on step 8) — the
   *  coach needs to tap that to satisfy the gate, but it isn't the
   *  step's spotlit anchor so the click block would otherwise eat
   *  the tap. These elements don't get the blue glow, just the
   *  pass-through. */
  allow?: string[];
  dim?: boolean;
}) {
  useEffect(() => {
    if (!anchor) return;
    const keys = Array.isArray(anchor) ? anchor : [anchor];

    // ── Glow: mark the target(s) with data-tutor-spotlit ──────────
    let applied: Element[] = [];
    function syncTargets() {
      const next: Element[] = [];
      for (const k of keys) {
        const el = findVisibleFor(k);
        if (el) next.push(el);
      }
      for (const el of applied) {
        if (!next.includes(el)) el.removeAttribute("data-tutor-spotlit");
      }
      const newlyApplied: Element[] = [];
      for (const el of next) {
        if (!applied.includes(el)) {
          el.setAttribute("data-tutor-spotlit", "");
          newlyApplied.push(el);
        }
      }
      applied = next;
      // Auto-scroll: if a new element just became the spotlit target
      // and it isn't currently visible in the viewport, smoothly
      // scroll it into view. Some steps anchor below the fold
      // (play-notes lives under the field on smaller windows) — without
      // this, the coach sees a "highlighted but invisible" target and
      // has to scroll to find it.
      if (newlyApplied.length > 0 && !isInViewport(newlyApplied[0])) {
        (newlyApplied[0] as HTMLElement).scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      }
    }
    syncTargets();
    const obs = new MutationObserver(syncTargets);
    obs.observe(document.body, { childList: true, subtree: true });

    // ── Click block: capture-phase listeners ─────────────────────
    // Every interaction event we care about gets a capture-phase
    // listener. `pointerdown` covers the editor's drag / context-menu
    // entry paths. `click` covers normal button presses. `contextmenu`
    // covers right-click → context menu (which would otherwise let the
    // coach rename a player, install motion, etc. from a step that
    // doesn't spotlight the canvas). `dblclick` covers the editor's
    // double-click-to-rename-player handler (which uses native
    // `dblclick` directly, so blocking `click` isn't enough).
    // Build a CSS selector matching any extra allow-listed keys so the
    // click block lets those elements through too. Used for the gate's
    // nudgeAnchor — the coach needs to tap it to satisfy the gate, but
    // it's not the spotlit anchor so the default block would eat it.
    const allowSelectors = allow
      .map((k) => `[data-tutor="${k}"]`)
      .join(", ");
    function isAllowed(target: Element): boolean {
      return !!(
        target.closest("[data-tutor-spotlit]") ||
        target.closest("[data-tutor-allow]") ||
        target.closest("[data-tutor-card]") ||
        (allowSelectors && target.closest(allowSelectors))
      );
    }
    function pulseSpotlit() {
      const primary = keys[0];
      if (primary) {
        window.dispatchEvent(
          new CustomEvent(ANCHOR_PULSE_EVENT, { detail: { key: primary } }),
        );
      }
    }
    function onCapturedClick(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target || isAllowed(target)) return;
      e.preventDefault();
      e.stopPropagation();
      pulseSpotlit();
    }
    function onCapturedPointerDown(e: PointerEvent) {
      const target = e.target as Element | null;
      if (!target || isAllowed(target)) return;
      e.preventDefault();
      e.stopPropagation();
    }
    function onCapturedContextMenu(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target || isAllowed(target)) return;
      e.preventDefault();
      e.stopPropagation();
      pulseSpotlit();
    }
    function onCapturedDblClick(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target || isAllowed(target)) return;
      e.preventDefault();
      e.stopPropagation();
    }
    document.addEventListener("click", onCapturedClick, true);
    document.addEventListener("pointerdown", onCapturedPointerDown, true);
    document.addEventListener("contextmenu", onCapturedContextMenu, true);
    document.addEventListener("dblclick", onCapturedDblClick, true);

    return () => {
      obs.disconnect();
      for (const el of applied) el.removeAttribute("data-tutor-spotlit");
      applied = [];
      document.removeEventListener("click", onCapturedClick, true);
      document.removeEventListener("pointerdown", onCapturedPointerDown, true);
      document.removeEventListener("contextmenu", onCapturedContextMenu, true);
      document.removeEventListener("dblclick", onCapturedDblClick, true);
    };
  }, [
    Array.isArray(anchor) ? anchor.join("|") : anchor,
    allow.join("|"),
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dim) return null;
  // Uniform full-screen dim. The active target's CSS sets its own
  // z-index above this layer so it visually pops out of the dim
  // without any rect math.
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[55]"
      style={{ background: "rgba(15, 17, 21, 0.55)" }}
      aria-hidden
    />
  );
}

/**
 * First visible match for a `data-tutor` key. Several editor
 * components render twice (mobile + desktop with one hidden via Tailwind
 * breakpoint utilities). A naive `querySelector` would return the
 * document-order first match, which is often the 0×0 hidden copy.
 */
function findVisibleFor(key: string): Element | null {
  if (typeof document === "undefined") return null;
  const all = document.querySelectorAll(`[data-tutor="${key}"]`);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) return el;
  }
  return null;
}

/** True if the element is fully visible in the viewport (no edge
 *  cropped). A small negative margin tolerates a few pixels of bleed
 *  from rounded corners / box-shadow, but partial crops where the
 *  coach can't see the bottom of the element will fail this check
 *  and trigger a scroll. Earlier the margin was 80 (generous), which
 *  let half-cropped toolbars pass as "in viewport" — coach would see
 *  the spotlight glow without being able to read what was glowing. */
function isInViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return (
    r.top >= 0 &&
    r.left >= 0 &&
    r.bottom <= vh &&
    r.right <= vw
  );
}
