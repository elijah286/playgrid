"use client";

import { useState } from "react";

export function ExitGameDialog({
  open,
  onCancel,
  onConfirm,
  startedAt,
  callCount,
  saving,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (data: {
    opponent: string | null;
    scoreUs: number | null;
    scoreThem: number | null;
    notes: string | null;
  }) => void;
  startedAt: string;
  callCount: number;
  saving: boolean;
}) {
  const [opponent, setOpponent] = useState("");
  const [scoreUs, setScoreUs] = useState("");
  const [scoreThem, setScoreThem] = useState("");
  const [notes, setNotes] = useState("");

  if (!open) return null;

  function parseScore(s: string): number | null {
    const trimmed = s.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  }

  function submit() {
    onConfirm({
      opponent: opponent.trim() || null,
      scoreUs: parseScore(scoreUs),
      scoreThem: parseScore(scoreThem),
      notes: notes.trim() || null,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Exit game mode"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-3 sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-4 shadow-elevated">
        <h2 className="text-lg font-semibold text-foreground">Game summary</h2>
        <p className="mt-1 text-xs text-muted">
          Started {new Date(startedAt).toLocaleString()} · {callCount} play
          {callCount === 1 ? "" : "s"} called.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">
              Opponent
            </label>
            <input
              type="text"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="e.g. Wildcats"
              className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">
                Us
              </label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={scoreUs}
                onChange={(e) => setScoreUs(e.target.value)}
                placeholder="0"
                className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">
                Them
              </label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={scoreThem}
                onChange={(e) => setScoreThem(e.target.value)}
                placeholder="0"
                className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything to remember from the game"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-border bg-surface text-sm font-semibold text-foreground hover:bg-surface-hover disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-primary bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save & exit"}
          </button>
        </div>
      </div>
    </div>
  );
}
