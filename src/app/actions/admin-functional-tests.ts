"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";

const SITE_ROW_ID = "default";

/**
 * GitHub deep link that opens the "new classic token" page with the scopes and
 * description preselected. Fine-grained tokens can't be preconfigured via URL,
 * so we use a classic PAT — `repo` + `workflow` covers triggering
 * workflow_dispatch on the (private) repo. Surfaced next to the token field so
 * an admin can mint the exact token in one click. (Not exported — a "use
 * server" module may only export async functions; the value reaches the client
 * via getGithubDispatchTokenStatusAction's `createUrl`.)
 */
const GITHUB_TOKEN_CREATE_URL =
  "https://github.com/settings/tokens/new?description=XO+Gridmaker+functional+tests&scopes=repo,workflow";

/** Read the dispatch token: admin-entered (site_settings) first, env fallback.
 *  Server-only — never returned to the client. */
async function readGithubDispatchToken(): Promise<string | null> {
  try {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("site_settings")
      .select("github_dispatch_token")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    const stored = (data?.github_dispatch_token as string | null) ?? null;
    if (stored && stored.trim()) return stored.trim();
  } catch {
    // Column may not exist yet (migration not applied) — fall through to env.
  }
  const env = process.env.GITHUB_DISPATCH_TOKEN;
  return env && env.trim() ? env.trim() : null;
}

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
 * Token: stored in site_settings (entered from the admin UI) with a
 * GITHUB_DISPATCH_TOKEN env var as fallback — see readGithubDispatchToken().
 * Config (env, optional overrides):
 *   - GITHUB_REPO         — "owner/name" (defaults to elijah286/playgrid).
 *   - GITHUB_DISPATCH_REF — branch to run from (defaults to "main").
 *
 * Returns `needsToken: true` (not a throw) when no token is configured so the
 * admin UI can surface the token field + "create one" link instead of 500-ing.
 */
export async function runCoachCalFunctionalTestsAction(): Promise<
  { ok: true } | { ok: false; error: string; needsToken?: boolean }
> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const token = await readGithubDispatchToken();
  if (!token) {
    return {
      ok: false,
      needsToken: true,
      error:
        "No GitHub token is configured. Paste a token below to enable on-demand Coach Cal runs.",
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

export type GithubDispatchTokenStatus = {
  /** Whether a usable token is configured (from the DB or the env fallback). */
  configured: boolean;
  /** Where the active token comes from — so the admin knows whether editing the
   *  field will take effect (db) or the env var is in play (env). */
  source: "db" | "env" | "none";
  /** Masked, human-readable status — never the token itself. */
  statusLabel: string;
  /** GitHub deep link to mint a preconfigured classic token. */
  createUrl: string;
};

/** Masked status of the dispatch token for the admin UI. Never returns the
 *  token value. */
export async function getGithubDispatchTokenStatusAction(): Promise<
  { ok: true; status: GithubDispatchTokenStatus } | { ok: false; error: string }
> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  let stored: string | null = null;
  try {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("site_settings")
      .select("github_dispatch_token")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    stored = (data?.github_dispatch_token as string | null) ?? null;
    stored = stored && stored.trim() ? stored.trim() : null;
  } catch {
    /* column may not exist yet — treat as unset */
  }
  const env =
    process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_DISPATCH_TOKEN.trim()
      ? process.env.GITHUB_DISPATCH_TOKEN.trim()
      : null;

  const active = stored ?? env;
  const source: GithubDispatchTokenStatus["source"] = stored
    ? "db"
    : env
      ? "env"
      : "none";
  const tail = active && active.length >= 4 ? active.slice(-4) : "••••";
  const statusLabel = !active
    ? "No token saved yet."
    : source === "env"
      ? `Using the GITHUB_DISPATCH_TOKEN env var (ends …${tail}). Saving one here overrides it.`
      : `Token saved (ends …${tail}).`;

  return {
    ok: true,
    status: { configured: !!active, source, statusLabel, createUrl: GITHUB_TOKEN_CREATE_URL },
  };
}

/** Save (overwrite) the GitHub dispatch token. */
export async function saveGithubDispatchTokenAction(
  rawToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const token = (rawToken ?? "").trim();
  if (!token) return { ok: false, error: "Paste a GitHub token before saving." };
  // Cheap shape guard — GitHub PATs start with ghp_ (classic) or
  // github_pat_ (fine-grained). Don't hard-reject (formats can change), just
  // catch obvious paste mistakes.
  if (!/^(ghp_|github_pat_|gho_|ghs_)/.test(token) && token.length < 20) {
    return { ok: false, error: "That doesn't look like a GitHub token." };
  }
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("site_settings")
      .update({ github_dispatch_token: token, updated_at: new Date().toISOString() })
      .eq("id", SITE_ROW_ID);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}

/** Remove the saved token (the env-var fallback, if any, takes over again). */
export async function clearGithubDispatchTokenAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("site_settings")
      .update({ github_dispatch_token: null, updated_at: new Date().toISOString() })
      .eq("id", SITE_ROW_ID);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not remove the token." };
  }
}
