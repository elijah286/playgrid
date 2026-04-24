"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { LiveScoreEvent } from "./live-session-types";

type Side = "us" | "them";

function hexLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const toLin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

/** Pick a legible on-accent text color (white or near-black) for a given
 *  background hex. Matches the rule used by the playbook header. */
function onAccentText(hex: string): string {
  return hexLuminance(hex) > 0.55 ? "#0f172a" : "#ffffff";
}

export function ScoreCard({
  events,
  usLabel,
  themLabel,
  isTackle,
  onAdd,
  onOverwrite,
  accentColor,
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
  /** Playbook brand color — used for the "us" tile. The opponent tile
   *  takes a contrasting neutral so the two sides read distinctly. */
  accentColor: string;
}) {
  const [openSide, setOpenSide] = useState<Side | null>(null);

  const totals = useMemo(() => {
    let us = 0;
    let them = 0;
    for (const e of events) {
      const d = Number.isFinite(e.delta) ? e.delta : 0;
      if (e.side === "us") us += d;
      else them += d;
    }
    return { us, them };
  }, [events]);

  const usFg = onAccentText(accentColor);
  // Opponent tile: dark slate if the accent is light, else a bright
  // off-white — always the opposite luminance family from "us" so they
  // read as two separate teams at a glance.
  const themBg = hexLuminance(accentColor) > 0.55 ? "#1f2937" : "#e5e7eb";
  const themFg = onAccentText(themBg);

  return (
    <>
      <div className="mx-auto grid w-full max-w-[640px] grid-cols-2 gap-2 rounded-lg border border-border bg-surface-raised p-2 landscape:hidden">
        <ScoreTile
          label={usLabel}
          value={totals.us}
          onClick={() => setOpenSide("us")}
          bg={accentColor}
          fg={usFg}
        />
        <ScoreTile
          label={themLabel}
          value={totals.them}
          onClick={() => setOpenSide("them")}
          bg={themBg}
          fg={themFg}
        />
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
  bg,
  fg,
}: {
  label: string;
  value: number;
  onClick: () => void;
  bg: string;
  fg: string;
}) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ backgroundColor: bg, color: fg, borderColor: bg }}
      className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 transition-transform active:scale-[0.98]"
    >
      <span
        className="line-clamp-1 min-w-0 text-[10px] font-semibold uppercase tracking-wide opacity-80"
        style={{ color: fg }}
      >
        {label}
      </span>
      <span
        className="font-mono text-3xl font-bold leading-none tabular-nums"
        style={{ fontVariantNumeric: "tabular-nums", color: fg }}
      >
        {safeValue}
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
  const invalid =
    !Number.isFinite(parsed) || parsed < 0 || !/^\d+$/.test(entry);

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
            onClick={() => {
              if (invalid) return;
              onConfirm(Math.trunc(parsed));
            }}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-primary bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            Set
          </button>
        </div>
      </div>
    </div>
  );
}
