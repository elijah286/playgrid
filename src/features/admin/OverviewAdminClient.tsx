"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  Brain,
  CreditCard,
  Globe,
  MessageCircle,
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
import type { StripeConfigStatus } from "@/lib/site/stripe-config";

type OverviewProps = {
  totalUsers: number;
  traffic: TrafficSummary;
  geo: GeoSummary;
  pendingInvites: number;
  recentFeedback: number;
  unreviewedKbMisses: number;
  activeGiftCodes: number;
  stripeMode: StripeConfigStatus["mode"];
  onJump: (tab: OverviewJumpTarget) => void;
};

export type OverviewJumpTarget =
  | "users"
  | "analytics"
  | "geography"
  | "invites"
  | "payments"
  | "feedback"
  | "ai_feedback";

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function OverviewAdminClient({
  totalUsers,
  traffic,
  geo,
  pendingInvites,
  recentFeedback,
  unreviewedKbMisses,
  activeGiftCodes,
  stripeMode,
  onJump,
}: OverviewProps) {
  const windowDays = traffic.windowDays || 30;
  const stripeBadge =
    stripeMode === "live"
      ? { label: "Live", tone: "emerald" as const }
      : stripeMode === "test"
        ? { label: "Test mode", tone: "amber" as const }
        : { label: "Not configured", tone: "muted" as const };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-base font-semibold text-foreground">Overview</h2>
        <p className="mt-1 text-sm text-muted">
          Top-line health across the site. Numbers reflect the last{" "}
          {windowDays} days unless noted. Tap any card to jump to the source.
        </p>
      </header>

      <Section title="Audience" subtitle="Who's showing up and signing up">
        <KpiGrid>
          <KpiTile
            icon={Users}
            label="Total users"
            value={formatInt(totalUsers)}
            sub="all-time profiles"
            onClick={() => onJump("users")}
          />
          <KpiTile
            icon={TrendingUp}
            label="Active (30d)"
            value={formatInt(traffic.totals.activeLast30)}
            sub={`${formatInt(traffic.totals.activeLast7)} in last 7d`}
            onClick={() => onJump("analytics")}
          />
          <KpiTile
            icon={Users}
            label={`Signups (${windowDays}d)`}
            value={formatInt(traffic.totals.signups)}
            sub={`from ${formatInt(traffic.conversion.sessions)} sessions`}
            onClick={() => onJump("analytics")}
          />
          <KpiTile
            icon={BarChart3}
            label={`Conversion (${windowDays}d)`}
            value={pct(traffic.conversion.rate)}
            sub={`${formatInt(traffic.conversion.sessionsWithSignup)} / ${formatInt(traffic.conversion.sessions)} sessions`}
            onClick={() => onJump("analytics")}
          />
        </KpiGrid>
      </Section>

      <Section title="Reach" subtitle="Traffic volume and geography">
        <KpiGrid>
          <KpiTile
            icon={BarChart3}
            label={`Views (${windowDays}d)`}
            value={formatInt(traffic.totals.views)}
            sub={`${formatInt(traffic.totals.uniqueSessions)} sessions`}
            onClick={() => onJump("analytics")}
          />
          <KpiTile
            icon={Globe}
            label="Cities"
            value={formatInt(geo.totals.cities)}
            sub={`${formatInt(geo.totals.countries)} countries`}
            onClick={() => onJump("geography")}
          />
          <KpiTile
            icon={Globe}
            label="Plotted views"
            value={formatInt(geo.totals.plottedViews)}
            sub={
              geo.totals.missingLocation > 0
                ? `${formatInt(geo.totals.missingLocation)} unplotted`
                : "all mapped"
            }
            onClick={() => onJump("geography")}
          />
          <KpiTile
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

      <Section
        title="Inbox"
        subtitle="Things waiting on you — clear these to keep the site healthy"
      >
        <KpiGrid>
          <KpiTile
            icon={Ticket}
            label="Pending coach invites"
            value={formatInt(pendingInvites)}
            sub={pendingInvites === 0 ? "none outstanding" : "review or revoke"}
            tone={pendingInvites > 0 ? "amber" : "muted"}
            onClick={() => onJump("invites")}
          />
          <KpiTile
            icon={Brain}
            label="Unreviewed Cal misses"
            value={formatInt(unreviewedKbMisses)}
            sub={unreviewedKbMisses === 0 ? "all triaged" : "needs KB updates"}
            tone={unreviewedKbMisses > 0 ? "amber" : "muted"}
            onClick={() => onJump("ai_feedback")}
          />
          <KpiTile
            icon={MessageCircle}
            label="Feedback (30d)"
            value={formatInt(recentFeedback)}
            sub={recentFeedback === 0 ? "no new notes" : "read what coaches said"}
            onClick={() => onJump("feedback")}
          />
        </KpiGrid>
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
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

function KpiTile({
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
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums ${valueTone}`}
      >
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
    totalUsers: Math.max(0, initialUsersCount - excludedEmailsCount),
    traffic,
    geo,
    pendingInvites,
    recentFeedback,
    unreviewedKbMisses: kbMisses.length,
    activeGiftCodes,
    stripeMode,
  };
}
