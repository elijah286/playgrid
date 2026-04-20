"use client";

import { useEffect } from "react";
import { Play, RotateCcw, Zap } from "lucide-react";
import type { PlayAnimation } from "./usePlayAnimation";

type Props = {
  anim: PlayAnimation;
  /** When true, disable the controls entirely (e.g. editor in a mid-draw state). */
  disabled?: boolean;
};

/**
 * Compact floating pill rendered over the field. Two-button pattern at most:
 *   - Primary action (Play, Motion, Snap, or Reset depending on phase)
 *   - Reset shortcut (only once the animation has been started)
 *
 * Spacebar advances the primary action. Controls intentionally use
 * pointer-events auto on a pointer-events-none parent so they don't block
 * canvas clicks when dismissed.
 */
export function PlayControls({ anim, disabled = false }: Props) {
  useEffect(() => {
    if (disabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      // Avoid hijacking when the user is typing.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const isEditable = (e.target as HTMLElement | null)?.isContentEditable;
      if (isEditable) return;
      e.preventDefault();
      anim.step();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anim, disabled]);

  const { phase, hasMotion, step, reset } = anim;

  const primaryLabel =
    phase === "idle" ? (hasMotion ? "Motion" : "Play")
    : phase === "motion" ? "Motion…"
    : phase === "motion-done" ? "Snap"
    : phase === "play" ? "Playing…"
    : "Replay";

  const primaryIcon =
    phase === "motion-done" ? Zap
    : phase === "done" ? RotateCcw
    : Play;

  const isRunning = phase === "motion" || phase === "play";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-surface-raised/95 px-2 py-1.5 shadow-elevated backdrop-blur-sm">
        <button
          type="button"
          onClick={step}
          disabled={disabled || isRunning}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={primaryLabel}
        >
          {(() => {
            const Icon = primaryIcon;
            return <Icon className="size-3.5" />;
          })()}
          {primaryLabel}
        </button>
        {phase !== "idle" && (
          <button
            type="button"
            onClick={reset}
            disabled={disabled}
            className="inline-flex items-center justify-center rounded-full p-1.5 text-muted transition-colors hover:bg-surface-inset hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Reset"
            title="Reset"
          >
            <RotateCcw className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
