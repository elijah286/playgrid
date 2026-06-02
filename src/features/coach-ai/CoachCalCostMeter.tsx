"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import {
  getCoachCalCostStateAction,
  resetCoachCalUsageAction,
} from "@/app/actions/coach-cal-cost";
import { createMessagePackCheckoutAction } from "@/app/actions/coach-cal-pack";
import type {
  CoachCalCostState,
  CostWindowKey,
} from "@/lib/billing/coach-cal-cost-cap";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 min
// Mirror of COACH_CAL_METER_VISIBLE_RATIO — coaches only see the meter
// once they're this close to a limit. (Importing the const would pull a
// server module into the client bundle; the value is stable.)
const VISIBLE_RATIO = 0.75;

const WINDOW_LABEL: Record<CostWindowKey, string> = {
  burst: "5-hour",
  day: "daily",
  month: "monthly",
};

function fmtReset(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return "now";
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days <= 31) return `in ${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function RingProgress({ pct, danger }: { pct: number; danger: boolean }) {
  const r = 7;
  const circ = 2 * Math.PI * r;
  const filled = circ * Math.min(1, pct);
  const track = danger ? "stroke-red-200 dark:stroke-red-900/50" : "stroke-primary/15";
  const fill = danger ? "stroke-red-500" : pct > 0.9 ? "stroke-amber-500" : "stroke-primary";
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" className="shrink-0">
      <circle cx={10} cy={10} r={r} fill="none" strokeWidth={2.5} className={track} />
      <circle
        cx={10} cy={10} r={r} fill="none" strokeWidth={2.5}
        className={fill}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.4s ease" }}
      />
    </svg>
  );
}

function fmtPrice(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export function CoachCalCostMeter({ refreshTick }: { refreshTick: number }) {
  const [state, setState] = useState<CoachCalCostState | null>(null);
  const [open, setOpen] = useState(false);
  const [packPending, setPackPending] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      setState(await getCoachCalCostStateAction());
    } catch {
      /* non-critical */
    }
  }, []);

  const buyMore = useCallback(async () => {
    setPackPending(true);
    try {
      const res = await createMessagePackCheckoutAction();
      if (res.ok) {
        window.location.href = res.url;
      } else {
        setPackPending(false);
      }
    } catch {
      setPackPending(false);
    }
  }, []);

  const resetUsage = useCallback(async () => {
    setResetPending(true);
    try {
      const res = await resetCoachCalUsageAction();
      if (res.ok) await load();
    } catch {
      /* non-critical */
    } finally {
      setResetPending(false);
    }
  }, [load]);

  useEffect(() => { void load(); }, [load, refreshTick]);
  useEffect(() => {
    const id = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!state) return null;

  const ratio = state.nearestPercent / 100;
  // Visibility: admins always see it (so the product owner can calibrate);
  // coaches only once they're near a limit. This keeps new users from
  // ever worrying about caps.
  const visible = state.isAdmin || ratio >= VISIBLE_RATIO;
  if (!visible) return null;

  const danger = state.exceeded;
  const binding = state[state.binding];
  // The pack tops up the monthly budget only — burst/day are abuse guards a
  // top-up can't clear. Offer it once the monthly window is near or over.
  const showBuyMore =
    state.pack.priceConfigured &&
    (state.month.exceeded || state.month.ratio >= VISIBLE_RATIO);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Coach Cal: ${state.nearestPercent}% of ${WINDOW_LABEL[state.binding]} limit`}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:bg-surface-inset hover:text-foreground"
      >
        <RingProgress pct={ratio} danger={danger} />
        <span className={danger ? "text-red-500 font-medium" : ratio >= 0.9 ? "text-amber-500 font-medium" : ""}>
          {state.nearestPercent}%
        </span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute bottom-full right-0 z-50 mb-2 w-72 rounded-xl border border-border bg-surface-raised p-4 shadow-lg"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">Coach Cal usage</p>
              <p className="mt-0.5 text-[11px] text-muted">
                {state.isAdmin ? "Admin view (limits not enforced for you)" : "Approaching your limit"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Coach view: the binding window only, no dollar amounts. */}
          {!state.isAdmin && (
            <div className="mt-3">
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {state.nearestPercent}%
              </p>
              <p className="text-[11px] text-muted">
                of your {WINDOW_LABEL[state.binding]} limit
              </p>
              {binding.exceeded && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                  Limit reached — frees up {fmtReset(binding.resetAt)}.
                </p>
              )}
            </div>
          )}

          {/* Admin view: three bars, one per window. We deliberately do NOT
              show $ amounts in this dialog — costs are admin-only data and
              this surface could surface to a non-admin via a misconfigured
              role check or future shared-screen scenario. Per-user dollar
              numbers live in Site Admin → Cal usage instead. */}
          {state.isAdmin && (
            <div className="mt-3 space-y-2">
              {(["burst", "day", "month"] as CostWindowKey[]).map((k) => {
                const w = state[k];
                const pct = Math.round(w.ratio * 100);
                return (
                  <div key={k} className="flex items-center gap-3 text-[11px]">
                    <span className="w-14 shrink-0 capitalize text-muted">{WINDOW_LABEL[k]}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-inset">
                      <div
                        className={w.exceeded ? "h-full bg-red-500" : pct >= 90 ? "h-full bg-amber-500" : "h-full bg-primary"}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => void resetUsage()}
                disabled={resetPending}
                className="mt-1 w-full rounded-lg border border-border px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:bg-surface-inset hover:text-foreground disabled:opacity-60"
              >
                {resetPending ? "Resetting…" : "Reset usage"}
              </button>
            </div>
          )}

          {showBuyMore && (
            <button
              type="button"
              onClick={() => void buyMore()}
              disabled={packPending}
              className={`mt-3 flex w-full items-center justify-between gap-1 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-60 ${
                state.month.exceeded
                  ? "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
              }`}
            >
              <span>
                {packPending
                  ? "Opening checkout…"
                  : state.month.exceeded
                    ? `Out of budget — purchase more for ${fmtPrice(state.pack.priceUsdCents)}`
                    : `Running low — purchase more for ${fmtPrice(state.pack.priceUsdCents)}`}
              </span>
              <ExternalLink className="size-3 shrink-0" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
