"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui";
import {
  getTrafficSummaryAction,
  type TrafficSummary,
} from "@/app/actions/admin-traffic";

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

function MiniBarChart({ data }: { data: Array<{ day: string; views: number; signups: number }> }) {
  const w = 800;
  const h = 120;
  const pad = 4;
  const n = data.length || 1;
  const barW = (w - pad * 2) / n;
  const maxViews = Math.max(1, ...data.map((d) => d.views));
  const maxSignups = Math.max(1, ...data.map((d) => d.signups));

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: 120 }}
      role="img"
      aria-label="Views and signups by day"
    >
      {data.map((d, i) => {
        const x = pad + i * barW;
        const vH = (d.views / maxViews) * (h - 20);
        const sH = (d.signups / maxSignups) * (h - 20);
        const tip = `${d.day} — ${formatInt(d.views)} view${d.views === 1 ? "" : "s"}, ${formatInt(d.signups)} signup${d.signups === 1 ? "" : "s"}`;
        return (
          <g key={d.day}>
            <rect
              x={x + 1}
              y={h - vH}
              width={Math.max(1, barW - 2)}
              height={vH}
              className="fill-primary/70"
            />
            <rect
              x={x + barW * 0.25}
              y={h - sH}
              width={Math.max(1, barW * 0.5)}
              height={sH}
              className="fill-emerald-400/90"
            />
            {/* Full-column hit zone so the tooltip works anywhere over
                the day, not only on the (often tiny) bars themselves. */}
            <rect
              x={x}
              y={0}
              width={barW}
              height={h}
              className="fill-transparent"
            >
              <title>{tip}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

function BarList({
  title,
  rows,
  labelKey,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
  labelKey?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <ul className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <li className="text-xs text-muted">No data yet.</li>
        ) : (
          rows.map((r, i) => (
            <li key={`${labelKey ?? title}-${i}`} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span
                  className="truncate text-foreground"
                  title={r.label}
                >
                  {r.label || "—"}
                </span>
                <span className="shrink-0 tabular-nums text-muted">{formatInt(r.count)}</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-border/50">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export function TrafficAdminClient({
  initialSummary,
  initialError,
}: {
  initialSummary: TrafficSummary;
  initialError: string | null;
}) {
  const { toast } = useToast();
  const [summary, setSummary] = useState<TrafficSummary>(initialSummary);
  const [err, setErr] = useState<string | null>(initialError);
  const [windowDays, setWindowDays] = useState<number>(initialSummary.windowDays || 30);
  const [pending, startTransition] = useTransition();

  function reload(nextWindow: number) {
    startTransition(async () => {
      const res = await getTrafficSummaryAction(nextWindow);
      if (!res.ok) {
        setErr(res.error);
        toast(res.error, "error");
        return;
      }
      setErr(null);
      setSummary(res.summary);
    });
  }

  function onWindowChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = Number(e.target.value) || 30;
    setWindowDays(next);
    reload(next);
  }

  const { totals, conversion, byDay, topReferrers, topPaths, topCountries, deviceMix, utmSources } =
    summary;

  const deviceTotal =
    deviceMix.mobile + deviceMix.tablet + deviceMix.desktop + deviceMix.unknown || 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Traffic</h2>
          <p className="text-xs text-muted">
            Anonymous + authed page-view telemetry. Bot traffic excluded.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={windowDays}
            onChange={onWindowChange}
            disabled={pending}
            className="rounded-lg border border-border bg-surface-raised px-2 py-1 text-xs text-foreground"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            type="button"
            onClick={() => reload(windowDays)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2 py-1 text-xs text-foreground hover:bg-surface disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {err ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
          {err}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Views" value={formatInt(totals.views)} sub={`${windowDays}-day window`} />
        <StatTile
          label="Unique sessions"
          value={formatInt(totals.uniqueSessions)}
          sub={`${windowDays}-day window`}
        />
        <StatTile
          label="New signups"
          value={formatInt(totals.signups)}
          sub={`of ${formatInt(totals.totalUsers)} total`}
        />
        <StatTile
          label="Conversion"
          value={pct(conversion.rate)}
          sub={`${formatInt(conversion.sessionsWithSignup)}/${formatInt(
            conversion.sessions,
          )} sessions`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatTile
          label="Active last 7d"
          value={formatInt(totals.activeLast7)}
          sub="distinct signed-in users"
        />
        <StatTile
          label="Active last 30d"
          value={formatInt(totals.activeLast30)}
          sub="distinct signed-in users"
        />
        <StatTile
          label="Total users"
          value={formatInt(totals.totalUsers)}
          sub="all-time profiles"
        />
      </div>

      <div className="rounded-2xl border border-border bg-surface-raised p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Views &amp; signups per day</p>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-sm bg-primary/70" />
              Views
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-sm bg-emerald-400/90" />
              Signups
            </span>
          </div>
        </div>
        <div className="mt-3">
          <MiniBarChart data={byDay} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <BarList
          title="Top referrers"
          labelKey="referrer"
          rows={topReferrers.map((r) => ({ label: r.referrer, count: r.count }))}
        />
        <BarList
          title="Top paths"
          labelKey="path"
          rows={topPaths.map((r) => ({ label: r.path, count: r.count }))}
        />
        <BarList
          title="Top countries"
          labelKey="country"
          rows={topCountries.map((r) => ({ label: r.country, count: r.count }))}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BarList
          title="Device mix"
          labelKey="device"
          rows={[
            { label: "Desktop", count: deviceMix.desktop },
            { label: "Mobile", count: deviceMix.mobile },
            { label: "Tablet", count: deviceMix.tablet },
            { label: "Unknown", count: deviceMix.unknown },
          ]}
        />
        <BarList
          title="UTM sources"
          labelKey="utm"
          rows={utmSources.map((r) => ({ label: r.source, count: r.count }))}
        />
      </div>

      <p className="text-xs text-muted">
        Device split: {formatInt(deviceMix.desktop)} desktop ·{" "}
        {formatInt(deviceMix.mobile)} mobile · {formatInt(deviceMix.tablet)} tablet ·{" "}
        {formatInt(deviceMix.unknown)} unknown ({formatInt(deviceTotal)} total views)
      </p>
    </div>
  );
}
