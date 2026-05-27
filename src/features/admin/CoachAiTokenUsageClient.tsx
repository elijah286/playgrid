"use client";

import { Card } from "@/components/ui";
import type {
  CoachAiTokenUsageRow,
  CoachAiTokenUsageSummary,
} from "@/app/actions/coach-ai-token-usage";

type Props = { initial: CoachAiTokenUsageSummary };

// Micro-USD → display string. We show full cents on the row level so a
// run-up to the $5 ceiling is legible at a glance; totals show whole
// dollars + two decimals.
function fmtMicros(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars >= 1) return `$${dollars.toFixed(2)}`;
  if (dollars >= 0.01) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(4)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtTimeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatContextBreakdown(b: Record<string, number>): string {
  const entries = Object.entries(b).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "—";
  return entries
    .map(([k, v]) => `${k.replace("_", " ")} ${fmtMicros(v)}`)
    .join(" · ");
}

export function CoachAiTokenUsageClient({ initial }: Props) {
  if (!initial.ok) {
    return (
      <Card className="p-4">
        <div className="text-sm text-red-600">
          Failed to load Cal usage: {initial.error}
        </div>
      </Card>
    );
  }

  const { rows, totals, monthLabel } = initial;
  const paidCap = 5_000_000; // $5 in micro-USD — the per-paid-user ceiling.

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-sm text-slate-500">
              {monthLabel} · Coach Cal raw API spend
            </div>
            <div className="text-2xl font-semibold">
              {fmtMicros(totals.costMicros)}
            </div>
          </div>
          <div className="text-right text-sm text-slate-600">
            <div>
              {totals.activeUsers} active users ·{" "}
              {fmtTokens(totals.inputTokens)} in /{" "}
              {fmtTokens(totals.outputTokens)} out
            </div>
            <div className="text-xs text-slate-500">
              cache: {fmtTokens(totals.cacheReadTokens)} read ·{" "}
              {fmtTokens(totals.cacheWriteTokens)} write
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-right">MTD cost</th>
              <th className="px-3 py-2 text-right">vs $5 cap</th>
              <th className="px-3 py-2 text-right">Tokens (in/out)</th>
              <th className="px-3 py-2 text-left">Breakdown</th>
              <th className="px-3 py-2 text-right">Last</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                  No usage recorded this month yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <UserRow key={r.userId} row={r} paidCap={paidCap} />
            ))}
          </tbody>
        </table>
      </Card>

      <div className="text-xs text-slate-500">
        Numbers reflect raw Anthropic API spend (input + output + cache
        tokens, priced at current Haiku 4.5 / Opus 4.7 rates). Coaches do
        not see this — they see the existing message-count meter.
      </div>
    </div>
  );
}

function UserRow({ row, paidCap }: { row: CoachAiTokenUsageRow; paidCap: number }) {
  const pct = paidCap > 0 ? Math.min(100, (row.costMicros / paidCap) * 100) : 0;
  const overCap = row.costMicros > paidCap;
  const barColor = overCap
    ? "bg-red-500"
    : pct >= 75
      ? "bg-amber-500"
      : "bg-emerald-500";
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2">
        <div className="font-medium">
          {row.displayName ?? row.email ?? row.userId.slice(0, 8)}
        </div>
        {row.displayName && row.email && (
          <div className="text-xs text-slate-500">{row.email}</div>
        )}
        {row.role === "admin" && (
          <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wide text-purple-700">
            admin
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono">{fmtMicros(row.costMicros)}</td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex items-center gap-2">
          <div className="h-1.5 w-20 rounded-full bg-slate-200 overflow-hidden">
            <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          <span className={`text-xs ${overCap ? "text-red-600 font-semibold" : "text-slate-500"}`}>
            {pct.toFixed(0)}%
          </span>
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs text-slate-600">
        {fmtTokens(row.inputTokens)} / {fmtTokens(row.outputTokens)}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600">
        {formatContextBreakdown(row.contextBreakdown)}
      </td>
      <td className="px-3 py-2 text-right text-xs text-slate-500">
        {fmtTimeAgo(row.lastActivity)}
      </td>
    </tr>
  );
}
