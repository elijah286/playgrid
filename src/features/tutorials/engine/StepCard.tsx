"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import type { StepDef } from "./types";

const CARD_W = 320;
const MARGIN = 24;

/** Default top-right placement, clamped to the viewport. SSR-safe. */
function defaultPos(): { top: number; left: number } {
  if (typeof window === "undefined") return { top: MARGIN, left: MARGIN };
  return {
    top: MARGIN,
    left: Math.max(MARGIN, window.innerWidth - CARD_W - MARGIN),
  };
}

export function StepCard({
  title,
  body,
  stepIndex,
  steps,
  canBack,
  onBack,
  onNext,
  onExit,
  onJump,
  nextLabel,
  nextEnabled = true,
  gateHint,
  onGatedNudge,
}: {
  title: string;
  body: React.ReactNode;
  stepIndex: number;
  steps: ReadonlyArray<StepDef>;
  canBack: boolean;
  onBack: () => void;
  onNext: () => void;
  onExit: () => void;
  onJump: (index: number) => void;
  nextLabel: string;
  /** When false, the Next button looks disabled but is still clickable —
   *  the click fires `onGatedNudge` instead of advancing. The step's
   *  gate condition isn't satisfied yet (user hasn't done the action). */
  nextEnabled?: boolean;
  /** Short text shown next to the Next button when it's disabled —
   *  tells the user what to do to unlock it. */
  gateHint?: string;
  /** Fired when the user clicks Next while the gate is unmet. The engine
   *  hooks this to a one-shot CSS pulse on the relevant decoration (e.g.
   *  the player markers on the "select-player" step) so the nudge is
   *  visually obvious. */
  onGatedNudge?: () => void;
}) {
  const stepCount = steps.length;
  const cardRef = useRef<HTMLDivElement>(null);
  // Position is owned by this component and persists across steps —
  // moving from step N to N+1 doesn't jump the card. User can drag to
  // any spot; we just keep it on-screen.
  const [pos, setPos] = useState<{ top: number; left: number }>(defaultPos);
  const [tocOpen, setTocOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Re-collapse the TOC on step change so the card doesn't grow tall on
  // every advance — the user explicitly opens it when they want to peek.
  useEffect(() => {
    setTocOpen(false);
  }, [stepIndex]);

  // Initialize position on mount once window is available (SSR fallback).
  useEffect(() => {
    setPos((p) => (p.top === MARGIN && p.left === MARGIN ? defaultPos() : p));
  }, []);

  // Keep the card on-screen if the viewport shrinks.
  useEffect(() => {
    function onResize() {
      const card = cardRef.current;
      if (!card) return;
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      setPos((p) => ({
        top: Math.max(MARGIN, Math.min(window.innerHeight - h - MARGIN, p.top)),
        left: Math.max(MARGIN, Math.min(window.innerWidth - w - MARGIN, p.left)),
      }));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Focus the primary action on step change so Enter advances the tour.
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    nextBtnRef.current?.focus();
  }, [stepIndex]);

  /** Drag the card by any non-interactive surface. Buttons, links, and the
   *  TOC list still receive their clicks normally. */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, textarea, ol, ul")) return;
    e.preventDefault();
    const card = cardRef.current;
    if (!card) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...pos };
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    setDragging(true);

    function onMove(ev: PointerEvent) {
      const next = {
        top: Math.max(
          MARGIN,
          Math.min(window.innerHeight - h - MARGIN, startPos.top + ev.clientY - startY),
        ),
        left: Math.max(
          MARGIN,
          Math.min(window.innerWidth - w - MARGIN, startPos.left + ev.clientX - startX),
        ),
      };
      setPos(next);
    }
    function onUp() {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      onPointerDown={onPointerDown}
      // Tag for the editor's outside-click deselect handler so clicking
      // Next/Back/Exit on the tutorial card doesn't wipe the selected
      // player mid-step (which would then disable the gated Next button
      // immediately after the user pressed it). See PlayEditorClient
      // `onDocPointer`.
      data-editor-overlay="tutorial"
      // Tag so the Spotlight's click-blocker treats the card itself as
      // always-allowed — clicks on Back/Next/Exit must never be eaten.
      data-tutor-card=""
      className={`fixed z-[60] w-[320px] select-none rounded-xl bg-primary text-white shadow-2xl ring-1 ring-white/20 ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="flex items-center justify-between px-4 pt-3">
        <button
          type="button"
          onClick={() => setTocOpen((v) => !v)}
          aria-expanded={tocOpen}
          aria-controls="tutorial-toc"
          className="inline-flex items-center gap-1 rounded-md px-1 -mx-1 text-[10px] font-semibold uppercase tracking-wider text-white/75 hover:bg-white/15 hover:text-white"
        >
          Tutorial · {stepIndex + 1} of {stepCount}
          <ChevronDown
            className={`size-3 transition-transform ${tocOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        <button
          type="button"
          onClick={onExit}
          className="rounded-md p-1 text-white/75 hover:bg-white/15 hover:text-white"
          aria-label="Exit tutorial"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="px-4 pb-2 pt-1">
        <h3 className="text-sm font-semibold leading-snug text-white">{title}</h3>
        <div className="mt-1.5 text-sm leading-relaxed text-white/90">{body}</div>
      </div>
      {tocOpen && (
        <ol
          id="tutorial-toc"
          className="mx-3 max-h-60 overflow-y-auto rounded-md border border-white/15 bg-white/[0.06] py-1 text-xs"
        >
          {steps.map((s, i) => {
            const isCurrent = i === stepIndex;
            const isVisited = i < stepIndex;
            const clickable = isVisited;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => onJump(i)}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${
                    isCurrent
                      ? "bg-white text-primary font-semibold"
                      : isVisited
                        ? "text-white/85 hover:bg-white/10"
                        : "text-white/55"
                  } ${clickable ? "cursor-pointer" : "cursor-default"}`}
                >
                  <span
                    className={`inline-flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold ${
                      isCurrent ? "text-primary" : "text-white/55"
                    }`}
                    aria-hidden
                  >
                    {isVisited ? (
                      <Check className="size-3" />
                    ) : (
                      <span>{i + 1}</span>
                    )}
                  </span>
                  <span className="truncate">{s.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-white/15 px-3 py-2.5">
        {gateHint ? (
          // Wrap onto multiple lines instead of truncating with an
          // ellipsis. The hint is the one piece of copy that tells the
          // coach what action is still needed to advance, so it has to
          // be readable in full at any card width.
          <span className="min-w-0 text-[11px] italic leading-snug text-white/80 break-words">
            {gateHint}
          </span>
        ) : !tocOpen ? (
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: stepCount }).map((_, i) => (
              <span
                key={i}
                className={`block size-1.5 rounded-full ${
                  i === stepIndex
                    ? "bg-white"
                    : i < stepIndex
                      ? "bg-white/45"
                      : "bg-white/20"
                }`}
              />
            ))}
          </div>
        ) : (
          <span aria-hidden />
        )}
        <div className="flex shrink-0 items-center gap-2">
          {canBack && (
            <button
              type="button"
              onClick={onBack}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/15 hover:text-white"
            >
              Back
            </button>
          )}
          <button
            type="button"
            ref={nextBtnRef}
            onClick={() => {
              if (nextEnabled) onNext();
              else onGatedNudge?.();
            }}
            aria-disabled={!nextEnabled}
            className={
              nextEnabled
                ? "rounded-md bg-white px-3 py-1 text-xs font-semibold text-primary shadow-sm hover:bg-white/90"
                : "rounded-md bg-white/10 px-3 py-1 text-xs font-semibold text-white/40 ring-1 ring-inset ring-white/15 cursor-not-allowed hover:bg-white/15"
            }
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
