"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export type FunctionalTestRun = {
  id: string;
  gitSha: string | null;
  trigger: string;
  status: "passed" | "failed";
  environment: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  totalSteps: number;
  failedSteps: number;
  createdAt: string;
  /** Which suite produced the run ("core" | "cal"), from meta.suite. Older runs
   *  predate the field and read as "core". */
  suite: "core" | "cal";
  /** Per-scenario animated-GIF summary URLs ({ scenario: url }), from meta.gifs. */
  gifs: Record<string, string> | null;
  /** Per-scenario human title + description + pass/fail (what the test is for and
   *  whether it passed), from meta.scenarios — set by recorder.about() in each spec. */
  scenarios: Record<
    string,
    { title: string; description: string; status?: "passed" | "failed" }
  > | null;
};

export type FunctionalTestStep = {
  id: string;
  scenario: string;
  stepName: string;
  ordinal: number;
  status: "passed" | "failed" | "skipped";
  durationMs: number | null;
  screenshotUrl: string | null;
  errorMessage: string | null;
};

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") return { ok: false, error: "Forbidden." };
  return { ok: true };
}

/** Recent functional-test runs (newest first) for the admin "Functional Testing" tab. */
export async function listFunctionalTestRunsAction(
  limit = 20,
): Promise<{ ok: true; runs: FunctionalTestRun[] } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("functional_test_runs")
    .select(
      "id, git_sha, trigger, status, environment, started_at, finished_at, duration_ms, total_steps, failed_steps, created_at, meta",
    )
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, Math.floor(limit))));
  if (error) return { ok: false, error: error.message };

  const runs: FunctionalTestRun[] = (data ?? []).map((r) => ({
    id: r.id as string,
    gitSha: (r.git_sha as string | null) ?? null,
    trigger: (r.trigger as string) ?? "manual",
    status: (r.status as "passed" | "failed") ?? "failed",
    environment: (r.environment as string | null) ?? null,
    startedAt: r.started_at as string,
    finishedAt: r.finished_at as string,
    durationMs: (r.duration_ms as number) ?? 0,
    totalSteps: (r.total_steps as number) ?? 0,
    failedSteps: (r.failed_steps as number) ?? 0,
    createdAt: r.created_at as string,
    suite:
      (r.meta as { suite?: string } | null)?.suite === "cal" ? "cal" : "core",
    gifs:
      (r.meta as { gifs?: Record<string, string> } | null)?.gifs ?? null,
    scenarios:
      (r.meta as { scenarios?: Record<string, { title: string; description: string }> } | null)
        ?.scenarios ?? null,
  }));
  return { ok: true, runs };
}

/** The captured steps (with screenshot URLs) for one run, in order. */
export async function getFunctionalTestRunStepsAction(
  runId: string,
): Promise<{ ok: true; steps: FunctionalTestStep[] } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("functional_test_steps")
    .select(
      "id, scenario, step_name, ordinal, status, duration_ms, screenshot_url, error_message",
    )
    .eq("run_id", runId)
    .order("ordinal", { ascending: true });
  if (error) return { ok: false, error: error.message };

  const steps: FunctionalTestStep[] = (data ?? []).map((s) => ({
    id: s.id as string,
    scenario: s.scenario as string,
    stepName: s.step_name as string,
    ordinal: s.ordinal as number,
    status: (s.status as "passed" | "failed" | "skipped") ?? "passed",
    durationMs: (s.duration_ms as number | null) ?? null,
    screenshotUrl: (s.screenshot_url as string | null) ?? null,
    errorMessage: (s.error_message as string | null) ?? null,
  }));
  return { ok: true, steps };
}

/**
 * Trigger the Coach Cal functional tests on demand.
 *
 * The specs run headless Playwright + Chromium, which can't run inside the
 * Next.js server — they only run in GitHub Actions. So this dispatches the
 * "Functional tests" workflow (.github/workflows/functional-tests.yml) with
 * `suite=cal`, which runs ONLY the token-spending Coach Cal scenarios against
 * production and ingests the results back into this tab a few minutes later.
 *
 * Config (Cloud Run env):
 *   - GITHUB_DISPATCH_TOKEN — a GitHub token with `actions: write` on the repo
 *     (fine-grained PAT scoped to this repo, or a classic PAT with `repo`).
 *   - GITHUB_REPO           — "owner/name" (defaults to elijah286/playgrid).
 *   - GITHUB_DISPATCH_REF   — branch to run from (defaults to "main").
 *
 * Returns a friendly error (not a throw) when the token isn't configured so the
 * admin UI can explain the one-time setup step instead of 500-ing.
 */
export async function runCoachCalFunctionalTestsAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return {
      ok: false,
      error:
        "GitHub dispatch isn't configured. Add a GITHUB_DISPATCH_TOKEN (a token with actions:write on the repo) to the Cloud Run service, then try again.",
    };
  }
  const repo = process.env.GITHUB_REPO || "elijah286/playgrid";
  const ref = process.env.GITHUB_DISPATCH_REF || "main";
  const workflow = "functional-tests.yml";

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "xogridmaker-admin",
        },
        body: JSON.stringify({ ref, inputs: { suite: "cal" } }),
      },
    );
    // A successful dispatch is 204 No Content.
    if (res.status === 204) return { ok: true };
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      detail = body?.message ? ` — ${body.message}` : "";
    } catch {
      /* non-JSON body */
    }
    return {
      ok: false,
      error: `GitHub returned ${res.status}${detail}. Check the token's permissions (actions:write) and that the workflow exists on "${ref}".`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not reach GitHub.",
    };
  }
}
