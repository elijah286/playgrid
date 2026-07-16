"use client";

import { AlertTriangle, Check, CloudOff } from "lucide-react";

/** idle = nothing to say yet. */
export type SaveState = "idle" | "saved" | "pending" | "conflict";

/**
 * Did the server REFUSE this write because the play moved underneath us?
 *
 * Distinct from every other `ok: false` — those mean "the server said no"
 * (locked, archived, invalid). This one means "your work is fine, theirs is
 * fine, and we declined to destroy either." Mirrors isGameModeLocked's shape.
 */
export function isSaveConflict(
  res: unknown,
): res is { ok: false; error: string; conflict: { serverVersionId: string } } {
  return (
    typeof res === "object" &&
    res !== null &&
    (res as { ok?: unknown }).ok === false &&
    "conflict" in res
  );
}

/**
 * What the coach can be told, honestly, about their work.
 *
 * The play editor has never had a save indicator: `isSaving` was declared and
 * never rendered, so a coach had no way to know whether an edit landed. That was
 * survivable while every session was online — and became a data-loss trap the day
 * the editor started working offline, because a save that THREW (no signal) left
 * exactly the same silence as a save that succeeded.
 *
 * The states, because each says something a coach can act on:
 *   saved    — the server confirmed it. Fades into the background.
 *   pending  — it's safe ON THIS DEVICE but not on the server yet. Said plainly,
 *              because "will upload when you're back online" is a promise the
 *              draft store actually keeps: the edit is written to IndexedDB the
 *              moment it's made, before any network call, and is only ever
 *              cleared on a confirmed server write.
 *   conflict — this play also changed somewhere else, so we did NOT overwrite
 *              it. Their work is intact and so is this coach's (still in the
 *              draft); the two just have to be reconciled. Never resolve this
 *              silently — picking a winner behind a coach's back is how you
 *              lose a play nobody agreed to lose.
 *
 * No "saving…" flicker: a spinner on every keystroke is noise, and the
 * interesting states are the ones above.
 */
export function SaveStatePill({ state }: { state: Exclude<SaveState, "idle"> }) {
  if (state === "conflict") {
    return (
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-20 left-1/2 z-40 -translate-x-1/2 px-3 sm:bottom-6"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-600/95 px-3 py-1.5 text-xs font-semibold text-white shadow-elevated">
          <AlertTriangle className="size-3.5 shrink-0" />
          This play changed somewhere else — your copy is safe here
        </span>
      </div>
    );
  }
  if (state === "saved") {
    return (
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-20 left-1/2 z-40 -translate-x-1/2 sm:bottom-6"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-raised/90 px-3 py-1.5 text-xs font-medium text-muted shadow-card ring-1 ring-border backdrop-blur-sm">
          <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          Saved
        </span>
      </div>
    );
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-20 left-1/2 z-40 -translate-x-1/2 px-3 sm:bottom-6"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/95 px-3 py-1.5 text-xs font-semibold text-white shadow-elevated">
        <CloudOff className="size-3.5 shrink-0" />
        Saved on this device — will upload when you&rsquo;re back online
      </span>
    </div>
  );
}
