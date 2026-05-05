"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { getCoachAiUsageAction } from "@/app/actions/coach-ai-usage";
import type { CoachAiUsageInfo } from "@/features/coach-ai/types";

/** How many ms between background refreshes. */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 min

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function RingProgress({ pct, danger }: { pct: number; danger: boolean }) {
  const r = 7;
  const circ = 2 * Math.PI * r;
  const filled = circ * Math.min(1, pct);
  const track = danger ? "stroke-red-200 dark:stroke-red-900/50" : "stroke-primary/15";
  const fill  = danger ? "stroke-red-500" : pct > 0.75 ? "stroke-amber-500" : "stroke-primary";

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

export function CoachAiUsageMeter({ refreshTick }: { refreshTick: number }) {
  const [info, setInfo] = useState<CoachAiUsageInfo | null>(null);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef  = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await getCoachAiUsageAction();
      setInfo(data);
    } catch {
      /* non-critical — fail silently */
    }
  }, []);

  // Load on mount + on each message send (refreshTick increments)
  useEffect(() => { void load(); }, [load, refreshTick]);

  // Background refresh
  useEffect(() => {
    const id = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current  && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!info) return null;

  const pct = info.count / info.limit;
  const danger = pct >= 1;
  const warn   = pct >= 0.8;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Coach Cal: ${info.count} / ${info.limit} messages this month`}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:bg-surface-inset hover:text-foreground"
      >
        <RingProgress pct={pct} danger={danger} />
        <span className={danger ? "text-red-500 font-medium" : warn ? "text-amber-500 font-medium" : ""}>
          {info.count}<span className="text-muted/60">/{info.limit}</span>
        </span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute bottom-full right-0 z-50 mb-2 w-64 rounded-xl border border-border bg-surface-raised p-4 shadow-lg"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">Coach Cal usage</p>
              <p className="mt-0.5 text-[11px] text-muted">This calendar month</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Ring + count */}
          <div className="mt-3 flex items-center gap-3">
            <svg width={48} height={48} viewBox="0 0 48 48" className="shrink-0">
              {/* Background track */}
              <circle cx={24} cy={24} r={18} fill="none" strokeWidth={5}
                className={danger ? "stroke-red-200 dark:stroke-red-900/50" : "stroke-primary/10"} />
              {/* Fill arc */}
              <circle
                cx={24} cy={24} r={18} fill="none" strokeWidth={5}
                strokeDasharray={`${2 * Math.PI * 18 * Math.min(1, pct)} ${2 * Math.PI * 18 * (1 - Math.min(1, pct))}`}
                strokeDashoffset={2 * Math.PI * 18 * 0.25}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 0.5s ease" }}
                className={danger ? "stroke-red-500" : pct > 0.75 ? "stroke-amber-500" : "stroke-primary"}
              />
              <text x={24} y={24} textAnchor="middle" dominantBaseline="central"
                fontSize={11} fontWeight={700}
                className="fill-foreground" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
                {Math.round(pct * 100)}%
              </text>
            </svg>
            <div>
              <p className="text-2xl font-bold tabular-nums text-foreground">{info.count}</p>
              <p className="text-[11px] text-muted">of {info.limit} messages used</p>
              <p className="mt-0.5 text-[11px] text-muted">
                Resets {formatDate(info.resetDate)}
              </p>
            </div>
          </div>

          {/* Billing period */}
          {info.periodEnd && (
            <p className="mt-3 text-[11px] text-muted">
              Your subscription renews {formatDate(info.periodEnd)}.
            </p>
          )}

          {/* CTA when at/near limit */}
          {warn && (
            <a
              href="/pricing"
              className={`mt-3 flex items-center justify-between gap-1 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors ${
                danger
                  ? "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
              }`}
            >
              <span>{danger ? "You've reached your limit" : "Running low — upgrade anytime"}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          )}

          {!warn && (
            <p className="mt-3 text-[11px] text-muted/70">
              {info.limit - info.count} messages remaining this month.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
