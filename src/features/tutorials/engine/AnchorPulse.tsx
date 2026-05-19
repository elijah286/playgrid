"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One-shot pulse on an arbitrary `data-tutor` anchor element.
 * Mirrors the player-ripple animation but works on any tutorial-tagged
 * element — used when a gated step's required action is on something
 * outside the spotlight (e.g. step 8's Done button above the field)
 * or when the click-blocker swallows a click and wants to nudge the
 * coach back to the spotlit element.
 *
 * Fires on two triggers:
 *   1. Step entry when the active step has `gate.nudgeAnchor` set
 *      (passed via the `stepKey` prop).
 *   2. Each `tutorial:anchor-pulse` window event, dispatched by either
 *      the gated-Next handler (with `gate.nudgeAnchor`) or the
 *      Spotlight click-blocker (with the spotlit anchor).
 *
 * The ripple is positioned via `getBoundingClientRect` at fire time
 * and re-measured on scroll / resize for as long as the animation is
 * playing — so if the page scrolls during the ripple, the rings track
 * the actual element instead of staying frozen at the original
 * viewport coords.
 */

const PULSE_EVENT = "tutorial:anchor-pulse" as const;
const ANIMATION_MS = 1900;

type Center = { left: number; top: number };

export function AnchorPulse({ stepKey }: { stepKey: string | null }) {
  const [center, setCenter] = useState<Center | null>(null);
  const [token, setToken] = useState(0);
  const fadeTimer = useRef<number | null>(null);
  // Whichever key triggered the most recent fire(). Read by the scroll
  // tracker so it follows the right element — even when the pulse was
  // dispatched via event (e.g. blocked-click nudge) with a key
  // different from the step's `stepKey` prop.
  const activeKeyRef = useRef<string | null>(null);

  function fire(key: string) {
    if (typeof document === "undefined") return;
    const el = document.querySelector(`[data-tutor="${key}"]`);
    if (!el) return;
    let r = (el as Element).getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    // Scroll into view first if needed so the pulse renders where the
    // coach is looking (e.g. clicking "find" on a bullet whose target
    // is below the fold). Smooth scroll; we re-measure right after.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const offscreen =
      r.top < 0 || r.left < 0 || r.bottom > vh || r.right > vw;
    if (offscreen) {
      (el as HTMLElement).scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
      // After scrollIntoView the element's position will change on
      // the next frame. Defer the pulse position to then so the
      // ring lands on the post-scroll center, not the pre-scroll
      // center.
      window.requestAnimationFrame(() => {
        const rr = (el as Element).getBoundingClientRect();
        activeKeyRef.current = key;
        setCenter({
          left: rr.left + rr.width / 2,
          top: rr.top + rr.height / 2,
        });
        setToken((t) => t + 1);
      });
    } else {
      activeKeyRef.current = key;
      setCenter({
        left: r.left + r.width / 2,
        top: r.top + r.height / 2,
      });
      setToken((t) => t + 1);
    }
    if (fadeTimer.current != null) window.clearTimeout(fadeTimer.current);
    fadeTimer.current = window.setTimeout(() => {
      setCenter(null);
      activeKeyRef.current = null;
      fadeTimer.current = null;
    }, ANIMATION_MS);
  }

  // Trigger #1: fire when the step's nudge anchor changes (step
  // transitioned into a step that has one). Pulse runs once on entry.
  useEffect(() => {
    if (!stepKey) {
      setCenter(null);
      activeKeyRef.current = null;
      return;
    }
    // Wait a frame so the bridge / scrollIntoView has time to settle
    // before we measure the anchor's position.
    const raf = window.requestAnimationFrame(() => fire(stepKey));
    return () => window.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey]);

  // Trigger #2: fire on each pulse event. The dispatcher (gated-Next
  // handler, blocked-click handler) puts the target's data-tutor key
  // in `detail.key`.
  useEffect(() => {
    function onPulse(e: Event) {
      const detail = (e as CustomEvent).detail as { key?: string } | undefined;
      const k = detail?.key;
      if (!k) return;
      fire(k);
    }
    window.addEventListener(PULSE_EVENT, onPulse);
    return () => {
      window.removeEventListener(PULSE_EVENT, onPulse);
      if (fadeTimer.current != null) {
        window.clearTimeout(fadeTimer.current);
        fadeTimer.current = null;
      }
    };
  }, []);

  // Track scroll / resize while the pulse is visible so the rings
  // follow the underlying element. Uses `activeKeyRef` instead of
  // `stepKey` so it works for both triggers — including blocked-click
  // pulses where `stepKey` is null.
  useEffect(() => {
    if (!center) return;
    function track() {
      if (typeof document === "undefined") return;
      const key = activeKeyRef.current;
      if (!key) return;
      const el = document.querySelector(`[data-tutor="${key}"]`);
      if (!el) return;
      const r = (el as Element).getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      setCenter({
        left: r.left + r.width / 2,
        top: r.top + r.height / 2,
      });
    }
    window.addEventListener("scroll", track, true);
    window.addEventListener("resize", track);
    return () => {
      window.removeEventListener("scroll", track, true);
      window.removeEventListener("resize", track);
    };
  }, [center]);

  if (!center) return null;
  return (
    <span
      key={token}
      aria-hidden
      className="tutorial-player-ripple"
      style={{ left: center.left, top: center.top }}
    />
  );
}

/** Window-event name the engine uses to fire an anchor pulse. */
export const ANCHOR_PULSE_EVENT = PULSE_EVENT;
