"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fires a one-shot ripple of blue rings emanating from each player
 * marker on the field. Triggered:
 *   1. Once when the tour reaches the "select-player" step
 *   2. Once every time the user clicks Next while the step's gate is
 *      unmet — sent as a `tutorial:player-pulse` window event by the
 *      engine's `onGatedNudge` handler.
 *
 * Architecture:
 *   - The engine stays football-agnostic. This component is the only
 *     piece that knows about `data-player-marker` (the attribute on
 *     each offense player's SVG group in EditorCanvas).
 *   - One absolutely-positioned span per player (in screen-space, via
 *     `getBoundingClientRect`). Each span has two pseudo-elements that
 *     play a 1-iteration expand/fade animation. Keying the spans on
 *     `token` causes a fresh remount per trigger, which restarts the
 *     animation from frame 0 — natural way to replay a one-shot.
 */

const PULSE_EVENT = "tutorial:player-pulse" as const;

type Center = { left: number; top: number };

export function PlayerRipples({ stepId }: { stepId: string | null }) {
  const enabled = stepId === "select-player";
  const [centers, setCenters] = useState<Center[]>([]);
  const [token, setToken] = useState(0);
  // Spans get unmounted ~1.9s after a trigger so they don't linger as
  // invisible DOM. `visible` flips back to false on the timeout.
  const [visible, setVisible] = useState(false);
  const fadeTimer = useRef<number | null>(null);

  // Re-measure player positions while enabled.
  useEffect(() => {
    if (!enabled) {
      setCenters([]);
      return;
    }
    if (typeof window === "undefined") return;

    function measure() {
      const els = document.querySelectorAll("[data-player-marker]");
      const next: Center[] = [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        next.push({
          left: r.left + r.width / 2,
          top: r.top + r.height / 2,
        });
      }
      setCenters(next);
    }

    measure();
    const mut = new MutationObserver(() => measure());
    mut.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      mut.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [enabled]);

  // Trigger #1: fire once on step entry.
  useEffect(() => {
    if (!enabled) return;
    setToken((t) => t + 1);
  }, [enabled]);

  // Trigger #2: fire once per gated-Next click (engine dispatches event).
  useEffect(() => {
    if (!enabled) return;
    function onPulse() {
      setToken((t) => t + 1);
    }
    window.addEventListener(PULSE_EVENT, onPulse);
    return () => window.removeEventListener(PULSE_EVENT, onPulse);
  }, [enabled]);

  // Make the spans visible for the duration of the animation, then
  // unmount them. ~1.9s covers the staggered ::after ring's tail.
  useEffect(() => {
    if (token === 0) return;
    setVisible(true);
    if (fadeTimer.current != null) window.clearTimeout(fadeTimer.current);
    fadeTimer.current = window.setTimeout(() => {
      setVisible(false);
      fadeTimer.current = null;
    }, 1900);
    return () => {
      if (fadeTimer.current != null) {
        window.clearTimeout(fadeTimer.current);
        fadeTimer.current = null;
      }
    };
  }, [token]);

  if (!enabled || !visible || centers.length === 0) return null;

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

/** Window-event name the engine uses to fire an extra one-shot ripple
 *  (e.g. from the gated-Next nudge handler). Exported so the engine
 *  doesn't hard-code the string. */
export const PLAYER_PULSE_EVENT = PULSE_EVENT;
