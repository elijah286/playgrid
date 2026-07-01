"use client";

import type { LucideIcon } from "lucide-react";
import {
  Brain,
  Clock,
  CreditCard,
  DollarSign,
  Network,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  getCustomerActivityAction,
  type CustomerActivityDetail,
  type PayerRow,
  type RevenueBreakdown,
  type RevenueTierKey,
} from "@/app/actions/admin-billing";
import type { PayerBadge } from "@/lib/billing/payer-status";
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

type SortKey = "lifetime" | "network" | "referred" | "joined";

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

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 60) return "< 1m";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours >= 1) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Never";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

const BADGE_STYLES: Record<
  PayerBadge,
  { label: string; cls: string }
> = {
  active: {
    label: "Active",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  trialing: {
    label: "Trial",
    cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  past_due: {
    label: "Past due",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  canceling: {
    label: "Canceling",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  cancelled: {
    label: "Cancelled",
    cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
  one_time: {
    label: "One-time",
    cls: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  },
};

function StatusBadge({ badge }: { badge: PayerBadge | null }) {
  if (!badge) return <span className="text-muted-light">—</span>;
  const { label, cls } = BADGE_STYLES[badge];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        cls,
      )}
    >
      {label}
    </span>
  );
}

export function RevenueAdminClient({ breakdown, error }: Props) {
  const [selected, setSelected] = useState<PayerRow | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("lifetime");

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

  const { summary, byTier, monthly, payers } = breakdown;
  const arr = summary.mrr * 12;

  const sortedPayers = [...payers].sort((a, b) => {
    if (sortKey === "network") return b.networkSpend - a.networkSpend;
    if (sortKey === "referred") return b.directReferrals - a.directReferrals;
    if (sortKey === "joined") {
      // Newest signups first; accounts with no known join date sort last.
      const at = a.joinedAt ? Date.parse(a.joinedAt) : -Infinity;
      const bt = b.joinedAt ? Date.parse(b.joinedAt) : -Infinity;
      return bt - at;
    }
    return b.lifetimeSpend - a.lifetimeSpend;
  });

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

      {/* Paying customers */}
      <Section
        title={`Paying customers (${formatInt(payers.length)})`}
        subtitle="Everyone who has ever paid — active, cancelled, or one-time. Click a row for engagement and referral details."
      >
        {payers.length === 0 ? (
          <EmptyCard text="No paying customers yet." />
        ) : (
          <PayersTable
            rows={sortedPayers}
            sortKey={sortKey}
            onSort={setSortKey}
            onSelect={setSelected}
          />
        )}
      </Section>

      {selected ? (
        <CustomerDrawer payer={selected} onClose={() => setSelected(null)} />
      ) : null}
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

function payerName(r: PayerRow): string {
  return r.displayName ?? r.email ?? "Unknown customer";
}

function SortHeader({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 transition-colors hover:text-foreground",
        active && "text-foreground",
      )}
    >
      {label}
      <span className={cn("text-[9px]", active ? "opacity-100" : "opacity-0")}>
        ▼
      </span>
    </button>
  );
}

function PayersTable({
  rows,
  sortKey,
  onSort,
  onSelect,
}: {
  rows: PayerRow[];
  sortKey: SortKey;
  onSort: (k: SortKey) => void;
  onSelect: (r: PayerRow) => void;
}) {
  const rowKey = (r: PayerRow, i: number) =>
    r.userId ?? r.customerId ?? r.email ?? `row-${i}`;

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface-raised md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-inset text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Joined"
                  active={sortKey === "joined"}
                  onClick={() => onSort("joined")}
                />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader
                  label="Lifetime"
                  active={sortKey === "lifetime"}
                  onClick={() => onSort("lifetime")}
                />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader
                  label="Network $"
                  active={sortKey === "network"}
                  onClick={() => onSort("network")}
                />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader
                  label="Referred"
                  active={sortKey === "referred"}
                  onClick={() => onSort("referred")}
                />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr
                key={rowKey(r, i)}
                onClick={() => onSelect(r)}
                className="cursor-pointer transition-colors hover:bg-surface-inset/60"
              >
                <td className="px-4 py-3 align-middle">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {payerName(r)}
                    </span>
                    {r.email && r.displayName ? (
                      <span className="text-xs text-muted">{r.email}</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 align-middle">
                  <div className="flex flex-col gap-0.5">
                    <StatusBadge badge={r.badge} />
                    {r.subscriptionEndsAt && r.badge === "canceling" ? (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400">
                        ends {formatDate(r.subscriptionEndsAt)}
                      </span>
                    ) : r.subscriptionEndsAt && r.badge === "cancelled" ? (
                      <span className="text-[10px] text-muted">
                        ended {formatDate(r.subscriptionEndsAt)}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 align-middle text-sm tabular-nums text-muted">
                  {r.joinedAt ? formatDate(r.joinedAt) : "—"}
                </td>
                <td className="px-4 py-3 align-middle text-right text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(r.lifetimeSpend)}
                </td>
                <td className="px-4 py-3 align-middle text-right text-sm tabular-nums text-foreground">
                  {r.networkSpend > 0 ? (
                    formatCurrency(r.networkSpend)
                  ) : (
                    <span className="text-muted-light">—</span>
                  )}
                </td>
                <td className="px-4 py-3 align-middle text-right text-sm tabular-nums text-muted">
                  {r.directReferrals > 0 ? formatInt(r.directReferrals) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {rows.map((r, i) => (
          <button
            type="button"
            key={rowKey(r, i)}
            onClick={() => onSelect(r)}
            className="w-full rounded-xl border border-border bg-surface-raised p-3 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex flex-col">
                <span className="truncate font-medium text-foreground">
                  {payerName(r)}
                </span>
                {r.email && r.displayName ? (
                  <span className="truncate text-xs text-muted">{r.email}</span>
                ) : null}
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge badge={r.badge} />
                  {r.joinedAt ? (
                    <span className="text-[10px] text-muted">
                      joined {formatDate(r.joinedAt)}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(r.lifetimeSpend)}
                </span>
                {r.networkSpend > 0 ? (
                  <span className="block text-[11px] text-muted">
                    +{formatCurrency(r.networkSpend, { compact: true })} network
                  </span>
                ) : null}
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function DrawerStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "emerald";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-inset p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          tone === "emerald"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function CustomerDrawer({
  payer,
  onClose,
}: {
  payer: PayerRow;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<CustomerActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // Fire the drill-down fetch once per opened customer.
    const uid = payer.userId;
    if (!uid) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getCustomerActivityAction(uid)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setDetail(res.detail);
        else setLoadError(res.error);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [payer.userId]);

  const combinedValue = payer.lifetimeSpend + payer.networkSpend;

  return (
    // Below `sm:` the drawer is full-width (no backdrop to tap), so it's kept
    // within the site chrome instead of covering it end to end — otherwise
    // the only way out is the small X button. 61px matches --site-header-height
    // (globals.css) — measured, not just computed from classes: the header's
    // h-8→h-9 logo bump at `sm:` doesn't actually change the row height, so
    // it's 61px at every width, not 57px. 52px is HomeBottomNav's height
    // (globals.css's own canonical figure); it renders on every route except
    // the ones in bottomNavRoutes.ts, which /settings isn't, so it's visible
    // underneath this drawer on mobile too.
    <div
      className="fixed inset-x-0 bottom-[52px] top-[61px] z-50 flex justify-end sm:top-0 sm:bottom-0"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-surface-raised shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground">
              {payerName(payer)}
            </h3>
            {payer.email ? (
              <p className="truncate text-xs text-muted">{payer.email}</p>
            ) : null}
            <div className="mt-2 flex items-center gap-2">
              <StatusBadge badge={payer.badge} />
              {payer.tier ? (
                <span className="text-xs text-muted">
                  {TIER_LABEL[payer.tier]}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-6 p-4">
          {/* Value */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Value
            </p>
            <div className="grid grid-cols-2 gap-2">
              <DrawerStat
                label="Own spend"
                value={formatCurrency(payer.lifetimeSpend)}
                tone="emerald"
              />
              <DrawerStat
                label="Network spend"
                value={formatCurrency(payer.networkSpend)}
                tone="emerald"
              />
            </div>
            <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Total influenced value
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCurrency(combinedValue)}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                Their own spend plus everyone in their referral tree.
              </p>
            </div>
          </div>

          {/* Subscription */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Subscription
            </p>
            <div className="rounded-xl border border-border bg-surface-inset p-3 text-sm">
              <Row label="Status">
                <StatusBadge badge={payer.badge} />
              </Row>
              {payer.subscriptionEndsAt ? (
                <Row
                  label={
                    payer.badge === "cancelled" ? "Ended" : "Access ends"
                  }
                >
                  <span className="tabular-nums">
                    {formatDate(payer.subscriptionEndsAt)}
                  </span>
                </Row>
              ) : null}
            </div>
          </div>

          {/* Engagement */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <Clock className="size-3.5" /> Engagement
            </p>
            {loading ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : payer.userId == null ? (
              <p className="text-sm text-muted">
                No linked account — can't show on-site activity.
              </p>
            ) : loadError ? (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {loadError}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <DrawerStat
                  label="Time on site"
                  value={formatDuration(detail?.totalSecondsOnSite ?? 0)}
                />
                <DrawerStat
                  label="Last seen"
                  value={formatRelative(detail?.lastActiveAt ?? null)}
                />
              </div>
            )}
          </div>

          {/* Cal usage */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <Brain className="size-3.5" /> Cal usage
            </p>
            {loading ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : payer.userId == null ? (
              <p className="text-sm text-muted">
                No linked account — can&apos;t show Cal usage.
              </p>
            ) : loadError ? (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {loadError}
              </p>
            ) : !detail?.calUsage.lastActivity ? (
              <p className="text-sm text-muted">Hasn&apos;t used Coach Cal yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <DrawerStat
                  label="Cal spend"
                  value={formatCurrency(detail.calUsage.costMicros / 1_000_000)}
                />
                <DrawerStat
                  label="Last Cal activity"
                  value={formatRelative(detail.calUsage.lastActivity)}
                />
              </div>
            )}
          </div>

          {/* Referral network */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <Network className="size-3.5" /> Referral network
            </p>
            {payer.networkSize === 0 ? (
              <p className="text-sm text-muted">
                Hasn't referred anyone yet.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <DrawerStat
                    label="Direct"
                    value={formatInt(payer.directReferrals)}
                  />
                  <DrawerStat
                    label="Total network"
                    value={formatInt(payer.networkSize)}
                  />
                  <DrawerStat
                    label="Network $"
                    value={formatCurrency(payer.networkSpend, { compact: true })}
                    tone="emerald"
                  />
                </div>

                {/* Per-level breakdown */}
                {payer.networkLevels.length > 0 ? (
                  <div className="overflow-hidden rounded-xl border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-inset text-[10px] uppercase tracking-wide text-muted">
                        <tr>
                          <th className="px-3 py-2">Level</th>
                          <th className="px-3 py-2 text-right">People</th>
                          <th className="px-3 py-2 text-right">Spend</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {payer.networkLevels.map((l) => (
                          <tr key={l.level}>
                            <td className="px-3 py-2 text-muted">
                              {l.level === 1
                                ? "Direct"
                                : `Level ${l.level}`}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatInt(l.count)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(l.spend)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {/* Direct referral names */}
                {detail && detail.directReferrals.length > 0 ? (
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-muted">
                      Directly referred
                    </p>
                    <ul className="divide-y divide-border rounded-xl border border-border">
                      {detail.directReferrals.map((d) => (
                        <li
                          key={d.userId}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate text-foreground">
                            {d.displayName ?? d.email ?? "Unknown"}
                          </span>
                          <span className="shrink-0 tabular-nums text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(d.lifetimeSpend)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted">{label}</span>
      {children}
    </div>
  );
}
