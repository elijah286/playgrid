"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui";
import {
  getActivationSummaryAction,
  type MonetizationSummary,
  type SportVariantTrend,
} from "@/app/actions/admin-activation";

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

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

function SportVariantTrendChart({ trends }: { trends: SportVariantTrend[] }) {
  if (trends.length === 0) return null;

  // Get all unique variants
  const allVariants = new Set<string>();
  trends.forEach((t) => {
    Object.keys(t.variants).forEach((v) => allVariants.add(v));
  });
  const variants = Array.from(allVariants).sort();

  // Colors for variants
  const colors: Record<string, string> = {
    flag_7v7: "#3b82f6",
    flag_11v11: "#8b5cf6",
    tackle: "#ef4444",
    touch: "#10b981",
  };

  const getColor = (variant: string, index: number) => {
    return colors[variant] || ["#06b6d4", "#f59e0b", "#ec4899"][index % 3];
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {trends.map((trend) => (
          <div key={trend.month} className="space-y-1">
            <div className="text-xs font-medium text-muted">{trend.month}</div>
            <div className="flex gap-1">
              {variants.map((variant, idx) => {
                const count = trend.variants[variant] || 0;
                const total = Object.values(trend.variants).reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? (count / total) * 100 : 0;
                if (count === 0) return null;
                return (
                  <div
                    key={variant}
                    className="h-6 rounded-sm transition-all hover:opacity-80"
                    style={{
                      width: `${Math.max(percentage, 2)}%`,
                      backgroundColor: getColor(variant, idx),
                    }}
                    title={`${variant.replace(/_/g, " ")}: ${count}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {variants.map((variant, idx) => (
          <div key={variant} className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-sm"
              style={{ backgroundColor: getColor(variant, idx) }}
            />
            <span className="capitalize text-muted">{variant.replace(/_/g, " ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ActivationAdminClient({
  initialSummary,
  initialError,
}: {
  initialSummary: MonetizationSummary | null;
  initialError: string | null;
}) {
  const { toast } = useToast();
  const [summary, setSummary] = useState<MonetizationSummary | null>(initialSummary);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    const res = await getActivationSummaryAction();
    if (res.ok) {
      setSummary(res.summary);
      setError(null);
      toast("Monetization data updated.", "success");
    } else {
      setError(res.error);
      toast(res.error, "error");
    }
    setLoading(false);
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-raised disabled:opacity-50"
        >
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted">Loading monetization data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Monetization Health</h2>
          <p className="mt-1 text-sm text-muted">
            Track activation signals and monetization funnel
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-raised disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Activation Funnel */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold">Activation Funnel</h3>
        <p className="text-sm text-muted">
          What % of users progress through each activation milestone?
        </p>
        <div className="space-y-3">
          {[
            {
              label: "All Users",
              value: summary.funnel.totalUsers,
              percentage: 100,
            },
            {
              label: "Created a Playbook",
              value: summary.funnel.playbookCreators,
              percentage:
                summary.funnel.totalUsers > 0
                  ? (summary.funnel.playbookCreators / summary.funnel.totalUsers) * 100
                  : 0,
            },
            {
              label: "Created a Play",
              value: summary.funnel.playCreators,
              percentage:
                summary.funnel.totalUsers > 0
                  ? (summary.funnel.playCreators / summary.funnel.totalUsers) * 100
                  : 0,
            },
            {
              label: "16+ Plays (Team Coach Ready)",
              value: summary.funnel.playCreators16Plus,
              percentage:
                summary.funnel.totalUsers > 0
                  ? (summary.funnel.playCreators16Plus / summary.funnel.totalUsers) * 100
                  : 0,
            },
            {
              label: "Tried Coach AI",
              value: summary.funnel.coachAiUsers,
              percentage:
                summary.funnel.totalUsers > 0
                  ? (summary.funnel.coachAiUsers / summary.funnel.totalUsers) * 100
                  : 0,
            },
          ].map((stage, idx) => (
            <div key={idx} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{stage.label}</span>
                <span className="text-sm font-semibold">{formatInt(stage.value)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-raised">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.max(stage.percentage, 2)}%` }}
                />
              </div>
              <div className="text-xs text-muted">{pct(stage.percentage / 100)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Activation Cohorts */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold">Play Creation Cohorts</h3>
        <p className="text-sm text-muted">
          Distribution of users by play count—16+ is the Team Coach threshold
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
          {summary.cohorts.map((cohort) => (
            <div
              key={cohort.bucket}
              className="rounded-lg border border-border bg-surface-raised p-4"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {cohort.bucket}
              </p>
              <p className="mt-3 text-2xl font-semibold">{formatInt(cohort.count)}</p>
              <p className="mt-1 text-xs text-muted">{pct(cohort.percentage)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Key Metrics Grid */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold">Key Metrics</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatTile
            label="Total Users"
            value={formatInt(summary.funnel.totalUsers)}
          />
          <StatTile
            label="% Creating Plays"
            value={pct(
              summary.funnel.playCreators / Math.max(1, summary.funnel.totalUsers),
            )}
          />
          <StatTile
            label="16+ Play Users (Monetization Ready)"
            value={formatInt(summary.funnel.playCreators16Plus)}
            sub={pct(
              summary.funnel.playCreators16Plus / Math.max(1, summary.funnel.totalUsers),
            )}
          />
          <StatTile
            label="Coach AI Adoption"
            value={formatInt(summary.funnel.coachAiUsers)}
            sub={pct(
              summary.funnel.coachAiUsers / Math.max(1, summary.funnel.totalUsers),
            )}
          />
        </div>
      </section>

      {/* Sport Variant Distribution */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold">Game Type Distribution</h3>
        <p className="text-sm text-muted">
          Which sport variants are driving engagement?
        </p>
        <div className="space-y-3">
          {summary.sportVariants.length > 0 ? (
            summary.sportVariants.map((sport) => (
              <div key={sport.variant} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">
                    {sport.variant.replace(/_/g, " ")}
                  </span>
                  <span className="text-sm font-semibold">{formatInt(sport.count)}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.max(sport.percentage * 100, 2)}%` }}
                  />
                </div>
                <div className="text-xs text-muted">{pct(sport.percentage)}</div>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted">No playbooks created yet.</p>
          )}
        </div>
      </section>

      {/* Sport Variant Trends */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold">Game Type Trends Over Time</h3>
        <p className="text-sm text-muted">
          See how sport variants shift seasonally (tackle in fall, 7v7 off-season, etc.)
        </p>
        {summary.sportVariantTrends.length > 0 ? (
          <div className="space-y-4">
            <SportVariantTrendChart trends={summary.sportVariantTrends} />
          </div>
        ) : (
          <p className="text-xs text-muted">Not enough data to show trends yet.</p>
        )}
      </section>

      {/* Interpretation Guide */}
      <section className="space-y-2 rounded-lg border border-border bg-surface-raised p-4">
        <p className="text-sm font-medium">Interpretation Guide</p>
        <ul className="space-y-1 text-xs text-muted">
          <li>
            <strong>16+ plays:</strong> Best indicator of engagement; target audience for
            Team Coach upsell
          </li>
          <li>
            <strong>Coach AI adoption:</strong> Indicator of Pro Coach potential; track CTA
            engagement
          </li>
          <li>
            <strong>Activation funnel:</strong> Bottleneck analysis—where are users dropping
            off?
          </li>
          <li>
            <strong>Game type:</strong> Shows which sport variant has highest engagement—informs
            feature roadmap prioritization
          </li>
        </ul>
      </section>
    </div>
  );
}
