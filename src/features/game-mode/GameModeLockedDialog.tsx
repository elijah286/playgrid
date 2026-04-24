"use client";

import Link from "next/link";
import { Radio, X } from "lucide-react";

/**
 * Shown when a play/playbook mutation is rejected because a live game
 * session is running on the playbook. Invites the coach to join game mode
 * so they can help score, rather than leaving them confused about why
 * edits aren't saving.
 */
export function GameModeLockedDialog({
  open,
  playbookId,
  callerName,
  onClose,
}: {
  open: boolean;
  playbookId: string;
  callerName: string | null;
  onClose: () => void;
}) {
  if (!open) return null;
  const who = callerName ?? "Another coach";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game mode is running"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-5 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-brand-green text-white">
            <Radio className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-foreground">
              Game Mode is running
            </h2>
            <p className="mt-1 text-sm text-muted">
              {who} is calling plays on this playbook right now, so editing
              is paused until the game ends. Jump in to help score the
              calls — every tap lands on everyone's screen.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-surface-hover"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <Link
            href={`/playbooks/${playbookId}/game`}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-primary bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Join and help score
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium text-muted hover:bg-surface-inset hover:text-foreground"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

/** Narrow-check for an action result whose `code` marks it as game-mode
 *  locked. Plumbed via the server helper; the shape matches
 *  `GameModeLockedResult` from src/lib/game-mode/assert-no-active-session.ts. */
export type MaybeGameModeLocked =
  | { ok: true }
  | { ok: false; error: string }
  | {
      ok: false;
      error: string;
      code: "GAME_MODE_LOCKED";
      gameLock: {
        sessionId: string;
        playbookId: string;
        callerName: string | null;
        callerUserId: string | null;
        startedAt: string;
      };
    };

export function isGameModeLocked(
  res: MaybeGameModeLocked,
): res is Extract<MaybeGameModeLocked, { code: "GAME_MODE_LOCKED" }> {
  return res.ok === false && "code" in res && res.code === "GAME_MODE_LOCKED";
}
