"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FlaskConical, Loader2 } from "lucide-react";
import { Card } from "@/components/ui";
import {
  getFunctionalTestRunStepsAction,
  type FunctionalTestRun,
  type FunctionalTestStep,
} from "@/app/actions/admin-functional-tests";

/** A single workflow step slower than this reads as a perf regression worth a
 *  glance (amber). Tuned soft for now — most steps are well under a few seconds. */
const SLOW_STEP_MS = 8000;

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

function fmtWhen(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function StatusPill({ status }: { status: "passed" | "failed" | "skipped" }) {
  const cls =
    status === "passed"
      ? "bg-success-light text-success"
      : status === "failed"
        ? "bg-danger-light text-danger"
        : "bg-foreground/10 text-muted";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {status}
    </span>
  );
}

const TRIGGER_LABEL: Record<string, string> = {
  post_deploy: "post-deploy",
  nightly: "nightly",
  manual: "manual",
};

function StepGallery({ runId }: { runId: string }) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; steps: FunctionalTestStep[] }
  >({ kind: "idle" });

  // Fetch once on first render.
  if (state.kind === "idle") {
    setState({ kind: "loading" });
    void getFunctionalTestRunStepsAction(runId).then((res) => {
      if (res.ok) setState({ kind: "ready", steps: res.steps });
      else setState({ kind: "error", message: res.error });
    });
  }

  if (state.kind === "loading" || state.kind === "idle") {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-xs text-muted">
        <Loader2 className="size-4 animate-spin" /> Loading steps…
      </div>
    );
  }
  if (state.kind === "error") {
    return <div className="px-4 py-4 text-xs text-danger">Couldn&rsquo;t load steps: {state.message}</div>;
  }
  if (state.steps.length === 0) {
    return <div className="px-4 py-4 text-xs text-muted">No steps recorded for this run.</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
      {state.steps.map((s) => (
        <div
          key={s.id}
          className="overflow-hidden rounded-xl border border-border bg-surface-raised"
        >
          {s.screenshotUrl ? (
            <a href={s.screenshotUrl} target="_blank" rel="noreferrer">
              {/* Admin-only thumbnail of an external Supabase URL with varying
                  dimensions — next/image would need per-host config + sizing
                  for no real benefit here; plain <img> matches other admin UI. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.screenshotUrl}
                alt={s.stepName}
                className="aspect-video w-full bg-surface-inset object-cover object-top"
                loading="lazy"
              />
            </a>
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-surface-inset text-[10px] text-muted">
              no screenshot
            </div>
          )}
          <div className="space-y-1 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold text-foreground">
                {s.ordinal}. {s.stepName}
              </span>
              <StatusPill status={s.status} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted">
              <span className="truncate">{s.scenario}</span>
              {s.durationMs != null && (
                <span
                  className={
                    s.durationMs > SLOW_STEP_MS ? "font-semibold text-warning" : undefined
                  }
                  title={s.durationMs > SLOW_STEP_MS ? "Slower than expected" : undefined}
                >
                  {fmtDuration(s.durationMs)}
                </span>
              )}
            </div>
            {s.errorMessage && (
              <p className="line-clamp-3 rounded bg-danger-light px-2 py-1 text-[10px] text-danger">
                {s.errorMessage}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function RunRow({ run }: { run: FunctionalTestRun }) {
  const [open, setOpen] = useState(false);
  const failed = run.status === "failed";
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-inset"
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted" />
        )}
        <StatusPill status={run.status} />
        <span className="flex-1 truncate text-sm font-medium text-foreground">
          {TRIGGER_LABEL[run.trigger] ?? run.trigger}
          {run.gitSha ? ` · ${run.gitSha.slice(0, 7)}` : ""}
        </span>
        <span className="hidden text-xs text-muted sm:inline">
          {failed ? `${run.failedSteps}/${run.totalSteps} steps failed` : `${run.totalSteps} steps`}
        </span>
        <span className="text-xs text-muted">{fmtDuration(run.durationMs)}</span>
        <span className="w-20 shrink-0 text-right text-xs text-muted">
          {fmtWhen(run.createdAt)}
        </span>
      </button>
      {open && (
        <div className="border-t border-border">
          {run.gifs && Object.keys(run.gifs).length > 0 && (
            <ScenarioGifs gifs={run.gifs} />
          )}
          <StepGallery runId={run.id} />
        </div>
      )}
    </div>
  );
}

/** Animated per-scenario replays — a quick visual summary of each workflow,
 *  assembled from the step screenshots by the reporter. */
function ScenarioGifs({ gifs }: { gifs: Record<string, string> }) {
  return (
    <div className="border-b border-border px-4 py-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Workflow replays
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Object.entries(gifs).map(([scenario, url]) => (
          <figure
            key={scenario}
            className="overflow-hidden rounded-xl border border-border bg-surface-raised"
          >
            <a href={url} target="_blank" rel="noreferrer">
              {/* Animated GIF replay of the scenario (external Supabase URL). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`${scenario} replay`}
                className="w-full bg-surface-inset"
                loading="lazy"
              />
            </a>
            <figcaption className="px-2.5 py-1.5 text-xs font-medium text-foreground">
              {scenario}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/**
 * Functional Testing — results from the headless production workflows
 * (tests/functional/*.spec.ts) that GitHub Actions runs post-deploy + nightly.
 * Each run lists its captured steps with screenshots, status, and timing so a
 * regression (e.g. invite-accept breaking) is visible at a glance.
 */
export function FunctionalTestingAdminClient({
  runs,
  error,
}: {
  runs: FunctionalTestRun[];
  error: string | null;
}) {
  if (error) {
    return (
      <Card className="p-4">
        <div className="text-sm text-danger">{error}</div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-muted" aria-hidden />
          <h2 className="text-lg font-semibold">Functional tests</h2>
        </div>
        <p className="mt-1 text-sm text-muted">
          Headless runs of core user workflows (invite→accept, create playbook,
          Coach AI, print) against production — post-deploy and nightly. Expand a
          run to see each step&rsquo;s screenshot, status, and timing.
        </p>
      </div>

      {runs.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          No runs yet. They appear here after the next deploy or nightly run (or a
          manual trigger of the &ldquo;Functional tests&rdquo; workflow).
        </Card>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
