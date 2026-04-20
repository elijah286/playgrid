"use client";

import { useEffect } from "react";
import { Pause, Play, RotateCcw, Zap } from "lucide-react";
import type { PlayAnimation } from "./usePlayAnimation";

type Props = {
  anim: PlayAnimation;
};

const SPEEDS: Array<{ value: number; label: string }> = [
  { value: 0.5, label: "0.5×" },
  { value: 1, label: "1×" },
  { value: 1.5, label: "1.5×" },
  { value: 2, label: "2×" },
];

/**
 * Sidebar play controls — primary play/motion/snap/replay action, pause,
 * speed selector, and reset. Intended to live at the top of the editor
 * right-panel when nothing is selected.
 */
export function PlayControlsPanel({ anim }: Props) {
  const { phase, hasMotion, step, reset, paused, togglePause, speed, setSpeed } = anim;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const isEditable = (e.target as HTMLElement | null)?.isContentEditable;
      if (isEditable) return;
      e.preventDefault();
      if (phase === "motion" || phase === "play") togglePause();
      else step();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, step, togglePause]);

  const primaryLabel =
    phase === "idle" ? (hasMotion ? "Motion" : "Play")
    : phase === "motion" ? (paused ? "Resume motion" : "Motion…")
    : phase === "motion-done" ? "Snap"
    : phase === "play" ? (paused ? "Resume play" : "Playing…")
    : "Replay";

  const PrimaryIcon =
    phase === "motion-done" ? Zap
    : phase === "done" ? RotateCcw
    : Play;

  const isRunning = phase === "motion" || phase === "play";
  const canPause = isRunning;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-inset/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Playback
        </p>
        {phase !== "idle" && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted transition-colors hover:bg-surface-inset hover:text-foreground"
            aria-label="Reset"
            title="Reset"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={step}
          disabled={isRunning && !paused}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={primaryLabel}
        >
          <PrimaryIcon className="size-4" />
          {primaryLabel}
        </button>
        <button
          type="button"
          onClick={togglePause}
          disabled={!canPause}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised text-foreground transition-colors hover:bg-surface-inset disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={paused ? "Resume" : "Pause"}
          title={paused ? "Resume" : "Pause"}
        >
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </button>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-muted">Speed</label>
        <div className="flex gap-1 rounded-lg border border-border bg-surface-raised p-0.5">
          {SPEEDS.map((s) => {
            const active = Math.abs(speed - s.value) < 0.01;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setSpeed(s.value)}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-primary text-white"
                    : "text-muted hover:bg-surface-inset hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
