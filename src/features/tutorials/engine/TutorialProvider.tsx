"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { SportVariant } from "@/domain/play/types";
import { upsertTutorialProgressAction } from "@/app/actions/tutorials";
import { Spotlight } from "./Spotlight";
import { StepCard } from "./StepCard";
import { PlayerRipples, PLAYER_PULSE_EVENT } from "./PlayerRipples";
import { AnchorPulse, ANCHOR_PULSE_EVENT } from "./AnchorPulse";
import { RouteAnchorPulse, ROUTE_ANCHOR_PULSE_EVENT } from "./RouteAnchorPulse";
import { TUTORIAL_ACTION_EVENT } from "./notify";
import type { StepDef, TutorialDef, TutorialId } from "./types";

interface ActiveTutorial {
  def: TutorialDef;
  /** Steps filtered by `appliesTo(variant)`, so indexing matches what the user sees. */
  steps: StepDef[];
  variant: SportVariant;
  stepIndex: number;
}

interface TutorialContextValue {
  active: ActiveTutorial | null;
  start: (def: TutorialDef, variant: SportVariant, fromStep?: number) => void;
  exit: () => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) {
    throw new Error("useTutorial must be used inside <TutorialProvider>.");
  }
  return ctx;
}

/**
 * Persist progress without blocking UI. Errors are swallowed — losing a
 * single step-index write is preferable to a blocking error toast.
 */
function persist(input: Parameters<typeof upsertTutorialProgressAction>[0]) {
  void upsertTutorialProgressAction(input).catch(() => {});
}

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveTutorial | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const start = useCallback(
    (def: TutorialDef, variant: SportVariant, fromStep = 0) => {
      if (!def.supportedVariants.includes(variant)) return;
      const steps = def.steps.filter((s) => !s.appliesTo || s.appliesTo(variant));
      if (steps.length === 0) return;
      const stepIndex = Math.max(0, Math.min(fromStep, steps.length - 1));
      setActive({ def, steps, variant, stepIndex });
      persist({
        tutorialId: def.id,
        status: "in_progress",
        stepIndex,
        variant,
      });
    },
    [],
  );

  const exit = useCallback(() => {
    if (!active) return;
    persist({
      tutorialId: active.def.id,
      status: "dismissed",
      stepIndex: active.stepIndex,
      variant: active.variant,
    });
    setActive(null);
  }, [active]);

  const advance = useCallback(() => {
    setActive((cur) => {
      if (!cur) return cur;
      const next = cur.stepIndex + 1;
      if (next >= cur.steps.length) {
        persist({
          tutorialId: cur.def.id,
          status: "completed",
          stepIndex: cur.steps.length,
          variant: cur.variant,
        });
        return null;
      }
      persist({
        tutorialId: cur.def.id,
        status: "in_progress",
        stepIndex: next,
        variant: cur.variant,
      });
      return { ...cur, stepIndex: next };
    });
  }, []);

  const back = useCallback(() => {
    setActive((cur) => {
      if (!cur || cur.stepIndex === 0) return cur;
      const prev = cur.stepIndex - 1;
      persist({
        tutorialId: cur.def.id,
        status: "in_progress",
        stepIndex: prev,
        variant: cur.variant,
      });
      return { ...cur, stepIndex: prev };
    });
  }, []);

  /** Jump to a specific step index. Callers (the TOC list) gate this
   *  to backward-only — forward jumps can land on a step whose anchor
   *  assumes UI state the user hasn't reached yet (e.g. "Route templates"
   *  needs a selected player). */
  const jumpTo = useCallback((index: number) => {
    setActive((cur) => {
      if (!cur) return cur;
      const clamped = Math.max(0, Math.min(index, cur.steps.length - 1));
      if (clamped === cur.stepIndex) return cur;
      persist({
        tutorialId: cur.def.id,
        status: "in_progress",
        stepIndex: clamped,
        variant: cur.variant,
      });
      return { ...cur, stepIndex: clamped };
    });
  }, []);

  const value = useMemo<TutorialContextValue>(
    () => ({ active, start, exit }),
    [active, start, exit],
  );

  return (
    <TutorialContext.Provider value={value}>
      {children}
      {mounted && active &&
        createPortal(
          <TutorialOverlay
            active={active}
            onBack={back}
            onNext={advance}
            onExit={exit}
            onJump={jumpTo}
          />,
          document.body,
        )}
    </TutorialContext.Provider>
  );
}

function TutorialOverlay({
  active,
  onBack,
  onNext,
  onExit,
  onJump,
}: {
  active: ActiveTutorial;
  onBack: () => void;
  onNext: () => void;
  onExit: () => void;
  onJump: (index: number) => void;
}) {
  const step = active.steps[active.stepIndex];
  const anchorKeys: string | string[] | null =
    step.anchor.kind === "anchor"
      ? step.anchor.key
      : step.anchor.kind === "anchor-bbox"
        ? step.anchor.keys
        : null;

  // Publish the active step id on <body> so step-specific CSS
  // decorations (e.g. the player pulse on "select-player") can target it
  // without coupling the editor to tutorial state. Cleared on unmount.
  useEffect(() => {
    document.body.dataset.tutorialStep = step.id;
    return () => {
      delete document.body.dataset.tutorialStep;
    };
  }, [step.id]);

  // State-shepherd: dispatch the step's onEnter action so the editor
  // can nudge itself into the right UI state. Fires on step entry only
  // — the user keeps full freedom mid-step. The detail is the action
  // descriptor (e.g. `{ kind: "ensure-player-selected" }`); listeners
  // live in `PlayEditorClient`.
  //
  // We dispatch twice — synchronously, and again on the next animation
  // frame. Single-shot dispatch loses races against React's render
  // pipeline: if the previous step's UI is mid-commit when the step
  // transitions (e.g. a click that selects a player landing in the
  // same tick as Next), the post-commit selection survives a single
  // clear. The follow-up dispatch on rAF runs *after* the commit
  // settles, catching that case.
  useEffect(() => {
    if (!step.onEnter) return;
    const detail = step.onEnter;
    function fire() {
      window.dispatchEvent(
        new CustomEvent("tutorial:on-enter", { detail }),
      );
    }
    fire();
    const raf = window.requestAnimationFrame(fire);
    return () => window.cancelAnimationFrame(raf);
  }, [step.id, step.onEnter]);

  // Click-on-anchor auto-advance. We attach a capture-phase listener on the
  // document so the click still flows to its natural handler — we only
  // *observe* it.
  const onNextRef = useRef(onNext);
  useEffect(() => {
    onNextRef.current = onNext;
  }, [onNext]);
  useEffect(() => {
    if (step.advance.kind !== "click") return;
    const key = step.advance.key;
    function onClick(e: MouseEvent) {
      const t = e.target as Element | null;
      if (!t) return;
      const hit = t.closest(`[data-tutor="${key}"]`);
      if (hit) onNextRef.current();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [step.advance.kind === "click" ? step.advance.key : null, step.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Appear-on-mount auto-advance. Only fires when the target was *absent*
  // at step entry — otherwise hitting Back would silently re-skip the step.
  useEffect(() => {
    if (step.advance.kind !== "appear") return;
    const key = step.advance.key;
    const wasPresent = !!document.querySelector(`[data-tutor="${key}"]`);
    if (wasPresent) return;
    const obs = new MutationObserver(() => {
      if (document.querySelector(`[data-tutor="${key}"]`)) {
        onNextRef.current();
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [step.advance.kind === "appear" ? step.advance.key : null, step.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gate watcher. Two flavors:
  //   - `anchor-present`: Tracks whether the gate's target element
  //     is currently in the DOM. Reactive by default; `latched: true`
  //     makes it one-way (once true, stays true for the step).
  //   - `action-fired`: Tracks whether the named action has fired
  //     during this step. Action-fired gates are always latched in
  //     effect, since actions only ever transition from "not fired"
  //     to "fired" within a step (we reset on step change).
  const [gatePresent, setGatePresent] = useState(true);
  useEffect(() => {
    if (!step.gate) {
      setGatePresent(true);
      return;
    }
    if (step.gate.kind === "action-fired") {
      // Action gates derive from the engine's per-step action Set.
      // Handled below by a separate effect that watches `actions`.
      return;
    }
    const key = step.gate.key;
    const latched = step.gate.latched === true;
    let latchedSatisfied = false;
    function check() {
      const present = !!document.querySelector(`[data-tutor="${key}"]`);
      if (latched) {
        if (present) latchedSatisfied = true;
        setGatePresent(latchedSatisfied);
      } else {
        setGatePresent(present);
      }
    }
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [step.id, step.gate?.kind, step.gate?.kind === "anchor-present" ? step.gate.key : null, step.gate?.kind === "anchor-present" ? step.gate.latched : null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes the tutorial.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onExit();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onExit]);

  // Detect input modality once on mount. Steps use this to pick
  // platform-correct copy (e.g. "Right-click" on mouse, "Press-and-hold"
  // on touch) instead of listing both with awkward "Or on touch…"
  // suffixes.
  const [pointer, setPointer] = useState<"touch" | "mouse">("mouse");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isTouch =
      "ontouchstart" in window ||
      (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
    setPointer(isTouch ? "touch" : "mouse");
  }, []);

  // Track which action-kinds the coach has performed during the
  // current step. Editor handlers dispatch `tutorial:action` events
  // via `notifyTutorialAction`; we accumulate them here and pass
  // through to the body so it can render reactive checkboxes that
  // flip as the coach experiments. Resets on every step transition
  // so each step starts with a clean slate.
  const [actions, setActions] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    setActions(new Set());
  }, [step.id]);
  useEffect(() => {
    function onAction(e: Event) {
      const detail = (e as CustomEvent).detail as { kind?: string } | undefined;
      const kind = detail?.kind;
      if (!kind) return;
      setActions((prev) => {
        if (prev.has(kind)) return prev;
        const next = new Set(prev);
        next.add(kind);
        return next;
      });
    }
    window.addEventListener(TUTORIAL_ACTION_EVENT, onAction);
    return () => window.removeEventListener(TUTORIAL_ACTION_EVENT, onAction);
  }, []);

  // Bridge: action-fired gates derive their `gatePresent` from the
  // action Set. Sits separately from the anchor-present watcher so the
  // two flavors of gate don't have to share an effect.
  useEffect(() => {
    if (step.gate?.kind === "action-fired") {
      setGatePresent(actions.has(step.gate.action));
    }
  }, [step.gate?.kind, step.gate?.kind === "action-fired" ? step.gate.action : null, actions]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = step.body({ variant: active.variant, pointer, actions });
  const isLast = active.stepIndex === active.steps.length - 1;
  // `appear`-advance steps wait on the user doing the real action. The
  // manual button becomes "Skip step" so users aren't blocked if they can't
  // (or don't want to) perform the action right now.
  const nextLabel =
    step.nextLabel ??
    (step.advance.kind === "appear"
      ? "Skip step"
      : isLast
        ? "Finish"
        : "Next");

  const dimBackground = step.dimBackground ?? true;

  // When the user clicks Next while the step's gate is unmet, fire a
  // one-shot pulse on whatever decorations the active step has wired up.
  // Two channels:
  //   - PLAYER_PULSE_EVENT pulses the player markers on the
  //     `select-player` step (PlayerRipples subscribes by stepId).
  //   - ANCHOR_PULSE_EVENT pulses the gate's `nudgeAnchor` element,
  //     for steps where the required action lives outside the
  //     spotlight (e.g. step 8's Done button).
  const handleGatedNudge = () => {
    window.dispatchEvent(new Event(PLAYER_PULSE_EVENT));
    if (step.gate?.kind === "anchor-present" && step.gate.nudgeAnchor) {
      window.dispatchEvent(
        new CustomEvent(ANCHOR_PULSE_EVENT, {
          detail: { key: step.gate.nudgeAnchor },
        }),
      );
    }
    if (
      step.gate?.kind === "action-fired" &&
      step.gate.nudgePulseRouteAnchors
    ) {
      window.dispatchEvent(new Event(ROUTE_ANCHOR_PULSE_EVENT));
    }
  };

  // Nudge anchor is only available on anchor-present gates — narrow
  // the type before reaching in so the renderer below stays clean.
  const nudgeAnchor =
    step.gate?.kind === "anchor-present" ? step.gate.nudgeAnchor : undefined;

  return (
    <>
      <Spotlight
        anchor={anchorKeys}
        allow={[
          ...(nudgeAnchor ? [nudgeAnchor] : []),
          ...(step.allowAnchors ?? []),
        ]}
        dim={dimBackground}
      />
      <PlayerRipples stepId={step.id} />
      <AnchorPulse stepKey={nudgeAnchor ?? null} />
      <RouteAnchorPulse />
      <StepCard
        title={step.title}
        body={body}
        stepIndex={active.stepIndex}
        steps={active.steps}
        canBack={active.stepIndex > 0}
        onBack={onBack}
        onNext={onNext}
        onExit={onExit}
        onJump={onJump}
        nextLabel={nextLabel}
        nextEnabled={gatePresent}
        gateHint={
          !gatePresent && step.gate
            ? typeof step.gate.hint === "function"
              ? step.gate.hint({ pointer })
              : step.gate.hint
            : undefined
        }
        onGatedNudge={handleGatedNudge}
      />
    </>
  );
}
