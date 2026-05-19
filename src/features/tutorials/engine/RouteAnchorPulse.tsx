"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One-shot pulse on every visible route anchor (`[data-route-anchor]`).
 * Fires when the engine dispatches the `tutorial:pulse-anchors` event
 * — currently triggered by the gated-Next nudge on the "Reshape a
 * route" step, so a coach who clicks Next without dragging anything
 * gets a visual cue about which spots on the field they can grab.
 *
 * Reuses the same `.tutorial-player-ripple` CSS class as the player
 * ripple so the visual language stays consistent. Each anchor gets
 * its own ring centered on the anchor's viewport position at fire
 * time.
 */

const PULSE_EVENT = "tutorial:pulse-anchors" as const;
const ANIMATION_MS = 1900;

type Center = { left: number; top: number };

export function RouteAnchorPulse() {
  const [centers, setCenters] = useState<Center[]>([]);
  const [token, setToken] = useState(0);
  const fadeTimer = useRef<number | null>(null);

  useEffect(() => {
    function onPulse() {
      if (typeof document === "undefined") return;
      const els = document.querySelectorAll("[data-route-anchor]");
      const next: Center[] = [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        next.push({
          left: r.left + r.width / 2,
          top: r.top + r.height / 2,
        });
      }
      if (next.length === 0) return;
      setCenters(next);
      setToken((t) => t + 1);
      if (fadeTimer.current != null) window.clearTimeout(fadeTimer.current);
      fadeTimer.current = window.setTimeout(() => {
        setCenters([]);
        fadeTimer.current = null;
      }, ANIMATION_MS);
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

  if (centers.length === 0) return null;
  return (
    <>
      {centers.map((c, i) => (
        <span
          key={`${token}-${i}`}
          aria-hidden
          className="tutorial-player-ripple"
          style={{ left: c.left, top: c.top }}
        />
      ))}
    </>
  );
}

/** Window-event name the engine uses to fire a route-anchor pulse. */
export const ROUTE_ANCHOR_PULSE_EVENT = PULSE_EVENT;
