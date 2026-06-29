"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FlaskConical,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import {
  getFunctionalTestRunStepsAction,
  getGithubDispatchTokenStatusAction,
  runCoachCalFunctionalTestsAction,
  saveGithubDispatchTokenAction,
  clearGithubDispatchTokenAction,
  type FunctionalTestRun,
  type FunctionalTestStep,
  type GithubDispatchTokenStatus,
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

// Fallback for the "create a token" deep link if the token-status action hasn't
// resolved yet (it also returns this URL as status.createUrl). Classic PAT page
// with repo+workflow scopes + a description preselected.
const GITHUB_TOKEN_CREATE_URL_FALLBACK =
  "https://github.com/settings/tokens/new?description=XO+Gridmaker+functional+tests&scopes=repo,workflow";

function StepGallery({ steps }: { steps: FunctionalTestStep[] }) {
  if (steps.length === 0) {
    return <div className="px-4 py-4 text-xs text-muted">No steps recorded for this run.</div>;
  }

  // Stills are stored only for FAILED steps now, so this is a compact step
  // timeline: passing steps show as text rows; failed steps surface their
  // error + still inline so the nature of the failure is obvious.
  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
      {steps.map((s) => (
        <div
          key={s.id}
          className={`overflow-hidden rounded-xl border bg-surface-raised ${
            s.status === "failed" ? "border-danger/60" : "border-border"
          }`}
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
          ) : null}
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
  const [steps, setSteps] = useState<FunctionalTestStep[] | null>(null);
  const [stepsError, setStepsError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  // Fetch steps the first time the run is expanded (setState only in the async
  // callback, so we don't trip the set-state-in-effect lint rule).
  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;
    getFunctionalTestRunStepsAction(run.id).then((res) => {
      if (res.ok) setSteps(res.steps);
      else setStepsError(res.error);
    });
  }, [open, run.id]);

  const failed = run.status === "failed";
  const failedScenarios = Object.entries(run.scenarios ?? {}).filter(
    ([, v]) => v.status === "failed",
  );
  // First failing step's error per scenario (for the scenario cards).
  const errorByScenario: Record<string, string> = {};
  for (const s of steps ?? []) {
    if (s.status === "failed" && s.errorMessage && !errorByScenario[s.scenario]) {
      errorByScenario[s.scenario] = s.errorMessage;
    }
  }

  return (
    <div
      className={`rounded-2xl border bg-surface ${failed ? "border-danger/50" : "border-border"}`}
    >
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
        {run.suite === "cal" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            <Sparkles className="size-3" aria-hidden /> Coach Cal
          </span>
        )}
        <span className="flex-1 truncate text-sm font-medium text-foreground">
          {TRIGGER_LABEL[run.trigger] ?? run.trigger}
          {run.gitSha ? ` · ${run.gitSha.slice(0, 7)}` : ""}
        </span>
        <span
          className={`hidden text-xs sm:inline ${failed ? "font-semibold text-danger" : "text-muted"}`}
        >
          {failed
            ? `${failedScenarios.length || run.failedSteps} failed`
            : `${run.totalSteps} steps`}
        </span>
        <span className="text-xs text-muted">{fmtDuration(run.durationMs)}</span>
        <span className="w-20 shrink-0 text-right text-xs text-muted">
          {fmtWhen(run.createdAt)}
        </span>
      </button>

      {/* Failed scenario names — visible even when collapsed, so a reviewer can
          scan the run list and immediately see WHAT broke. */}
      {failed && failedScenarios.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2.5">
          <span className="text-[11px] font-medium text-danger">Failed:</span>
          {failedScenarios.map(([k, v]) => (
            <span
              key={k}
              className="rounded bg-danger-light px-2 py-0.5 text-[11px] font-medium text-danger"
            >
              {v.title || k}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="border-t border-border">
          <ScenarioReplays
            gifs={run.gifs}
            scenarios={run.scenarios}
            errorByScenario={errorByScenario}
          />
          {steps === null && stepsError === null && (
            <div className="flex items-center gap-2 px-4 py-4 text-xs text-muted">
              <Loader2 className="size-4 animate-spin" /> Loading steps…
            </div>
          )}
          {stepsError && (
            <div className="px-4 py-4 text-xs text-danger">
              Couldn&rsquo;t load steps: {stepsError}
            </div>
          )}
          {steps && <StepGallery steps={steps} />}
        </div>
      )}
    </div>
  );
}

/** Per-scenario cards: what each test is for (title + description) alongside its
 *  animated replay, so a reviewer can tell at a glance which scenario does what. */
function ScenarioReplays({
  gifs,
  scenarios,
  errorByScenario,
}: {
  gifs: Record<string, string> | null;
  scenarios: Record<
    string,
    { title: string; description: string; status?: "passed" | "failed" }
  > | null;
  errorByScenario: Record<string, string>;
}) {
  // Union of scenario keys from the descriptions and the replays; show failed
  // scenarios first so a reviewer's eye lands on them.
  const keys = Array.from(
    new Set([...Object.keys(scenarios ?? {}), ...Object.keys(gifs ?? {})]),
  ).sort((a, b) => {
    const af = scenarios?.[a]?.status === "failed" ? 0 : 1;
    const bf = scenarios?.[b]?.status === "failed" ? 0 : 1;
    return af - bf;
  });
  if (keys.length === 0) return null;
  return (
    <div className="border-b border-border px-4 py-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        Scenarios
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {keys.map((key) => {
          const meta = scenarios?.[key];
          const url = gifs?.[key];
          const scenarioFailed = meta?.status === "failed";
          const err = errorByScenario[key];
          return (
            <figure
              key={key}
              className={`overflow-hidden rounded-xl border bg-surface-raised ${
                scenarioFailed ? "border-danger/60" : "border-border"
              }`}
            >
              {url ? (
                <a href={url} target="_blank" rel="noreferrer">
                  {/* Animated replay of the scenario (external Supabase URL). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`${meta?.title || key} replay`}
                    className="w-full bg-surface-inset"
                    loading="lazy"
                  />
                </a>
              ) : null}
              <figcaption className="space-y-1.5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {meta?.title || key}
                  </p>
                  {meta?.status && <StatusPill status={meta.status} />}
                </div>
                {meta?.description && (
                  <p className="text-xs leading-relaxed text-muted">{meta.description}</p>
                )}
                {scenarioFailed && err && (
                  <p className="whitespace-pre-wrap rounded bg-danger-light px-2 py-1 text-[11px] text-danger">
                    {err}
                  </p>
                )}
                <p className="text-[10px] uppercase tracking-wide text-muted-light">
                  {key}
                </p>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Coach Cal on-demand run controls + GitHub token setup.
 *
 * The Cal scenarios run only in GitHub Actions, so triggering them needs a
 * GitHub token (dispatch permission). When one is configured we show the
 * "Run Coach Cal tests" button; when it's missing we replace it with a field
 * to paste a token, alongside a one-click link that opens GitHub's new-token
 * page with the right scopes preselected.
 */
function CalRunControls() {
  const [status, setStatus] = useState<GithubDispatchTokenStatus | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  // Show the token field when no token is configured, or when the admin clicks
  // "Change". Null until status loads so we don't flash the wrong UI.
  const [editing, setEditing] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function refreshStatus() {
    getGithubDispatchTokenStatusAction().then((res) => {
      if (res.ok) setStatus(res.status);
      else setLoadErr(res.error);
    });
  }

  // Load token status once on mount.
  useEffect(() => {
    refreshStatus();
  }, []);

  function runCalTests() {
    setMsg(null);
    start(async () => {
      const res = await runCoachCalFunctionalTestsAction();
      if (res.ok) {
        setMsg({
          kind: "ok",
          text: "Triggered. The run executes on GitHub against production and appears below in a few minutes — refresh to see it.",
        });
      } else if (res.needsToken) {
        setEditing(true);
        refreshStatus();
        setMsg({ kind: "error", text: res.error });
      } else {
        setMsg({ kind: "error", text: res.error });
      }
    });
  }

  function saveToken() {
    setMsg(null);
    start(async () => {
      const res = await saveGithubDispatchTokenAction(tokenInput);
      if (res.ok) {
        setTokenInput("");
        setEditing(false);
        setMsg({ kind: "ok", text: "Token saved. You can run Coach Cal tests now." });
        refreshStatus();
      } else {
        setMsg({ kind: "error", text: res.error });
      }
    });
  }

  function removeToken() {
    setMsg(null);
    start(async () => {
      const res = await clearGithubDispatchTokenAction();
      if (res.ok) {
        setMsg({ kind: "ok", text: "Token removed." });
        refreshStatus();
      } else {
        setMsg({ kind: "error", text: res.error });
      }
    });
  }

  const createUrl = status?.createUrl ?? GITHUB_TOKEN_CREATE_URL_FALLBACK;
  // Field is shown when there's no configured token or the admin chose to edit.
  const showField = status !== null && (!status.configured || editing);

  return (
    <div className="flex w-full max-w-md shrink-0 flex-col items-end gap-2 sm:w-auto">
      {status === null && loadErr === null ? (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="size-4 animate-spin" /> Checking GitHub setup…
        </div>
      ) : showField ? (
        <div className="w-full rounded-xl border border-border bg-surface-raised p-3 text-left sm:w-80">
          <p className="text-xs font-semibold text-foreground">
            Connect a GitHub token to run Coach Cal tests
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
            The Cal scenarios run in GitHub Actions, so a token with workflow
            dispatch permission is needed.{" "}
            <a
              href={createUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-accent underline-offset-2 hover:underline"
            >
              Create one <ExternalLink className="size-3" aria-hidden />
            </a>{" "}
            (scopes are preselected), then paste it here.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="ghp_… or github_pat_…"
              autoComplete="off"
              className="font-mono text-xs"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={saveToken}
              loading={pending}
              disabled={!tokenInput.trim()}
            >
              Save
            </Button>
          </div>
          {status?.configured && (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setTokenInput("");
              }}
              className="mt-1.5 text-[11px] text-muted underline-offset-2 hover:underline"
            >
              Cancel
            </button>
          )}
        </div>
      ) : (
        <Button
          variant="secondary"
          leftIcon={Sparkles}
          onClick={runCalTests}
          loading={pending}
          className="shrink-0"
        >
          Run Coach Cal tests
        </Button>
      )}

      {loadErr && <p className="text-[11px] text-danger">{loadErr}</p>}

      {/* Once configured (and not editing), show a tiny status + manage line. */}
      {status?.configured && !showField && (
        <p className="text-[11px] text-muted">
          {status.statusLabel}{" "}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="underline-offset-2 hover:underline"
          >
            Change
          </button>
          {status.source === "db" && (
            <>
              {" · "}
              <button
                type="button"
                onClick={removeToken}
                className="underline-offset-2 hover:underline"
              >
                Remove
              </button>
            </>
          )}
        </p>
      )}

      {msg && (
        <p
          className={`max-w-md text-right text-[11px] ${
            msg.kind === "ok" ? "text-success" : "text-danger"
          }`}
        >
          {msg.text}
        </p>
      )}
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-muted" aria-hidden />
            <h2 className="text-lg font-semibold">Functional tests</h2>
          </div>
          <p className="mt-1 text-sm text-muted">
            Headless runs of core user workflows (invite→accept, create playbook,
            print) against production — post-deploy and nightly. The Coach Cal
            scenarios spend real LLM tokens, so they&rsquo;re excluded from those
            automatic runs — trigger them on demand with the button. Expand a run
            to see each step&rsquo;s screenshot, status, and timing.
          </p>
        </div>
        <CalRunControls />
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
