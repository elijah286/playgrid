"use client";

import { Smartphone } from "lucide-react";
import { Card } from "@/components/ui";
import type { AppMetricsSummary } from "@/lib/analytics/app-metrics";

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

const PLATFORM_LABEL: Record<string, string> = {
  ios: "iOS",
  android: "Android",
  other: "Other",
};

/**
 * Native-app install / active metrics. The whole point of this tab is the
 * exclusion: `app_installs` is written on every launch, so before public
 * release it's dominated by TestFlight testers, Apple App Review, and the
 * team's own dev devices. The numbers here are REAL installs only (internal
 * accounts excluded like the web analytics, anonymous never-signed-in opens
 * reported separately) so a pre-launch build can't read as healthy.
 */
export function AppMetricsAdminClient({
  summary,
  error,
}: {
  summary: AppMetricsSummary | null;
  error: string | null;
}) {
  if (error || !summary) {
    return (
      <Card className="p-4">
        <div className="text-sm text-red-700 dark:text-red-300">
          {error ?? "No app metrics available yet."}
        </div>
      </Card>
    );
  }

  const { real, excludedInternal, anonymousOpens, activeWindowDays, rowsConsidered } =
    summary;
  const activeRate =
    real.installs > 0 ? Math.round((real.active / real.installs) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-muted" aria-hidden />
          <h2 className="text-lg font-semibold">Native app</h2>
        </div>
        <p className="mt-1 text-sm text-muted">
          Real installs only — staff, reviewer, and configured tester accounts are
          excluded the same way the web analytics exclude them, and app opens with no
          signed-in user are reported separately rather than counted as users. Active
          = opened in the last {activeWindowDays} days.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Real installs"
          value={String(real.installs)}
          sub="signed-in, non-internal"
        />
        <StatTile
          label={`Active (${activeWindowDays}d)`}
          value={String(real.active)}
          sub={`${activeRate}% of real installs`}
        />
        <StatTile
          label="Internal / testers"
          value={String(excludedInternal)}
          sub="excluded from the counts"
        />
        <StatTile
          label="Anonymous opens"
          value={String(anonymousOpens)}
          sub="opened, never signed in"
        />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-muted">
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left font-medium">Platform</th>
                <th className="px-3 py-2 text-right font-medium">Real installs</th>
                <th className="px-3 py-2 text-right font-medium">
                  Active ({activeWindowDays}d)
                </th>
              </tr>
            </thead>
            <tbody>
              {real.byPlatform.map((p) => (
                <tr key={p.platform} className="border-t border-border">
                  <td className="px-3 py-2">
                    {PLATFORM_LABEL[p.platform] ?? p.platform}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.installs}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.active}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted">
        Based on {rowsConsidered} install row{rowsConsidered === 1 ? "" : "s"} total.
      </p>
    </div>
  );
}
