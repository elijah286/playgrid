"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { LiveScoreEvent } from "./live-session-types";

type Side = "us" | "them";

export function ScoreCard({
  events,
  usLabel,
  themLabel,
  isTackle,
  onAdd,
  onOverwrite,
}: {
  events: LiveScoreEvent[];
  usLabel: string;
  themLabel: string;
  /** Tackle football gets +3 (field goals). Flag variants don't. */
  isTackle: boolean;
  /** Log a delta (positive or negative) for the given side. */
  onAdd: (side: Side, delta: number) => void;
  /** Overwrite the side to an absolute score; implemented by the parent
   *  as a single compensating delta so history stays intact. */
  onOverwrite: (side: Side, target: number) => void;
}) {
  const [openSide, setOpenSide] = useState<Side | null>(null);

  const totals = useMemo(() => {
    let us = 0;
    let them = 0;
    for (const e of events) {
      if (e.side === "us") us += e.delta;
      else them += e.delta;
    }
    return { us, them };
  }, [events]);

  return (
    <>
      <div className="mx-auto w-full max-w-[640px] rounded-lg border border-border bg-surface-raised p-3 landscape:hidden">
        <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
          Score
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ScoreTile
            label={usLabel}
            value={totals.us}
            onClick={() => setOpenSide("us")}
          />
          <ScoreTile
            label={themLabel}
            value={totals.them}
            onClick={() => setOpenSide("them")}
          />
        </div>
      </div>

      {openSide && (
        <ScoreIncrementDialog
          side={openSide}
          label={openSide === "us" ? usLabel : themLabel}
          current={openSide === "us" ? totals.us : totals.them}
          isTackle={isTackle}
          onAdd={(delta) => {
            onAdd(openSide, delta);
            setOpenSide(null);
          }}
          onOverwrite={(target) => {
            onOverwrite(openSide, target);
            setOpenSide(null);
          }}
          onClose={() => setOpenSide(null)}
        />
      )}
    </>
  );
}

function ScoreTile({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg border border-border bg-surface px-2 py-3 text-foreground transition-colors hover:border-primary active:scale-[0.98]"
    >
      <span className="line-clamp-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <span
        className="font-mono text-5xl font-bold leading-none tabular-nums text-primary"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </span>
    </button>
  );
}

function ScoreIncrementDialog({
  side,
  label,
  current,
  isTackle,
  onAdd,
  onOverwrite,
  onClose,
}: {
  side: Side;
  label: string;
  current: number;
  isTackle: boolean;
  onAdd: (delta: number) => void;
  onOverwrite: (target: number) => void;
  onClose: () => void;
}) {
  const [exactOpen, setExactOpen] = useState(false);
  // +6 / +3 (tackle only) / +2 / +1, reading left-to-right for thumb reach.
  const deltas = isTackle ? [6, 3, 2, 1] : [6, 2, 1];

  if (exactOpen) {
    return (
      <ExactScoreDialog
        label={label}
        current={current}
        onCancel={() => setExactOpen(false)}
        onConfirm={(target) => onOverwrite(target)}
      />
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Increase ${label} score`}
      className="fixed inset-0 z-[75] flex items-end justify-center bg-black/60 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-4 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-foreground">
              Increase {label} score by
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Current: <span className="font-semibold text-foreground">{current}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-surface-hover"
          >
            <X className="size-4" />
          </button>
        </div>

        <div
          className={
            "mt-4 grid gap-2 " +
            (deltas.length === 4 ? "grid-cols-4" : "grid-cols-3")
          }
        >
          {deltas.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onAdd(d)}
              className="inline-flex h-16 items-center justify-center rounded-lg border border-primary bg-primary text-2xl font-bold text-primary-foreground hover:bg-primary/90"
            >
              +{d}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setExactOpen(true)}
          className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg text-xs font-semibold text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          Change score to exact value…
        </button>
      </div>
    </div>
  );
}

function ExactScoreDialog({
  label,
  current,
  onCancel,
  onConfirm,
}: {
  label: string;
  current: number;
  onCancel: () => void;
  onConfirm: (target: number) => void;
}) {
  const [entry, setEntry] = useState<string>(String(current));
  // Auto-select on open so the first keypad tap overwrites the prefill.
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setEntry(String(current));
    setTouched(false);
  }, [current]);

  function press(d: string) {
    if (d === "⌫") {
      setEntry((e) => (e.length <= 1 ? "0" : e.slice(0, -1)));
      setTouched(true);
      return;
    }
    if (d === "C") {
      setEntry("0");
      setTouched(true);
      return;
    }
    setEntry((e) => {
      if (!touched || e === "0") return d;
      if (e.length >= 3) return e;
      return e + d;
    });
    setTouched(true);
  }

  const parsed = Number(entry);
  const invalid = !Number.isFinite(parsed) || parsed < 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Set ${label} score`}
      className="fixed inset-0 z-[76] flex items-center justify-center bg-black/70 p-3"
    >
      <div className="w-full max-w-xs rounded-2xl border border-border bg-surface-raised p-4 shadow-elevated">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">
              Set {label} score
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-surface-hover"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-3 rounded-lg border border-border bg-surface py-3 text-center">
          <span className="font-mono text-5xl font-bold tabular-nums text-primary">
            {entry}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map(
            (k) => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                className="inline-flex h-12 items-center justify-center rounded-lg border border-border bg-surface text-xl font-semibold text-foreground hover:bg-surface-hover"
              >
                {k}
              </button>
            ),
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-border bg-surface text-sm font-semibold text-foreground hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={invalid}
            onClick={() => onConfirm(Math.trunc(parsed))}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-primary bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            Set
          </button>
        </div>
      </div>
    </div>
  );
}
