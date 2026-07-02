"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui";
import {
  getReengagementMetricsAction,
  type ReengagementMetrics,
  type ReengagementFunnel,
  type ReengagementSendRow,
} from "@/app/actions/admin-reengagement";

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

function pct(num: number, denom: number): string {
  if (denom === 0) return "—";
  return `${((num / denom) * 100).toFixed(1)}%`;
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

function FunnelBlock({ label, funnel }: { label: string; funnel: ReengagementFunnel }) {
  const sent = funnel.sent;
  // We measure click/return/added/sub rates against `sent` (top of
  // funnel), not against the previous stage — coaches care about the
  // overall efficiency of each step from "we emailed N people."
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <div className="mt-3 grid grid-cols-5 gap-3 text-center">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Sent</p>
          <p className="mt-1 text-xl font-semibold">{formatInt(funnel.sent)}</p>
          <p className="mt-0.5 text-[10px] text-muted">100%</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Clicked</p>
          <p className="mt-1 text-xl font-semibold">{formatInt(funnel.clicked)}</p>
          <p className="mt-0.5 text-[10px] text-muted">{pct(funnel.clicked, sent)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Returned</p>
          <p className="mt-1 text-xl font-semibold">{formatInt(funnel.returned)}</p>
          <p className="mt-0.5 text-[10px] text-muted">{pct(funnel.returned, sent)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Added play</p>
          <p className="mt-1 text-xl font-semibold">{formatInt(funnel.addedPlay)}</p>
          <p className="mt-0.5 text-[10px] text-muted">{pct(funnel.addedPlay, sent)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Subscribed</p>
          <p className="mt-1 text-xl font-semibold text-primary">{formatInt(funnel.subscribed)}</p>
          <p className="mt-0.5 text-[10px] text-muted">{pct(funnel.subscribed, sent)}</p>
        </div>
      </div>
    </div>
  );
}

function relativeTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatusPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={
        on
          ? "inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
          : "inline-flex items-center rounded-full bg-surface-inset px-2 py-0.5 text-[11px] font-medium text-muted"
      }
    >
      {label}
    </span>
  );
}

function SendsTable({ rows }: { rows: ReengagementSendRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface-raised p-4 text-sm text-muted">
        No sends yet.
      </p>
    );
  }
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface-raised md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-inset text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-medium">Recipient</th>
              <th className="px-3 py-2 font-medium">Kind</th>
              <th className="px-3 py-2 font-medium">Variant</th>
              <th className="px-3 py-2 font-medium">Sent</th>
              <th className="px-3 py-2 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.userId}-${r.kind}`}
                className="border-b border-border last:border-0 hover:bg-surface-inset/50"
              >
                <td className="px-3 py-2">
                  <div className="text-foreground">{r.displayName ?? "(no name)"}</div>
                  <div className="text-[11px] text-muted">{r.email ?? "(no email)"}</div>
                </td>
                <td className="px-3 py-2 text-foreground">{r.kind}</td>
                <td className="px-3 py-2 text-muted">{r.sportVariant ?? "—"}</td>
                <td className="px-3 py-2 text-muted">{relativeTime(r.sentAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <StatusPill on={r.clicked} label="Click" />
                    <StatusPill on={r.returned} label="Return" />
                    <StatusPill on={r.addedPlay} label="+Play" />
                    <StatusPill on={r.subscribed} label="Subscribe" />
                    {r.optedOut ? <StatusPill on={false} label="Opted out" /> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {rows.map((r) => (
          <div
            key={`${r.userId}-${r.kind}`}
            className="rounded-xl border border-border bg-surface-raised p-3"
          >
            <div className="font-medium text-foreground">{r.displayName ?? "(no name)"}</div>
            <div className="text-xs text-muted">{r.email ?? "(no email)"}</div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              <span>Kind {r.kind}</span>
              <span>Variant {r.sportVariant ?? "—"}</span>
              <span>Sent {relativeTime(r.sentAt)}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <StatusPill on={r.clicked} label="Click" />
              <StatusPill on={r.returned} label="Return" />
              <StatusPill on={r.addedPlay} label="+Play" />
              <StatusPill on={r.subscribed} label="Subscribe" />
              {r.optedOut ? <StatusPill on={false} label="Opted out" /> : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function ReengagementAdminClient({
  initial,
}: {
  initial: ReengagementMetrics;
}) {
  const [metrics, setMetrics] = useState(initial);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function refresh() {
    startTransition(async () => {
      const res = await getReengagementMetricsAction();
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setMetrics(res.metrics);
      toast("Refreshed.", "success");
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Re-engagement email</h2>
          <p className="text-sm text-muted">
            Nudges to 1-play stalled users. Funnel from send → click → return → +play → paid sub.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm hover:bg-surface-inset disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total sent" value={formatInt(metrics.overall.sent)} />
        <StatTile
          label="Click rate"
          value={pct(metrics.overall.clicked, metrics.overall.sent)}
          sub={`${formatInt(metrics.overall.clicked)} clicked`}
        />
        <StatTile
          label="Return rate"
          value={pct(metrics.overall.returned, metrics.overall.sent)}
          sub={`${formatInt(metrics.overall.returned)} came back`}
        />
        <StatTile
          label="Conversion"
          value={pct(metrics.overall.subscribed, metrics.overall.sent)}
          sub={`${formatInt(metrics.overall.subscribed)} subscribed`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {metrics.byKind.map((b) => (
          <FunnelBlock
            key={b.kind}
            label={b.kind === "3d" ? "3-day nudge" : "10-day nudge"}
            funnel={b.funnel}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Opt-outs" value={formatInt(metrics.optOuts)} />
        <StatTile
          label="Added play after nudge"
          value={pct(metrics.overall.addedPlay, metrics.overall.sent)}
          sub={`${formatInt(metrics.overall.addedPlay)} of ${formatInt(metrics.overall.sent)}`}
        />
        <StatTile
          label="Computed"
          value={relativeTime(metrics.computedAt)}
          sub={new Date(metrics.computedAt).toLocaleString()}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Recent sends</h3>
        <SendsTable rows={metrics.recentSends} />
      </div>
    </div>
  );
}
