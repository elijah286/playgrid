"use client";

import { useEffect, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import {
  getCoachAiFeedbackTrendsAction,
  type FeedbackTrends,
} from "@/app/actions/coach-ai-trends";

const KB_MISS_REASON_LABEL: Record<string, string> = {
  no_results: "No KB results",
  weak_results: "Weak KB results",
  irrelevant_results: "Irrelevant KB results",
  concept_not_seeded: "Concept not seeded",
};

const REFUSAL_REASON_LABEL: Record<string, string> = {
  playbook_required: "Playbook required",
  permission_denied: "Permission denied",
  invalid_input: "Invalid input",
  feature_unavailable: "Feature unavailable",
  tooling_error: "Tooling error",
  out_of_scope: "Out of scope",
};

export function CoachAiTrendsClient() {
  const [trends, setTrends] = useState<FeedbackTrends | null>(null);
  const [windowDays, setWindowDays] = useState<number>(30);
  const [err, setErr] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  useEffect(() => {
    load(windowDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load(days: number) {
    startLoad(async () => {
      const res = await getCoachAiFeedbackTrendsAction(days);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setErr(null);
      setTrends(res.trends);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-surface-inset p-0.5 text-xs">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setWindowDays(d);
                load(d);
              }}
              className={`rounded px-3 py-1 ${windowDays === d ? "bg-surface-raised font-semibold text-foreground shadow" : "text-muted"}`}
            >
              Last {d}d
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => load(windowDays)} disabled={loading}>
          <RefreshCw className="mr-1 size-3.5" />
          Refresh
        </Button>
      </div>

      {err && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      )}

      {!trends ? (
        <p className="rounded-lg bg-surface-inset px-3 py-6 text-center text-sm text-muted">
          Loading…
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Stat label="KB misses" value={trends.totals.kb_miss} tone="red" />
            <Stat label="Refusals" value={trends.totals.refusal} tone="amber" />
            <Stat label="Thumbs down" value={trends.totals.thumbs_down} tone="red" />
            <Stat label="Thumbs up" value={trends.totals.thumbs_up} tone="green" />
            <Stat label="Pending clusters" value={trends.totals.clusters_pending} tone="amber" />
            <Stat label="Approved clusters" value={trends.totals.clusters_approved} tone="green" />
            <Stat label="Rejected clusters" value={trends.totals.clusters_rejected} tone="zinc" />
          </div>

          <DailyChart trends={trends} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl bg-surface-raised p-4 ring-1 ring-black/5">
              <h3 className="text-sm font-semibold text-foreground">Top KB-miss topics</h3>
              {trends.topMissTopics.length === 0 ? (
                <p className="mt-2 text-xs text-muted">No KB misses in window.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {trends.topMissTopics.map((t) => (
                    <li key={t.topic} className="flex items-center justify-between gap-2">
                      <span className="truncate text-foreground">
                        {KB_MISS_REASON_LABEL[t.topic] ?? t.topic}
                      </span>
                      <span className="shrink-0 text-xs text-muted">{t.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl bg-surface-raised p-4 ring-1 ring-black/5">
              <h3 className="text-sm font-semibold text-foreground">Top refusal reasons</h3>
              {trends.topRefusalReasons.length === 0 ? (
                <p className="mt-2 text-xs text-muted">No refusals in window.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {trends.topRefusalReasons.map((r) => (
                    <li key={r.reason} className="flex items-center justify-between gap-2">
                      <span className="truncate text-foreground">
                        {REFUSAL_REASON_LABEL[r.reason] ?? r.reason}
                      </span>
                      <span className="shrink-0 text-xs text-muted">{r.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "green" | "zinc";
}) {
  const toneCls =
    tone === "red"
      ? "text-red-700 dark:text-red-300"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "green"
          ? "text-green-700 dark:text-green-300"
          : "text-foreground";
  return (
    <div className="rounded-xl bg-surface-raised p-3 ring-1 ring-black/5">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneCls}`}>{value}</p>
    </div>
  );
}

function DailyChart({ trends }: { trends: FeedbackTrends }) {
  const max = Math.max(
    1,
    ...trends.byDay.map((d) => d.kb_miss + d.refusal + d.thumbs_down + d.thumbs_up),
  );
  return (
    <div className="rounded-xl bg-surface-raised p-4 ring-1 ring-black/5">
      <h3 className="text-sm font-semibold text-foreground">Signals per day</h3>
      <div className="mt-3 flex h-32 items-end gap-px">
        {trends.byDay.map((d) => {
          const total = d.kb_miss + d.refusal + d.thumbs_down + d.thumbs_up;
          const heightPct = (total / max) * 100;
          return (
            <div
              key={d.day}
              className="group relative flex-1"
              title={`${d.day} · KB miss ${d.kb_miss} · refusal ${d.refusal} · 👎 ${d.thumbs_down} · 👍 ${d.thumbs_up}`}
              style={{ height: `${heightPct}%`, minHeight: total > 0 ? 1 : 0 }}
            >
              <div className="flex h-full flex-col-reverse">
                <div className="bg-red-400" style={{ flex: d.kb_miss }} />
                <div className="bg-amber-400" style={{ flex: d.refusal }} />
                <div className="bg-rose-400" style={{ flex: d.thumbs_down }} />
                <div className="bg-emerald-400" style={{ flex: d.thumbs_up }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
        <Legend color="bg-red-400" label="KB miss" />
        <Legend color="bg-amber-400" label="Refusal" />
        <Legend color="bg-rose-400" label="👎" />
        <Legend color="bg-emerald-400" label="👍" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block size-3 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
