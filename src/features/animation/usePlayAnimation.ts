"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlayDocument, Point2 } from "@/domain/play/types";
import {
  flattenRoute,
  hasMotion,
  motionLength,
  sampleAt,
  type FlatRoute,
} from "@/domain/play/animation";

/**
 * Constant pacing: every route advances at the same field-units per second.
 * The flattened routes are measured in normalized field coords (x:0..1,
 * y:0..1), so a route spanning 0.3 field-units takes ~1.2s at 0.25 units/s.
 * Tuned to "roughly 1 yard = ~0.25s" on a 25-yd display window.
 */
const UNITS_PER_SEC = 0.18;

export type AnimationPhase =
  | "idle"
  | "motion"
  | "motion-done"
  | "play"
  | "done";

export type AnimationFrame = {
  phase: AnimationPhase;
  /** Per-route arc-length progress in field-units. */
  progress: Map<string, number>;
  /** Per-player animated position. Not present = use player's default position. */
  playerPositions: Map<string, Point2>;
};

export type PlayAnimation = {
  phase: AnimationPhase;
  hasMotion: boolean;
  /** Progress map keyed by routeId (field-units traveled). */
  progress: Map<string, number>;
  /** Animated player positions keyed by playerId. */
  playerPositions: Map<string, Point2>;
  /** Flat (arc-length) view of routes for overlay rendering. */
  flats: FlatRoute[];
  /** Advance to the next phase: idle→motion (or play), motion-done→play, done→idle (reset). */
  step: () => void;
  reset: () => void;
};

export function usePlayAnimation(doc: PlayDocument): PlayAnimation {
  const flats = useMemo(() => {
    return doc.layers.routes
      .map((r) => flattenRoute(r))
      .filter((f): f is FlatRoute => f !== null);
  }, [doc.layers.routes]);

  const motionFlats = useMemo(
    () => flats.filter((f) => hasMotion(f)),
    [flats],
  );
  const anyMotion = motionFlats.length > 0;

  const [phase, setPhase] = useState<AnimationPhase>("idle");
  const [progress, setProgress] = useState<Map<string, number>>(() => new Map());

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
  }, []);

  // Animation loop. During "motion" phase, only motion portions of motion
  // routes advance. During "play" phase, everything advances toward each
  // route's full length.
  useEffect(() => {
    if (phase !== "motion" && phase !== "play") {
      stopRaf();
      return;
    }

    const tick = (ts: number) => {
      const last = lastTsRef.current ?? ts;
      const dt = Math.min(0.1, (ts - last) / 1000); // cap huge gaps
      lastTsRef.current = ts;
      const advance = dt * UNITS_PER_SEC;

      let allDone = true;
      setProgress((prev) => {
        const next = new Map(prev);
        for (const f of flats) {
          const target =
            phase === "motion"
              ? hasMotion(f)
                ? motionLength(f)
                : 0
              : f.length;
          const current = next.get(f.routeId) ?? 0;
          if (current < target) {
            next.set(f.routeId, Math.min(target, current + advance));
            if (Math.min(target, current + advance) < target) allDone = false;
          }
        }
        return next;
      });

      if (allDone) {
        stopRaf();
        setPhase((p) => (p === "motion" ? "motion-done" : "done"));
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return stopRaf;
  }, [phase, flats, stopRaf]);

  const step = useCallback(() => {
    setPhase((p) => {
      if (p === "idle") {
        if (anyMotion) return "motion";
        setProgress(new Map());
        return "play";
      }
      if (p === "motion-done") return "play";
      if (p === "done") {
        setProgress(new Map());
        return "idle";
      }
      return p; // mid-animation presses ignored
    });
  }, [anyMotion]);

  const reset = useCallback(() => {
    stopRaf();
    setProgress(new Map());
    setPhase("idle");
  }, [stopRaf]);

  // Compute animated player positions from current progress.
  const playerPositions = useMemo(() => {
    const map = new Map<string, Point2>();
    for (const f of flats) {
      const s = progress.get(f.routeId) ?? 0;
      if (s > 0) {
        map.set(f.carrierPlayerId, sampleAt(f, s));
      }
    }
    return map;
  }, [flats, progress]);

  return {
    phase,
    hasMotion: anyMotion,
    progress,
    playerPositions,
    flats,
    step,
    reset,
  };
}
