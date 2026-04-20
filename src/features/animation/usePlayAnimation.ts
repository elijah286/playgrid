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
 * Flattened routes are measured in normalized field coords (x:0..1, y:0..1),
 * so a route spanning 0.3 field-units takes ~1.7s at 0.18 units/s.
 */
const UNITS_PER_SEC = 0.18;

export type AnimationPhase =
  | "idle"
  | "motion"
  | "motion-done"
  | "play"
  | "done";

export type PlayAnimation = {
  phase: AnimationPhase;
  hasMotion: boolean;
  progress: Map<string, number>;
  playerPositions: Map<string, Point2>;
  flats: FlatRoute[];
  step: () => void;
  reset: () => void;
  speed: number;
  setSpeed: (s: number) => void;
  paused: boolean;
  togglePause: () => void;
};

export function usePlayAnimation(doc: PlayDocument): PlayAnimation {
  const flats = useMemo(() => {
    return doc.layers.routes
      .map((r) => flattenRoute(r))
      .filter((f): f is FlatRoute => f !== null);
  }, [doc.layers.routes]);

  const anyMotion = useMemo(
    () => flats.some((f) => hasMotion(f)),
    [flats],
  );

  const [phase, setPhase] = useState<AnimationPhase>("idle");
  const [progress, setProgress] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const speedRef = useRef(1);
  speedRef.current = speed;

  // The RAF loop mutates progress synchronously through this ref; setProgress
  // is only called to trigger a re-render. Using the ref avoids the React 18
  // quirk where setState functional updaters don't run until commit — we need
  // to decide "animation done?" the same frame we advance.
  const progressRef = useRef<Map<string, number>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
  }, []);

  useEffect(() => {
    if ((phase !== "motion" && phase !== "play") || paused) {
      stopRaf();
      return;
    }

    const tick = (ts: number) => {
      const last = lastTsRef.current ?? ts;
      const dt = Math.min(0.1, (ts - last) / 1000);
      lastTsRef.current = ts;
      const advance = dt * UNITS_PER_SEC * speedRef.current;

      const next = new Map(progressRef.current);
      let allDone = true;
      for (const f of flats) {
        const target =
          phase === "motion"
            ? hasMotion(f)
              ? motionLength(f)
              : 0
            : f.length;
        const current = next.get(f.routeId) ?? 0;
        const newVal = Math.min(target, current + advance);
        next.set(f.routeId, newVal);
        if (newVal < target) allDone = false;
      }
      progressRef.current = next;
      setProgress(next);

      if (allDone) {
        stopRaf();
        setPhase((p) => (p === "motion" ? "motion-done" : "done"));
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return stopRaf;
  }, [phase, paused, flats, stopRaf]);

  const togglePause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  const step = useCallback(() => {
    setPhase((p) => {
      if (p === "idle") {
        progressRef.current = new Map();
        setProgress(new Map());
        return anyMotion ? "motion" : "play";
      }
      if (p === "motion-done") return "play";
      if (p === "done") {
        progressRef.current = new Map();
        setProgress(new Map());
        return "idle";
      }
      return p;
    });
  }, [anyMotion]);

  const reset = useCallback(() => {
    stopRaf();
    progressRef.current = new Map();
    setProgress(new Map());
    setPhase("idle");
    setPaused(false);
  }, [stopRaf]);

  const playerPositions = useMemo(() => {
    const map = new Map<string, Point2>();
    for (const f of flats) {
      const s = progress.get(f.routeId) ?? 0;
      if (s > 0) map.set(f.carrierPlayerId, sampleAt(f, s));
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
    speed,
    setSpeed,
    paused,
    togglePause,
  };
}
