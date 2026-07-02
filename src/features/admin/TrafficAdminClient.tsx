"use client";

import { useMemo, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useToast } from "@/components/ui";
import {
  getTrafficSummaryAction,
  type TrafficSummary,
} from "@/app/actions/admin-traffic";
import {
  getEngagementSummaryAction,
  getViralitySummaryAction,
  type CoachCalCtaRow,
  type EngagementSummary,
  type MobileEngagementSummary,
  type ViralitySummary,
} from "@/app/actions/admin-traffic-insights";

type SubTab = "overview" | "acquisition" | "engagement" | "virality";
type WindowKey = "7d" | "30d" | "90d";

// User-facing window → days to show in chart and label tiles.
const WINDOW_USER_DAYS: Record<WindowKey, number> = { "7d": 7, "30d": 30, "90d": 90 };
// Days fetched from the server (2× user window for prior-period delta math
// in OverviewAdminClient — keep the contract).
const WINDOW_QUERY_DAYS: Record<WindowKey, number> = { "7d": 14, "30d": 60, "90d": 180 };

const VIEW_COLOR = "#1769FF";
const SIGNUP_COLOR = "#10b981";

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatDwell(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

function StatTile({
  label,
  value,
  sub,
  question,
}: {
  label: string;
  value: string;
  sub?: string;
  question?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
      {question ? <p className="mt-2 text-[11px] italic text-muted/80">{question}</p> : null}
    </div>
  );
}

function formatDayShort(iso: string): string {
  // "2026-05-21" → "May 21"
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatDayLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { day: string; views: number; signups: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{formatDayLong(row.day)}</p>
      <div className="mt-1.5 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-sm" style={{ backgroundColor: VIEW_COLOR }} />
          <span className="text-muted">Views</span>
          <span className="ml-auto tabular-nums text-foreground">{formatInt(row.views)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-2 rounded-sm"
            style={{ backgroundColor: SIGNUP_COLOR }}
          />
          <span className="text-muted">Signups</span>
          <span className="ml-auto tabular-nums text-foreground">{formatInt(row.signups)}</span>
        </div>
      </div>
    </div>
  );
}

function TrafficChart({
  data,
  userDays,
}: {
  data: Array<{ day: string; views: number; signups: number }>;
  userDays: number;
}) {
  // Slice to the user-visible window (server returns 2× for delta math).
  const sorted = useMemo(
    () => [...data].sort((a, b) => (a.day < b.day ? -1 : 1)).slice(-userDays),
    [data, userDays],
  );
  // Show every Nth tick on the x-axis so long windows stay readable.
  const tickInterval = userDays <= 14 ? 0 : userDays <= 35 ? 3 : 9;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <AreaChart data={sorted} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={VIEW_COLOR} stopOpacity={0.35} />
              <stop offset="100%" stopColor={VIEW_COLOR} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="signupsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SIGNUP_COLOR} stopOpacity={0.35} />
              <stop offset="100%" stopColor={SIGNUP_COLOR} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={formatDayShort}
            interval={tickInterval}
            tick={{ fontSize: 10, fill: "var(--color-muted)" }}
            stroke="var(--color-border)"
            tickLine={false}
            axisLine={false}
            dy={6}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--color-muted)" }}
            stroke="var(--color-border)"
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={48}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="views"
            name="Views"
            stroke={VIEW_COLOR}
            strokeWidth={2}
            fill="url(#viewsGradient)"
          />
          <Area
            type="monotone"
            dataKey="signups"
            name="Signups"
            stroke={SIGNUP_COLOR}
            strokeWidth={2}
            fill="url(#signupsGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarList({
  title,
  question,
  rows,
  labelKey,
  valueFmt,
}: {
  title: string;
  question?: string;
  rows: Array<{ label: string; count: number; right?: string }>;
  labelKey?: string;
  valueFmt?: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {question ? (
          <p className="mt-0.5 text-[11px] italic text-muted/80">{question}</p>
        ) : null}
      </div>
      <ul className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <li className="text-xs text-muted">No data yet.</li>
        ) : (
          rows.map((r, i) => (
            <li key={`${labelKey ?? title}-${i}`} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-foreground" title={r.label}>
                  {r.label || "—"}
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  {r.right ?? (valueFmt ? valueFmt(r.count) : formatInt(r.count))}
                </span>
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

function FunnelChart({
  steps,
}: {
  steps: Array<{ key: string; label: string; count: number; dropoff: number }>;
}) {
  const max = Math.max(1, ...steps.map((s) => s.count));
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Activation funnel</p>
        <p className="mt-0.5 text-[11px] italic text-muted/80">
          Where do new visitors fall off on the way to first share?
        </p>
      </div>
      <ul className="mt-4 space-y-3">
        {steps.map((s, i) => {
          const w = (s.count / max) * 100;
          const drop = i === 0 ? 0 : s.dropoff;
          return (
            <li key={s.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-foreground">{s.label}</span>
                <span className="tabular-nums text-muted">
                  {formatInt(s.count)}
                  {i > 0 && drop > 0 ? (
                    <span className="ml-2 text-amber-300/90">−{pct(drop)}</span>
                  ) : null}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-md bg-border/40">
                <div
                  className="h-full rounded-md bg-gradient-to-r from-primary/80 to-emerald-400/80"
                  style={{ width: `${w}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SubTabs({
  tab,
  onChange,
}: {
  tab: SubTab;
  onChange: (t: SubTab) => void;
}) {
  const items: Array<{ key: SubTab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "acquisition", label: "Acquisition" },
    { key: "engagement", label: "Engagement" },
    { key: "virality", label: "Virality" },
  ];
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface-raised p-1 text-xs">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onChange(it.key)}
          className={`rounded-lg px-3 py-1.5 transition-colors ${
            tab === it.key
              ? "bg-foreground/10 font-semibold text-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function TrafficAdminClient({
  initialSummary,
  initialError,
  initialWindow = "30d",
}: {
  initialSummary: TrafficSummary;
  initialError: string | null;
  initialWindow?: WindowKey;
}) {
  const { toast } = useToast();
  const [summary, setSummary] = useState<TrafficSummary>(initialSummary);
  const [err, setErr] = useState<string | null>(initialError);
  const [windowKey, setWindowKey] = useState<WindowKey>(initialWindow);
  const windowDays = WINDOW_USER_DAYS[windowKey];
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<SubTab>("overview");
  const [engagement, setEngagement] = useState<EngagementSummary | null>(null);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [virality, setVirality] = useState<ViralitySummary | null>(null);
  const [viralityLoading, setViralityLoading] = useState(false);

  function fetchEngagement(nextKey: WindowKey) {
    setEngagementLoading(true);
    getEngagementSummaryAction(WINDOW_QUERY_DAYS[nextKey])
      .then((r) => {
        if (r.ok) setEngagement(r.summary);
        else toast(r.error, "error");
      })
      .finally(() => setEngagementLoading(false));
  }

  function fetchVirality(nextKey: WindowKey) {
    setViralityLoading(true);
    getViralitySummaryAction(WINDOW_QUERY_DAYS[nextKey])
      .then((r) => {
        if (r.ok) setVirality(r.summary);
        else toast(r.error, "error");
      })
      .finally(() => setViralityLoading(false));
  }

  // Refresh + window-change re-fetch the Overview/Acquisition data and
  // null out the lazy-loaded panels — but if the user is currently
  // viewing Engagement or Virality, we ALSO re-fetch that immediately
  // instead of waiting for them to switch tabs and back. Without this,
  // the Engagement panel would just hang on "Loading…" forever after a
  // refresh because selectTab is the only thing that triggers a fetch.
  function reload(nextKey: WindowKey) {
    startTransition(async () => {
      const res = await getTrafficSummaryAction(WINDOW_QUERY_DAYS[nextKey]);
      if (!res.ok) {
        setErr(res.error);
        toast(res.error, "error");
        return;
      }
      setErr(null);
      setSummary(res.summary);
      setEngagement(null);
      setVirality(null);
      if (tab === "engagement") fetchEngagement(nextKey);
      else if (tab === "virality") fetchVirality(nextKey);
    });
  }

  function selectTab(next: SubTab) {
    setTab(next);
    if (next === "engagement" && !engagement && !engagementLoading) {
      fetchEngagement(windowKey);
    }
    if (next === "virality" && !virality && !viralityLoading) {
      fetchVirality(windowKey);
    }
  }

  function onWindowChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as WindowKey;
    setWindowKey(next);
    reload(next);
  }

  const { totals, conversion, byDay, topReferrers, topPaths, topCountries, deviceMix, utmSources } =
    summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Traffic</h2>
          <p className="text-xs text-muted">
            Anonymous + authed page-view telemetry. Bot traffic excluded.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={windowKey}
            onChange={onWindowChange}
            disabled={pending}
            className="rounded-lg border border-border bg-surface-raised px-2 py-1 text-xs text-foreground"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <button
            type="button"
            onClick={() => reload(windowKey)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2 py-1 text-xs text-foreground hover:bg-surface disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <SubTabs tab={tab} onChange={selectTab} />

      {err ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
          {err}
        </p>
      ) : null}

      {tab === "overview" && (
        <>
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-foreground">Views &amp; signups per day</p>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block size-2 rounded-sm"
                    style={{ backgroundColor: VIEW_COLOR }}
                  />
                  Views
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block size-2 rounded-sm"
                    style={{ backgroundColor: SIGNUP_COLOR }}
                  />
                  Signups
                </span>
              </div>
            </div>
            <div className="mt-3">
              <TrafficChart data={byDay} userDays={windowDays} />
            </div>
          </div>
        </>
      )}

      {tab === "acquisition" && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <BarList
              title="Top referrers"
              question="Where is traffic coming from?"
              labelKey="referrer"
              rows={topReferrers.map((r) => ({ label: r.referrer, count: r.count }))}
            />
            <BarList
              title="Top landing paths"
              question="What page do people first see?"
              labelKey="path"
              rows={topPaths.map((r) => ({ label: r.path, count: r.count }))}
            />
            <BarList
              title="Top countries"
              question="Where are visitors located?"
              labelKey="country"
              rows={topCountries.map((r) => ({ label: r.country, count: r.count }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <BarList
              title="Device mix"
              question="What are visitors using to view the site?"
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
              question="Which campaigns are driving traffic?"
              labelKey="utm"
              rows={utmSources.map((r) => ({ label: r.source, count: r.count }))}
            />
          </div>
        </>
      )}

      {tab === "engagement" && (
        <EngagementPanel data={engagement} loading={engagementLoading} />
      )}

      {tab === "virality" && <ViralityPanel data={virality} loading={viralityLoading} />}
    </div>
  );
}

function EngagementPanel({
  data,
  loading,
}: {
  data: EngagementSummary | null;
  loading: boolean;
}) {
  if (loading || !data) {
    return (
      <p className="rounded-2xl border border-border bg-surface-raised p-6 text-xs text-muted">
        Loading engagement data…
      </p>
    );
  }
  const noData =
    data.funnel.every((s) => s.count === 0) &&
    data.topExits.length === 0 &&
    data.totalEvents === 0;
  return (
    <>
      <FunnelChart steps={data.funnel} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BarList
          title="Top exit pages"
          question="What's the last thing people see before they leave?"
          labelKey="exit"
          rows={data.topExits.map((r) => ({
            label: r.path,
            count: r.exits,
            right: `${formatInt(r.exits)} · ${formatDwell(r.avgDwellMs)}`,
          }))}
        />
        <BarList
          title="Most-engaging pages"
          question="Where do people spend the most time?"
          labelKey="dwell"
          rows={data.longestDwell.map((r) => ({
            label: r.path,
            count: r.avgDwellMs,
            right: `${formatDwell(r.avgDwellMs)} · n=${r.samples}`,
          }))}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BarList
          title="Pages people bounce from fast"
          question="Where might the value not be obvious?"
          labelKey="short-dwell"
          rows={data.shortestDwell.map((r) => ({
            label: r.path,
            count: r.avgDwellMs,
            right: `${formatDwell(r.avgDwellMs)} · n=${r.samples}`,
          }))}
        />
        <BarList
          title="Top events"
          question="What are people actually doing inside the app?"
          labelKey="event"
          rows={data.topEvents.map((r) => ({
            label: r.event,
            count: r.count,
            right: `${formatInt(r.count)} · ${formatInt(r.uniqueUsers)} users`,
          }))}
        />
      </div>

      <MobileEngagementPanel data={data.mobileEngagement} />

      <CoachCalCtaPanel rows={data.coachCalCtas} />

      {noData ? (
        <p className="rounded-lg border border-border/50 bg-surface-raised/50 px-3 py-2 text-xs text-muted">
          No engagement data yet — instrument <code>track()</code> calls and dwell beacons will
          start populating this view as visitors browse.
        </p>
      ) : null}
    </>
  );
}

function deltaFmt(
  current: number,
  prior: number,
  opts: { kind: "pct" | "ratio" | "ms" | "int"; lowerIsBetter?: boolean },
): { label: string; tone: "positive" | "negative" | "neutral" } {
  // No prior data → can't infer direction.
  if (prior === 0 && current === 0) return { label: "—", tone: "neutral" };
  if (prior === 0) return { label: "new", tone: "neutral" };
  const diff = current - prior;
  const rel = diff / prior;
  // Direction: did the metric move in the desired direction?
  const better = opts.lowerIsBetter ? diff < 0 : diff > 0;
  const same = Math.abs(rel) < 0.02; // <2% noise floor
  const tone = same ? "neutral" : better ? "positive" : "negative";
  let label: string;
  if (opts.kind === "pct" || opts.kind === "ratio") {
    // Show absolute pp delta for percentage metrics — easier to read
    // than relative change of a rate.
    const pp = (current - prior) * 100;
    label = `${pp >= 0 ? "+" : ""}${pp.toFixed(1)}pp`;
  } else if (opts.kind === "ms") {
    const sec = (diff / 1000).toFixed(1);
    label = `${diff >= 0 ? "+" : ""}${sec}s`;
  } else {
    label = `${diff >= 0 ? "+" : ""}${formatInt(diff)}`;
  }
  return { label, tone };
}

function MobileEngagementPanel({ data }: { data: MobileEngagementSummary }) {
  const { current, prior, windowDays } = data;
  const noData =
    current.mobile.sessions === 0 &&
    current.desktop.sessions === 0 &&
    prior.mobile.sessions === 0 &&
    prior.desktop.sessions === 0;
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">
          Mobile vs desktop on viewer surfaces
        </p>
        <p className="mt-0.5 text-[11px] italic text-muted/80">
          Are mobile-UX changes helping viewers actually browse playbooks
          and plays? Compares this {windowDays}-day window to the prior {windowDays}-day window.
          Bounce = sessions that hit a viewer page and didn&rsquo;t click through to a second one.
        </p>
      </div>
      {noData ? (
        <p className="mt-3 text-xs text-muted">
          No qualifying device-classified sessions in this window. The
          panel populates as visitors land on /playbooks, /plays, /v,
          /m/play, /copy, or /examples surfaces.
        </p>
      ) : (
        <>
          <div className="mt-3 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="sticky left-0 z-10 bg-surface-raised pb-2 pr-3 shadow-[1px_0_0_0_var(--color-border)]">
                    Cohort
                  </th>
                  <th className="pb-2 pr-3 text-right">Sessions</th>
                  <th className="pb-2 pr-3 text-right">Viewer sessions</th>
                  <th className="pb-2 pr-3 text-right">Viewer bounce</th>
                  <th className="pb-2 pr-3 text-right">Pages / session</th>
                  <th className="pb-2 text-right">Avg viewer dwell</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(["mobile", "desktop"] as const).map((cls) => {
                  const c = current[cls];
                  const p = prior[cls];
                  const sessDelta = deltaFmt(c.sessions, p.sessions, { kind: "int" });
                  const viewerSessDelta = deltaFmt(c.viewerSessions, p.viewerSessions, { kind: "int" });
                  const bounceDelta = deltaFmt(c.viewerBounceRate, p.viewerBounceRate, {
                    kind: "ratio",
                    lowerIsBetter: true,
                  });
                  const depthDelta = deltaFmt(c.viewsPerSession, p.viewsPerSession, { kind: "int" });
                  const dwellDelta = deltaFmt(
                    c.viewerAvgDwellMs ?? 0,
                    p.viewerAvgDwellMs ?? 0,
                    { kind: "ms" },
                  );
                  return (
                    <tr key={cls}>
                      <td className="sticky left-0 z-10 bg-surface-raised py-2 pr-3 text-foreground shadow-[1px_0_0_0_var(--color-border)]">
                        <div className="font-medium capitalize">{cls}</div>
                        <div className="text-[10px] text-muted">
                          {cls === "mobile" ? "phone + tablet" : "desktop only"}
                        </div>
                      </td>
                      <DeltaCell value={formatInt(c.sessions)} delta={sessDelta} />
                      <DeltaCell value={formatInt(c.viewerSessions)} delta={viewerSessDelta} />
                      <DeltaCell value={pct(c.viewerBounceRate)} delta={bounceDelta} />
                      <DeltaCell value={c.viewsPerSession.toFixed(2)} delta={depthDelta} />
                      <DeltaCell
                        value={formatDwell(c.viewerAvgDwellMs)}
                        delta={dwellDelta}
                      />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-2 md:hidden">
            {(["mobile", "desktop"] as const).map((cls) => {
              const c = current[cls];
              const p = prior[cls];
              const sessDelta = deltaFmt(c.sessions, p.sessions, { kind: "int" });
              const viewerSessDelta = deltaFmt(c.viewerSessions, p.viewerSessions, { kind: "int" });
              const bounceDelta = deltaFmt(c.viewerBounceRate, p.viewerBounceRate, {
                kind: "ratio",
                lowerIsBetter: true,
              });
              const depthDelta = deltaFmt(c.viewsPerSession, p.viewsPerSession, { kind: "int" });
              const dwellDelta = deltaFmt(
                c.viewerAvgDwellMs ?? 0,
                p.viewerAvgDwellMs ?? 0,
                { kind: "ms" },
              );
              return (
                <div
                  key={cls}
                  className="rounded-xl border border-border bg-surface-raised p-3"
                >
                  <div className="font-medium capitalize text-foreground">{cls}</div>
                  <div className="text-[10px] text-muted">
                    {cls === "mobile" ? "phone + tablet" : "desktop only"}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
                    <MobileMetric
                      label="Sessions"
                      value={formatInt(c.sessions)}
                      delta={sessDelta}
                    />
                    <MobileMetric
                      label="Viewer sessions"
                      value={formatInt(c.viewerSessions)}
                      delta={viewerSessDelta}
                    />
                    <MobileMetric
                      label="Viewer bounce"
                      value={pct(c.viewerBounceRate)}
                      delta={bounceDelta}
                    />
                    <MobileMetric
                      label="Pages / session"
                      value={c.viewsPerSession.toFixed(2)}
                      delta={depthDelta}
                    />
                    <MobileMetric
                      label="Avg viewer dwell"
                      value={formatDwell(c.viewerAvgDwellMs)}
                      delta={dwellDelta}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-muted">
            Lower bounce + higher pages/session + longer dwell on the mobile row is
            the signal that mobile-UX work is paying off. Sessions with unknown
            device class are excluded from both cohorts.
          </p>
        </>
      )}
    </div>
  );
}

function DeltaCell({
  value,
  delta,
}: {
  value: string;
  delta: { label: string; tone: "positive" | "negative" | "neutral" };
}) {
  const toneClass =
    delta.tone === "positive"
      ? "text-emerald-400/90"
      : delta.tone === "negative"
        ? "text-amber-300/90"
        : "text-muted";
  return (
    <td className="py-2 pr-3 text-right tabular-nums text-foreground">
      <div>{value}</div>
      <div className={`text-[10px] ${toneClass}`}>{delta.label}</div>
    </td>
  );
}

function MobileMetric({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: { label: string; tone: "positive" | "negative" | "neutral" };
}) {
  const toneClass =
    delta?.tone === "positive"
      ? "text-emerald-400/90"
      : delta?.tone === "negative"
        ? "text-amber-300/90"
        : "text-muted";
  return (
    <div>
      <div>{label}</div>
      <div className="font-semibold tabular-nums text-foreground">{value}</div>
      {delta && <div className={`text-[10px] ${toneClass}`}>{delta.label}</div>}
    </div>
  );
}

const COACH_CAL_SURFACE_LABELS: Record<string, string> = {
  playbook_floating_card: "Playbook page · floating card",
  header_promo_popover: "Site header · promo popover",
};

function CoachCalCtaPanel({ rows }: { rows: CoachCalCtaRow[] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Coach Cal CTA performance</p>
        <p className="mt-0.5 text-[11px] italic text-muted/80">
          Per-surface impressions and how many of those tap through, dismiss, or walk away
          without acting.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-muted">
          No Coach Cal CTA events recorded in this window. The
          impression / click / dismiss instrumentation is wired — once
          a free user opens a playbook page (floating card) or taps the
          pulsing icon in the site header (promo popover), rows will
          appear here.
        </p>
      ) : (
        <>
          <div className="mt-3 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="pb-2 pr-3">Surface</th>
                  <th className="pb-2 pr-3 text-right">Impressions</th>
                  <th className="pb-2 pr-3 text-right">Clicks</th>
                  <th className="pb-2 pr-3 text-right">Click rate</th>
                  <th className="pb-2 pr-3 text-right">Dismisses</th>
                  <th className="pb-2 pr-3 text-right">Dismiss rate</th>
                  <th className="pb-2 text-right">Walk-aways</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((r) => (
                  <tr key={r.surface}>
                    <td className="py-2 pr-3 text-foreground">
                      <div className="font-medium">
                        {COACH_CAL_SURFACE_LABELS[r.surface] ?? r.surface}
                      </div>
                      <div className="text-[10px] text-muted">
                        {formatInt(r.uniqueImpressionUsers)} unique
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                      {formatInt(r.impressions)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                      {formatInt(r.clicks)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-emerald-400/90">
                      {pct(r.clickRate)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                      {formatInt(r.dismisses)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-amber-300/90">
                      {pct(r.dismissRate)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {formatInt(r.walkAways)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-2 md:hidden">
            {rows.map((r) => (
              <div
                key={r.surface}
                className="rounded-xl border border-border bg-surface-raised p-3"
              >
                <div className="font-medium text-foreground">
                  {COACH_CAL_SURFACE_LABELS[r.surface] ?? r.surface}
                </div>
                <div className="text-[10px] text-muted">
                  {formatInt(r.uniqueImpressionUsers)} unique
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
                  <MobileMetric label="Impressions" value={formatInt(r.impressions)} />
                  <MobileMetric label="Clicks" value={formatInt(r.clicks)} />
                  <MobileMetric label="Click rate" value={pct(r.clickRate)} />
                  <MobileMetric label="Dismisses" value={formatInt(r.dismisses)} />
                  <MobileMetric label="Dismiss rate" value={pct(r.dismissRate)} />
                  <MobileMetric label="Walk-aways" value={formatInt(r.walkAways)} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted">
            Walk-away = saw the CTA, didn&rsquo;t click, didn&rsquo;t explicitly dismiss
            (closed the tab, navigated away, etc.). The three actions sum to impressions.
          </p>
        </>
      )}
    </div>
  );
}

function ViralityPanel({
  data,
  loading,
}: {
  data: ViralitySummary | null;
  loading: boolean;
}) {
  if (loading || !data) {
    return (
      <p className="rounded-2xl border border-border bg-surface-raised p-6 text-xs text-muted">
        Loading virality data…
      </p>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Shares created"
          value={formatInt(data.shares.total)}
          sub={`${data.windowDays}-day window`}
          question="How often are users sharing?"
        />
        <StatTile
          label="Inbound visits"
          value={formatInt(data.shares.inboundVisits)}
          sub={`${formatInt(data.shares.inboundSessions)} unique sessions`}
          question="Are shares actually getting clicked?"
        />
        <StatTile
          label="Inbound signups"
          value={formatInt(data.shares.inboundSignups)}
          sub={pct(data.shares.inboundConversion) + " of inbound sessions"}
          question="Do inbound visitors convert?"
        />
        <StatTile
          label="K-factor (proxy)"
          value={data.kFactor.toFixed(2)}
          sub="signups attributed per sharer"
          question="Is this growing virally?"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BarList
          title="Shares by kind"
          question="Which surfaces do people share from?"
          labelKey="kind"
          rows={data.shares.byKind.map((r) => ({ label: r.kind, count: r.count }))}
        />
        <BarList
          title="Top sharers"
          question="Who's doing the most networking?"
          labelKey="sharer"
          rows={data.topSharers.map((r) => ({
            label: r.displayName ?? r.userId.slice(0, 8),
            count: r.shares,
            right: `${formatInt(r.shares)} shares · ${formatInt(r.inboundVisits)} visits · ${formatInt(r.inboundSignups)} signups`,
          }))}
        />
      </div>

      <div className="rounded-2xl border border-border bg-surface-raised p-4">
        <p className="text-sm font-semibold text-foreground">Recent shares</p>
        <p className="mt-0.5 text-[11px] italic text-muted/80">
          Each row is one share creation event with attributed inbound traffic.
        </p>
        {data.recentShares.length === 0 ? (
          <p className="mt-3 text-xs text-muted">No share events recorded in this window.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60 text-xs">
            {data.recentShares.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-2 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
              >
                <span className="text-foreground">
                  <span className="font-medium">{s.actorName ?? "Unknown"}</span>
                  <span className="text-muted"> · {s.kind}</span>
                  {s.channel ? <span className="text-muted"> · {s.channel}</span> : null}
                </span>
                <span className="tabular-nums text-muted">
                  {formatInt(s.inboundVisits)} visit{s.inboundVisits === 1 ? "" : "s"} ·{" "}
                  {new Date(s.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
