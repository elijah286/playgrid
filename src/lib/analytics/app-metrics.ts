/**
 * Pure summarizer for native-app install/active metrics.
 *
 * Kept dependency-free and deterministic (caller passes `nowMs`) so the
 * classification logic is unit-testable without a database. The server action
 * `getAppMetricsSummaryAction` feeds it rows + the internal-exclusion set.
 *
 * The classification is the whole point: a row in `app_installs` is written on
 * every native launch — including TestFlight testers, Apple App Review, and the
 * team's own dev devices. Reporting those as real users is exactly the mistake
 * that made a pre-launch build look like it had 42% 7-day retention. So we split:
 *   - internal  → user_id is in the analytics-exclusion set (admins/staff/testers)
 *   - anonymous → no signed-in user (app opened, never authenticated)
 *   - real      → everything else (the only cohort that counts as a user)
 */

export type AppInstallRecord = {
  platform: string | null;
  user_id: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
};

export type AppPlatformKey = "ios" | "android" | "other";

export type AppPlatformBreakdown = {
  platform: AppPlatformKey;
  installs: number;
  active: number;
};

export type AppMetricsSummary = {
  activeWindowDays: number;
  rowsConsidered: number;
  real: {
    installs: number;
    active: number;
    byPlatform: AppPlatformBreakdown[];
  };
  excludedInternal: number;
  anonymousOpens: number;
};

export function normalizeAppPlatform(p: string | null | undefined): AppPlatformKey {
  const v = (p ?? "").toLowerCase();
  if (v === "ios") return "ios";
  if (v === "android") return "android";
  return "other";
}

export function summarizeAppInstalls(
  rows: readonly AppInstallRecord[],
  excludedUserIds: ReadonlySet<string>,
  opts: { nowMs: number; activeWindowDays?: number },
): AppMetricsSummary {
  const activeWindowDays = opts.activeWindowDays ?? 7;
  const cutoff = opts.nowMs - activeWindowDays * 24 * 60 * 60 * 1000;

  let excludedInternal = 0;
  let anonymousOpens = 0;
  const platforms = new Map<AppPlatformKey, { installs: number; active: number }>([
    ["ios", { installs: 0, active: 0 }],
    ["android", { installs: 0, active: 0 }],
    ["other", { installs: 0, active: 0 }],
  ]);

  for (const r of rows) {
    // Opened the app but never authenticated — not a real-user signal, and not
    // an internal account either. Reported on its own so it can't pad the count.
    if (!r.user_id) {
      anonymousOpens += 1;
      continue;
    }
    // Staff / admin / reviewer / configured tester accounts.
    if (excludedUserIds.has(r.user_id)) {
      excludedInternal += 1;
      continue;
    }
    const bucket = platforms.get(normalizeAppPlatform(r.platform))!;
    bucket.installs += 1;
    const last = r.last_opened_at ? Date.parse(r.last_opened_at) : NaN;
    if (!Number.isNaN(last) && last >= cutoff) bucket.active += 1;
  }

  const byPlatform: AppPlatformBreakdown[] = [...platforms.entries()].map(
    ([platform, v]) => ({ platform, installs: v.installs, active: v.active }),
  );
  const installs = byPlatform.reduce((s, p) => s + p.installs, 0);
  const active = byPlatform.reduce((s, p) => s + p.active, 0);

  return {
    activeWindowDays,
    rowsConsidered: rows.length,
    real: { installs, active, byPlatform },
    excludedInternal,
    anonymousOpens,
  };
}
