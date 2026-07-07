"use client";

import { useState, useTransition } from "react";
import { Mail, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui";
import {
  getMarketingSummaryAction,
  setInviteTeamEmailEnabledAction,
  type MarketingSummary,
  type CampaignMetrics,
} from "@/app/actions/admin-marketing";

function pct(n: number | null): string {
  return n == null ? "—" : `${(n * 100).toFixed(1)}%`;
}
function signedPct(n: number | null): string {
  if (n == null) return "—";
  const v = (n * 100).toFixed(1);
  return n > 0 ? `+${v}%` : `${v}%`;
}
function liftTone(n: number | null): string {
  if (n == null) return "text-muted";
  if (n > 0.001) return "text-emerald-600 dark:text-emerald-400";
  if (n < -0.001) return "text-danger";
  return "text-muted";
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{value}</p>
      {sub ? <p className="text-[11px] text-muted">{sub}</p> : null}
    </div>
  );
}

function CampaignCard({ c }: { c: CampaignMetrics }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{c.label}</p>
        {c.recurring ? (
          <span className="rounded-full bg-surface-inset px-2 py-0.5 text-[10px] text-muted">recurring</span>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-muted">{c.description}</p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Sent" value={c.treatmentSent.toLocaleString()} />
        <Stat label="Holdout" value={c.holdout.toLocaleString()} />
        <Stat label="Failed" value={c.failed.toLocaleString()} />
      </div>
      {!c.recurring && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label={c.conversionLabel} value={pct(c.treatmentConvRate)} sub="treatment" />
          <Stat label="Holdout" value={pct(c.holdoutConvRate)} sub="control" />
          <div className="rounded-xl border border-border bg-surface px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Lift</p>
            <p className={`mt-0.5 text-lg font-bold tabular-nums ${liftTone(c.convLift)}`}>
              {signedPct(c.convLift)}
            </p>
            <p className="text-[11px] text-muted">vs holdout</p>
          </div>
        </div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Retained 14d" value={pct(c.treatmentRetRate)} sub="treatment" />
        <Stat label="Holdout" value={pct(c.holdoutRetRate)} sub="control" />
        <div className="rounded-xl border border-border bg-surface px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Ret. lift</p>
          <p className={`mt-0.5 text-lg font-bold tabular-nums ${liftTone(c.retLift)}`}>
            {signedPct(c.retLift)}
          </p>
          <p className="text-[11px] text-muted">vs holdout</p>
        </div>
      </div>
    </div>
  );
}

export function MarketingAdminClient({
  initialSummary,
  initialInviteTeamEnabled,
}: {
  initialSummary: MarketingSummary;
  initialInviteTeamEnabled: boolean;
}) {
  const { toast } = useToast();
  const [summary, setSummary] = useState(initialSummary);
  const [inviteEnabled, setInviteEnabled] = useState(initialInviteTeamEnabled);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    setLoading(true);
    const res = await getMarketingSummaryAction();
    if (res.ok) setSummary(res.summary);
    else toast(res.error, "error");
    setLoading(false);
  }

  function toggleInvite(next: boolean) {
    const prev = inviteEnabled;
    setInviteEnabled(next);
    startTransition(async () => {
      const res = await setInviteTeamEmailEnabledAction(next);
      if (!res.ok) {
        setInviteEnabled(prev);
        toast(res.error, "error");
        return;
      }
      toast(next ? "Team-invite email is ON." : "Team-invite email is OFF.", "success");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Mail className="size-4" /> Marketing
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Every lifecycle touch, its A/B holdout, conversion, and 14-day retention lift.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-surface-raised px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-inset disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Team-invite campaign toggle */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Team-invite email (auto-triggered)</p>
          <p className="mt-0.5 text-xs text-muted">
            Emails solo coaches ~a day after their 3rd play, prompting them to bring their team in.
            Eligible coaches are split 50/50 treatment/holdout so the retention lift is measurable.
            Off by default.
          </p>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={inviteEnabled}
            disabled={pending}
            onChange={(e) => toggleInvite(e.target.checked)}
          />
          <span>{inviteEnabled ? "On" : "Off"}</span>
        </label>
      </div>

      {summary.campaigns.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface-raised p-6 text-sm text-muted">
          No campaign touches recorded yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {summary.campaigns.map((c) => (
            <CampaignCard key={c.key} c={c} />
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface-raised p-4">
        <p className="text-sm font-semibold text-foreground">Recent sends</p>
        {summary.recentSends.length === 0 ? (
          <p className="mt-2 text-xs text-muted">Nothing yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border/60 text-xs">
            {summary.recentSends.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-foreground">
                  <span className="font-medium">{s.userLabel}</span>
                  <span className="text-muted"> · {s.campaign}</span>
                </span>
                <span className="flex items-center gap-2 text-muted">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${
                      s.variant === "holdout"
                        ? "bg-surface-inset text-muted"
                        : s.status === "failed"
                          ? "bg-danger-light text-danger"
                          : "bg-primary/10 text-primary"
                    }`}
                  >
                    {s.variant === "holdout" ? "holdout" : s.status}
                  </span>
                  {new Date(s.sentAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
