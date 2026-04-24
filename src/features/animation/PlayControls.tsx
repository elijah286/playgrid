"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, Play, RotateCcw, Zap } from "lucide-react";
import type { PlayAnimation } from "./usePlayAnimation";

type Props = {
  anim: PlayAnimation;
  /** When true, disable the controls entirely (e.g. editor in a mid-draw state). */
  disabled?: boolean;
  /**
   * When true, render as a plain inline toolbar (no floating pill, no drag
   * handle) so the caller can place it in normal flow beneath the field.
   */
  inline?: boolean;
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
export function PlayControls({ anim, disabled = false, inline = false }: Props) {
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

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
    };
  }
  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d) return;
    setOffset({
      x: d.baseX + (e.clientX - d.startX),
      y: d.baseY + (e.clientY - d.startY),
    });
  }
  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  if (inline) {
    const PrimaryIcon = primaryIcon;
    return (
      <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 shadow-elevated">
        <button
          type="button"
          onClick={step}
          disabled={disabled || isRunning}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={primaryLabel}
        >
          <PrimaryIcon className="size-4" />
          {primaryLabel}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={disabled || phase === "idle"}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Reset"
          title="Reset"
        >
          <RotateCcw className="size-4" />
          Reset
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
      <div
        className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-surface-raised/95 py-1.5 pl-1 pr-2 shadow-elevated backdrop-blur-sm"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="inline-flex cursor-grab items-center justify-center rounded-full p-1 text-muted hover:bg-surface-inset hover:text-foreground active:cursor-grabbing"
          aria-label="Drag controls"
          title="Drag to move"
        >
          <GripVertical className="size-3.5" />
        </button>
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
