"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Brain,
  CreditCard,
  DollarSign,
  Globe,
  MessageCircle,
  Share2,
  Ticket,
  TrendingUp,
  Users,
} from "lucide-react";
import type { TrafficSummary } from "@/app/actions/admin-traffic";
import type { GeoSummary } from "@/app/actions/admin-geography";
import type { CoachInvitationRow } from "@/app/actions/coach-invitations";
import type { FeedbackRow } from "@/app/actions/feedback";
import type { KbMissRow } from "@/app/actions/coach-ai-feedback";
import type { GiftCodeRow } from "@/app/actions/admin-billing";
import type { BillingSummary } from "@/app/actions/admin-billing";
import type { ShareLifetimeSummary } from "@/app/actions/admin-traffic-insights";
import type {
  ActivationFunnel,
  MonetizationSummary,
} from "@/app/actions/admin-activation";
import type { StripeConfigStatus } from "@/lib/site/stripe-config";
import { cn } from "@/lib/utils";

export type OverviewWindow = "7d" | "30d" | "90d" | "all";
export type OverviewJumpTarget =
  | "users"
  | "analytics"
  | "geography"
  | "invites"
  | "payments"
  | "feedback"
  | "ai_feedback";

type OverviewProps = {
  window: OverviewWindow;
  totalUsers: number;
  traffic: TrafficSummary;
  geo: GeoSummary;
  pendingInvites: number;
  recentFeedback: number;
  unreviewedKbMisses: number;
  activeGiftCodes: number;
  stripeMode: StripeConfigStatus["mode"];
  billing: BillingSummary | null;
  billingError: string | null;
  activation: ActivationFunnel | null;
  shareLifetime: ShareLifetimeSummary | null;
  onJump: (tab: OverviewJumpTarget) => void;
};

const WINDOW_LABEL: Record<OverviewWindow, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

const WINDOW_DAYS_CURRENT: Record<OverviewWindow, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: 365,
};

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

function formatCurrency(n: number): string {
  if (n === 0) return "$0";
  if (n < 1000) return `$${n.toFixed(0)}`;
  if (n < 10000) return `$${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `$${Math.round(n / 1000)}k`;
  return `$${(n / 1_000_000).toFixed(2)}m`;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function safePct(num: number, denom: number): number {
  return denom > 0 ? num / denom : 0;
}

function deltaPct(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return (current - prior) / prior;
}

export function OverviewAdminClient({
  window,
  totalUsers,
  traffic,
  geo,
  pendingInvites,
  recentFeedback,
  unreviewedKbMisses,
  activeGiftCodes,
  stripeMode,
  billing,
  billingError,
  activation,
  shareLifetime,
  onJump,
}: OverviewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function setWindow(next: OverviewWindow) {
    const params = new URLSearchParams(
      typeof globalThis.window !== "undefined" ? globalThis.window.location.search : "",
    );
    params.set("overview_window", next);
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  const splits = useMemo(() => splitByDay(traffic.byDay, window), [traffic.byDay, window]);

  const stripeBadge =
    stripeMode === "live"
      ? { label: "Live", tone: "emerald" as const }
      : stripeMode === "test"
        ? { label: "Test mode", tone: "amber" as const }
        : { label: "Not configured", tone: "muted" as const };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Overview</h2>
          <p className="mt-1 text-sm text-muted">
            Top-line health across the site. Pick a window to scope traffic + activity below.
          </p>
        </div>
        <TimeframeSelector value={window} onChange={setWindow} disabled={isPending} />
      </header>

      {/* Hero KPI strip */}
      <HeroKpiGrid>
        <HeroKpi
          icon={Users}
          label="Total users"
          value={formatInt(totalUsers)}
          sub="all-time profiles"
          onClick={() => onJump("users")}
        />
        <HeroKpi
          icon={CreditCard}
          label="Paid users"
          value={billing ? formatInt(billing.paidUsers) : "—"}
          sub={
            billing
              ? billing.trialingUsers > 0
                ? `${formatInt(billing.trialingUsers)} trialing`
                : "active subscribers"
              : billingError
                ? "Stripe error"
                : "loading…"
          }
          onClick={() => onJump("payments")}
        />
        <HeroKpi
          icon={DollarSign}
          label="MRR"
          value={billing ? formatCurrency(billing.mrr) : "—"}
          sub={billing ? "recurring revenue" : billingError ? "Stripe error" : "loading…"}
          tone="emerald"
          onClick={() => onJump("payments")}
        />
        <HeroKpi
          icon={TrendingUp}
          label={`Active (${WINDOW_LABEL[window]})`}
          value={formatInt(activeUsersFor(window, traffic))}
          sub={
            window === "7d"
              ? `${formatInt(traffic.totals.activeLast30)} in last 30d`
              : `${formatInt(traffic.totals.activeLast7)} in last 7d`
          }
          onClick={() => onJump("analytics")}
        />
        <HeroKpi
          icon={DollarSign}
          label="Total revenue"
          value={billing ? formatCurrency(billing.lifetimeRevenue) : "—"}
          sub={
            billing
              ? "lifetime, net of refunds"
              : billingError
                ? "Stripe error"
                : "loading…"
          }
          tone="emerald"
          onClick={() => onJump("payments")}
        />
      </HeroKpiGrid>

      {/* Activation funnel */}
      <Section
        title="Activation funnel"
        subtitle="Where users drop off between signing up and getting real value. Steps are cumulative — counts include everyone who passed the prior step."
      >
        {activation ? (
          <ActivationFunnelView funnel={activation} totalUsers={totalUsers} />
        ) : (
          <p className="text-sm text-muted">No activation data yet.</p>
        )}
      </Section>

      {/* Inline mini-views grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title={`Traffic (${WINDOW_LABEL[window]})`}
          subtitle="Daily views and signups. Tap to open the analytics tab."
          onJump={() => onJump("analytics")}
        >
          <TrafficTrendCard
            current={splits.current}
            prior={splits.prior}
            signups={traffic.totals.signups}
            views={traffic.totals.views}
            sessions={traffic.totals.uniqueSessions}
          />
        </Section>

        <Section
          title="Top sources"
          subtitle="Where the visits came from this window."
          onJump={() => onJump("analytics")}
        >
          <TopReferrersCard rows={traffic.topReferrers.slice(0, 5)} />
        </Section>

        <Section
          title="Geography"
          subtitle="Spread of plotted visits this window."
          onJump={() => onJump("geography")}
        >
          <GeoSnapshotCard geo={geo} />
        </Section>

        <Section
          title="Engagement"
          subtitle="Compounding behaviors — Coach Cal use and sharing."
        >
          <EngagementCard
            coachCalTriers={activation?.coachAiUsers ?? 0}
            sharers={shareLifetime?.distinctSharers ?? 0}
            totalShares={shareLifetime?.totalShares ?? 0}
            totalUsers={totalUsers}
          />
        </Section>
      </div>

      {/* Inbox row */}
      <Section
        title="Inbox"
        subtitle="Things waiting on you — clear these to keep the site healthy."
      >
        <KpiGrid>
          <SmallKpi
            icon={Ticket}
            label="Pending coach invites"
            value={formatInt(pendingInvites)}
            sub={pendingInvites === 0 ? "none outstanding" : "review or revoke"}
            tone={pendingInvites > 0 ? "amber" : "muted"}
            onClick={() => onJump("invites")}
          />
          <SmallKpi
            icon={Brain}
            label="Unreviewed Cal misses"
            value={formatInt(unreviewedKbMisses)}
            sub={unreviewedKbMisses === 0 ? "all triaged" : "needs KB updates"}
            tone={unreviewedKbMisses > 0 ? "amber" : "muted"}
            onClick={() => onJump("ai_feedback")}
          />
          <SmallKpi
            icon={MessageCircle}
            label="Feedback (30d)"
            value={formatInt(recentFeedback)}
            sub={recentFeedback === 0 ? "no new notes" : "read what coaches said"}
            onClick={() => onJump("feedback")}
          />
          <SmallKpi
            icon={CreditCard}
            label="Stripe"
            value={stripeBadge.label}
            sub={
              activeGiftCodes > 0
                ? `${formatInt(activeGiftCodes)} gift codes outstanding`
                : "no gift codes outstanding"
            }
            tone={stripeBadge.tone}
            onClick={() => onJump("payments")}
          />
        </KpiGrid>
      </Section>
    </div>
  );
}

function TimeframeSelector({
  value,
  onChange,
  disabled,
}: {
  value: OverviewWindow;
  onChange: (next: OverviewWindow) => void;
  disabled: boolean;
}) {
  const options: OverviewWindow[] = ["7d", "30d", "90d", "all"];
  return (
    <div className="inline-flex rounded-xl border border-border bg-surface-raised p-1 text-xs">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt)}
          className={cn(
            "rounded-lg px-3 py-1.5 font-medium tabular-nums transition-colors",
            value === opt
              ? "bg-surface-inset text-foreground"
              : "text-muted hover:text-foreground",
          )}
        >
          {opt === "all" ? "All time" : opt}
        </button>
      ))}
    </div>
  );
}

function HeroKpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {children}
    </div>
  );
}

function HeroKpi({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "emerald" | "amber" | "muted";
  onClick?: () => void;
}) {
  const valueTone =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "muted"
          ? "text-muted"
          : "text-foreground";
  const Inner = (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface-raised p-4 transition-colors hover:bg-surface-inset">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {label}
        </p>
        <Icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", valueTone)}>
        {value}
      </p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-2">
        {sub ? <p className="text-xs text-muted">{sub}</p> : <span />}
        {onClick ? (
          <ArrowRight
            className="size-3.5 shrink-0 text-muted"
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  );
  if (!onClick) return Inner;
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {Inner}
    </button>
  );
}

function Section({
  title,
  subtitle,
  onJump,
  children,
}: {
  title: string;
  subtitle?: string;
  onJump?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
        </div>
        {onJump ? (
          <button
            type="button"
            onClick={onJump}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
          >
            Open
            <ArrowRight className="size-3" />
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {children}
    </div>
  );
}

function SmallKpi({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "emerald" | "amber" | "muted";
  onClick?: () => void;
}) {
  return <HeroKpi icon={Icon} label={label} value={value} sub={sub} tone={tone} onClick={onClick} />;
}

function ActivationFunnelView({
  funnel,
  totalUsers,
}: {
  funnel: ActivationFunnel;
  totalUsers: number;
}) {
  const steps: Array<{ label: string; count: number; hint: string }> = [
    { label: "Signed up", count: totalUsers, hint: "all-time users" },
    { label: "Made a playbook", count: funnel.playbookCreators, hint: "" },
    { label: "Built a play", count: funnel.playCreators1Plus, hint: "1+ plays" },
    { label: "Got serious", count: funnel.playCreators5Plus, hint: "5+ plays" },
    { label: "Built a unit", count: funnel.playCreators10Plus, hint: "10+ plays" },
    { label: "Power user", count: funnel.playCreators13Plus, hint: "13+ plays" },
  ];
  const top = steps[0].count;
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <div className="space-y-2.5">
        {steps.map((step, idx) => {
          const prev = idx === 0 ? null : steps[idx - 1].count;
          const drop = prev !== null && prev > 0 ? 1 - step.count / prev : 0;
          const widthPct = top > 0 ? (step.count / top) * 100 : 0;
          return (
            <div key={step.label} className="flex items-center gap-3">
              <div className="flex w-40 shrink-0 flex-col">
                <span className="text-xs font-medium text-foreground">{step.label}</span>
                {step.hint ? (
                  <span className="text-[10px] text-muted">{step.hint}</span>
                ) : null}
              </div>
              <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-surface-inset">
                <div
                  className="h-full bg-primary/80"
                  style={{ width: `${Math.max(0.5, widthPct)}%` }}
                />
                <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-semibold text-foreground tabular-nums">
                  {formatInt(step.count)}
                </span>
              </div>
              <div className="w-20 shrink-0 text-right text-[11px] tabular-nums">
                {prev === null ? (
                  <span className="text-muted">—</span>
                ) : prev === 0 ? (
                  <span className="text-muted">n/a</span>
                ) : drop > 0 ? (
                  <span className="text-rose-600 dark:text-rose-400">
                    −{formatPct(drop)}
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400">flat</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Drop-off shown right of each bar is the % loss from the prior step. The
        bigger the drop, the more there is to fix between those two states.
      </p>
    </div>
  );
}

function TrafficTrendCard({
  current,
  prior,
  signups,
  views,
  sessions,
}: {
  current: Array<{ day: string; views: number; signups: number }>;
  prior: Array<{ day: string; views: number; signups: number }>;
  signups: number;
  views: number;
  sessions: number;
}) {
  const priorViews = prior.reduce((s, d) => s + d.views, 0);
  const priorSignups = prior.reduce((s, d) => s + d.signups, 0);
  const dViews = deltaPct(views, priorViews);
  const dSignups = deltaPct(signups, priorSignups);

  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <DualLineChart days={current} />
      <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border pt-3 text-xs">
        <StatCell label="Views" value={formatInt(views)} delta={dViews} />
        <StatCell label="Signups" value={formatInt(signups)} delta={dSignups} />
        <StatCell label="Sessions" value={formatInt(sessions)} />
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number | null;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <p className="text-base font-semibold tabular-nums text-foreground">{value}</p>
        {delta !== undefined && delta !== null ? <DeltaPill delta={delta} /> : null}
      </div>
    </div>
  );
}

function DeltaPill({ delta }: { delta: number }) {
  if (delta === 0) {
    return <span className="text-[10px] text-muted">flat</span>;
  }
  const Icon = delta > 0 ? ArrowUpRight : ArrowDownRight;
  const cls =
    delta > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";
  return (
    <span className={cn("inline-flex items-center text-[10px] font-medium tabular-nums", cls)}>
      <Icon className="size-3" aria-hidden="true" />
      {formatPct(Math.abs(delta))}
    </span>
  );
}

function DualLineChart({
  days,
}: {
  days: Array<{ day: string; views: number; signups: number }>;
}) {
  if (days.length === 0) {
    return <p className="text-sm text-muted">No data in this window.</p>;
  }
  const width = 320;
  const height = 80;
  const padX = 4;
  const padY = 4;
  const maxViews = Math.max(1, ...days.map((d) => d.views));
  const maxSignups = Math.max(1, ...days.map((d) => d.signups));
  function pathFor(getter: (d: { views: number; signups: number }) => number, max: number) {
    return days
      .map((d, i) => {
        const x = padX + (i / Math.max(1, days.length - 1)) * (width - padX * 2);
        const y = height - padY - (getter(d) / max) * (height - padY * 2);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-20 w-full text-primary"
      role="img"
      aria-label="Daily views and signups"
    >
      <path
        d={pathFor((d) => d.views, maxViews)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeOpacity={0.9}
      />
      <path
        d={pathFor((d) => d.signups, maxSignups)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeOpacity={0.4}
        strokeDasharray="3 3"
      />
    </svg>
  );
}

function TopReferrersCard({
  rows,
}: {
  rows: Array<{ referrer: string; count: number }>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface-raised p-4 text-sm text-muted">
        No referrers in this window.
      </div>
    );
  }
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.referrer} className="flex items-center gap-3">
            <span className="w-40 shrink-0 truncate text-xs text-foreground" title={r.referrer}>
              {prettyReferrer(r.referrer)}
            </span>
            <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-surface-inset">
              <div
                className="h-full bg-primary/70"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">
              {formatInt(r.count)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function prettyReferrer(referrer: string): string {
  if (!referrer || referrer === "direct" || referrer === "(direct)") return "Direct";
  try {
    const u = new URL(referrer.startsWith("http") ? referrer : `https://${referrer}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return referrer;
  }
}

function GeoSnapshotCard({ geo }: { geo: GeoSummary }) {
  const top = geo.countries.slice(0, 5);
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <div className="grid grid-cols-3 gap-3 border-b border-border pb-3 text-center">
        <SnapshotStat label="Countries" value={formatInt(geo.totals.countries)} />
        <SnapshotStat label="Cities" value={formatInt(geo.totals.cities)} />
        <SnapshotStat label="Plotted views" value={formatInt(geo.totals.plottedViews)} />
      </div>
      {top.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No location data in this window.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {top.map((c) => {
            const row = c as {
              code?: string | null;
              name?: string | null;
              country?: string | null;
              count?: number;
              views?: number;
            };
            const name = row.name ?? row.country ?? row.code ?? "—";
            const count = row.views ?? row.count ?? 0;
            return (
              <li key={String(name)} className="flex items-center justify-between text-xs">
                <span className="text-foreground">{String(name)}</span>
                <span className="tabular-nums text-muted">{formatInt(count)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SnapshotStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function EngagementCard({
  coachCalTriers,
  sharers,
  totalShares,
  totalUsers,
}: {
  coachCalTriers: number;
  sharers: number;
  totalShares: number;
  totalUsers: number;
}) {
  const calRate = safePct(coachCalTriers, totalUsers);
  const shareRate = safePct(sharers, totalUsers);
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <div className="grid grid-cols-2 gap-3">
        <EngagementStat
          icon={Brain}
          label="Tried Coach Cal"
          value={formatInt(coachCalTriers)}
          sub={`${formatPct(calRate)} of users`}
        />
        <EngagementStat
          icon={Share2}
          label="Shared a play/playbook"
          value={formatInt(sharers)}
          sub={
            totalShares > 0
              ? `${formatPct(shareRate)} of users · ${formatInt(totalShares)} total shares`
              : `${formatPct(shareRate)} of users`
          }
        />
      </div>
    </div>
  );
}

function EngagementStat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl bg-surface-inset p-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  );
}

function splitByDay(
  byDay: TrafficSummary["byDay"],
  windowKey: OverviewWindow,
): {
  current: Array<{ day: string; views: number; signups: number }>;
  prior: Array<{ day: string; views: number; signups: number }>;
} {
  const sorted = [...byDay].sort((a, b) => a.day.localeCompare(b.day));
  const targetDays = WINDOW_DAYS_CURRENT[windowKey];
  if (sorted.length <= targetDays) {
    return { current: sorted, prior: [] };
  }
  const current = sorted.slice(-targetDays);
  const prior = sorted.slice(Math.max(0, sorted.length - targetDays * 2), sorted.length - targetDays);
  return { current, prior };
}

function activeUsersFor(windowKey: OverviewWindow, traffic: TrafficSummary): number {
  if (windowKey === "7d") return traffic.totals.activeLast7;
  if (windowKey === "30d") return traffic.totals.activeLast30;
  // Approximate 90d and all-time with activeLast30 since we don't have wider
  // aggregates yet. Better than showing zero.
  return traffic.totals.activeLast30;
}

export function deriveOverviewProps({
  initialUsersCount,
  excludedEmailsCount,
  traffic,
  geo,
  invites,
  feedback,
  kbMisses,
  giftCodes,
  stripeMode,
  billing,
  billingError,
  activation,
  shareLifetime,
  window,
}: {
  initialUsersCount: number;
  excludedEmailsCount: number;
  traffic: TrafficSummary;
  geo: GeoSummary;
  invites: CoachInvitationRow[];
  feedback: FeedbackRow[];
  kbMisses: KbMissRow[];
  giftCodes: GiftCodeRow[];
  stripeMode: StripeConfigStatus["mode"];
  billing: BillingSummary | null;
  billingError: string | null;
  activation: MonetizationSummary | null;
  shareLifetime: ShareLifetimeSummary | null;
  window: OverviewWindow;
}): Omit<OverviewProps, "onJump"> {
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentFeedback = feedback.filter((f) => {
    const t = Date.parse(f.createdAt);
    return Number.isFinite(t) && t >= since;
  }).length;
  const pendingInvites = invites.filter((i) => i.status === "active").length;
  const activeGiftCodes = giftCodes.filter(
    (g) => !g.revokedAt && g.usedCount < g.maxUses,
  ).length;
  return {
    window,
    totalUsers: Math.max(0, initialUsersCount - excludedEmailsCount),
    traffic,
    geo,
    pendingInvites,
    recentFeedback,
    unreviewedKbMisses: kbMisses.length,
    activeGiftCodes,
    stripeMode,
    billing,
    billingError,
    activation: activation?.funnel ?? null,
    shareLifetime,
  };
}
