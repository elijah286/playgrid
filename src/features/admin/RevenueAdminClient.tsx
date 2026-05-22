"use client";

import type { LucideIcon } from "lucide-react";
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  Users,
} from "lucide-react";
import type {
  RevenueBreakdown,
  RevenueTierKey,
} from "@/app/actions/admin-billing";
import { cn } from "@/lib/utils";

type Props = {
  breakdown: RevenueBreakdown | null;
  error: string | null;
};

const TIER_LABEL: Record<RevenueTierKey, string> = {
  coach: "Coach",
  coach_ai: "Coach Pro",
  pack: "Pack",
  other: "Other",
};

function formatCurrency(n: number, opts?: { compact?: boolean }): string {
  if (!Number.isFinite(n)) return "$0";
  if (opts?.compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}m`;
    if (Math.abs(n) >= 10_000) return `$${Math.round(n / 1000)}k`;
    if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
    return `$${Math.round(n)}`;
  }
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

function shortMonth(key: string): string {
  // key is "YYYY-MM"
  const [y, m] = key.split("-");
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return date.toLocaleString("en-US", { month: "short", year: "2-digit" });
}

export function RevenueAdminClient({ breakdown, error }: Props) {
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/40 bg-rose-500/5 p-4 text-sm text-rose-700 dark:text-rose-300">
        Stripe error: {error}
        <p className="mt-2 text-xs text-muted">
          Connect Stripe in Site admin → Integrations to populate this view.
        </p>
      </div>
    );
  }
  if (!breakdown) {
    return (
      <p className="text-sm text-muted">Loading revenue data from Stripe…</p>
    );
  }

  const { summary, byTier, monthly, topCustomers } = breakdown;
  const arr = summary.mrr * 12;

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-base font-semibold text-foreground">Revenue</h2>
        <p className="mt-1 text-sm text-muted">
          Pulled live from Stripe, cached for 60 minutes. Last refreshed{" "}
          {new Date(breakdown.asOf).toLocaleString()}.
        </p>
      </header>

      {/* Hero strip */}
      <KpiGrid>
        <Kpi
          icon={DollarSign}
          label="MRR"
          value={formatCurrency(summary.mrr, { compact: true })}
          sub="recurring revenue"
          tone="emerald"
        />
        <Kpi
          icon={TrendingUp}
          label="ARR"
          value={formatCurrency(arr, { compact: true })}
          sub="MRR × 12"
          tone="emerald"
        />
        <Kpi
          icon={Users}
          label="Paid users"
          value={formatInt(summary.paidUsers)}
          sub={
            summary.trialingUsers > 0
              ? `${formatInt(summary.trialingUsers)} trialing`
              : "active subscribers"
          }
        />
        <Kpi
          icon={CreditCard}
          label="Lifetime"
          value={formatCurrency(summary.lifetimeRevenue, { compact: true })}
          sub="net of refunds"
          tone="emerald"
        />
      </KpiGrid>

      {/* Tier breakdown */}
      <Section
        title="What's selling"
        subtitle="Active subscriptions grouped by tier. Each bar is MRR contribution."
      >
        {byTier.length === 0 ? (
          <EmptyCard text="No active subscriptions yet." />
        ) : (
          <TierBars rows={byTier} />
        )}
      </Section>

      {/* Revenue over time */}
      <Section
        title="Revenue over time"
        subtitle="Last 12 months of Stripe charges, net of refunds."
      >
        <MonthlyChart rows={monthly} />
      </Section>

      {/* Top customers */}
      <Section
        title="Top customers"
        subtitle={`Lifetime spend, net of refunds. Top ${topCustomers.length} shown.`}
      >
        {topCustomers.length === 0 ? (
          <EmptyCard text="No paying customers yet." />
        ) : (
          <TopCustomersTable rows={topCustomers} />
        )}
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "emerald";
}) {
  const valueCls =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-foreground";
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {label}
        </p>
        <Icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", valueCls)}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4 text-sm text-muted">
      {text}
    </div>
  );
}

function TierBars({ rows }: { rows: RevenueBreakdown["byTier"] }) {
  const maxMrr = Math.max(...rows.map((r) => r.mrr), 1);
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.tier} className="flex items-center gap-3">
            <div className="w-28 shrink-0">
              <p className="text-sm font-medium text-foreground">
                {TIER_LABEL[r.tier]}
              </p>
              <p className="text-[10px] text-muted">
                {formatInt(r.count)} {r.count === 1 ? "sub" : "subs"}
              </p>
            </div>
            <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-surface-inset">
              <div
                className="h-full bg-emerald-500/70"
                style={{ width: `${Math.max(0.5, (r.mrr / maxMrr) * 100)}%` }}
              />
              <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-semibold tabular-nums text-foreground">
                {formatCurrency(r.mrr, { compact: true })} / mo
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MonthlyChart({ rows }: { rows: RevenueBreakdown["monthly"] }) {
  const max = Math.max(...rows.map((r) => r.total), 1);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <div className="flex items-end gap-1.5">
        {rows.map((r) => {
          const heightPct = (r.total / max) * 100;
          return (
            <div
              key={r.month}
              className="group flex flex-1 flex-col items-center gap-1"
              title={`${shortMonth(r.month)}: ${formatCurrency(r.total)}`}
            >
              <div className="relative flex h-32 w-full items-end overflow-hidden rounded-sm bg-surface-inset">
                <div
                  className="w-full bg-emerald-500/80"
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <p className="text-[10px] tabular-nums text-muted">
                {shortMonth(r.month)}
              </p>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
        <span className="text-muted">12-month total</span>
        <span className="font-semibold tabular-nums text-foreground">
          {formatCurrency(grandTotal, { compact: true })}
        </span>
      </div>
    </div>
  );
}

function TopCustomersTable({
  rows,
}: {
  rows: RevenueBreakdown["topCustomers"];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-raised">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-inset text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Tier</th>
            <th className="px-4 py-3 text-right">Lifetime spend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.customerId}>
              <td className="px-4 py-3 align-middle">
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">
                    {r.displayName ?? r.email ?? "Unknown customer"}
                  </span>
                  {r.email && r.displayName ? (
                    <span className="text-xs text-muted">{r.email}</span>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3 align-middle text-xs text-muted">
                {r.tier ? TIER_LABEL[r.tier] : <span className="text-muted-light">—</span>}
              </td>
              <td className="px-4 py-3 align-middle text-right text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCurrency(r.lifetimeSpend)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
