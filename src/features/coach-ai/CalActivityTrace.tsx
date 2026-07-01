"use client";

import { useState } from "react";
import { Check, ChevronRight, Wrench } from "lucide-react";
import { activityLabel, collapseSteps, type ActivityStep } from "./calActivity";

/**
 * Cal's activity trace — the "what is Cal doing right now" panel, styled after
 * the collapsible thinking trace in chat UIs like Claude.ai.
 *
 * Two modes:
 *
 * - `live`   — shown WHILE Cal is working (before any answer text streams).
 *              Renders the ordered steps as they arrive, the most recent one
 *              animated as "in progress". Always expanded so the coach gets
 *              real-time feedback instead of a bare spinner.
 *
 * - `done`   — shown on a FINISHED assistant turn. Collapsed by default to a
 *              one-line summary so it doesn't clutter the history; clicking it
 *              reveals the full step list. This is why the net result reads the
 *              same as before — the detail is there, just tucked away.
 *
 * Both modes derive their labels from `collapseSteps`, so consecutive repeats
 * of the same tool render as a single "Evaluating the matchup ×3" row.
 */

type LiveProps = {
  mode: "live";
  /** Ordered raw tool names seen so far this turn. */
  toolCalls: string[];
  /** Latest server status line (the in-flight action), or null. */
  statusText: string | null;
};

type DoneProps = {
  mode: "done";
  /** Ordered raw tool names for the completed turn. */
  toolCalls: string[];
};

export function CalActivityTrace(props: LiveProps | DoneProps) {
  if (props.mode === "live") return <LiveTrace {...props} />;
  return <DoneTrace toolCalls={props.toolCalls} />;
}

/** Three staggered pulsing dots — the "thinking" affordance. */
function Dots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Thinking">
      <span className="size-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: "0ms" }} />
      <span className="size-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: "120ms" }} />
      <span className="size-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: "240ms" }} />
    </span>
  );
}

function StepLabel({ step }: { step: ActivityStep }) {
  return (
    <span>
      {step.label}
      {step.count > 1 && <span className="text-muted/70"> ×{step.count}</span>}
    </span>
  );
}

function LiveTrace({ toolCalls, statusText }: LiveProps) {
  // The status line is the label of the CURRENTLY running tool, which is also
  // the last element of toolCalls — so we split: everything before the last
  // tool is "done", and the active row is the status line (falling back to the
  // last tool's label, then to a generic "Thinking…" when nothing has run yet).
  const done = collapseSteps(toolCalls.slice(0, Math.max(0, toolCalls.length - 1)));
  const lastTool = toolCalls[toolCalls.length - 1];
  const activeLabel = statusText ?? (lastTool ? `${activityLabel(lastTool)}…` : "Thinking…");

  return (
    <div className="mt-1 space-y-1 border-l-2 border-primary/15 pl-2.5 text-[11px] text-muted">
      {done.map((step, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Check className="size-3 shrink-0 text-primary/60" />
          <StepLabel step={step} />
        </div>
      ))}
      <div className="flex items-center gap-1.5 text-muted">
        <span className="flex size-3 shrink-0 items-center justify-center">
          <Dots />
        </span>
        <span className="italic">{activeLabel}</span>
      </div>
    </div>
  );
}

function DoneTrace({ toolCalls }: { toolCalls: string[] }) {
  const [open, setOpen] = useState(false);
  const steps = collapseSteps(toolCalls);
  if (steps.length === 0) return null;

  const totalRuns = steps.reduce((n, s) => n + s.count, 0);
  const summary = steps.length === 1 ? steps[0]!.label : `${steps.length} steps`;

  return (
    <div className="mt-1.5 text-[11px] text-muted">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded transition-colors hover:text-foreground"
        title={`Cal ran ${totalRuns} tool ${totalRuns === 1 ? "step" : "steps"}`}
      >
        <Wrench className="size-3 shrink-0" />
        <span>{summary}</span>
        <ChevronRight className={`size-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="mt-1 space-y-1 border-l-2 border-primary/15 pl-2.5">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Check className="size-3 shrink-0 text-primary/60" />
              <StepLabel step={step} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
