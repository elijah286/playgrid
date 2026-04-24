"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ThumbsUp, ThumbsDown, Play, Repeat, X } from "lucide-react";
import { PlayThumbnail } from "@/features/editor/PlayThumbnail";
import { useToast } from "@/components/ui";
import { saveGameSessionAction } from "@/app/actions/game-sessions";
import { PlayPickerDialog } from "./PlayPickerDialog";
import { ExitGameDialog } from "./ExitGameDialog";
import {
  THUMBS_DOWN_TAGS,
  THUMBS_UP_TAGS,
  type CalledPlayLogEntry,
  type GameModePlay,
  type PlayOutcome,
  type ThumbDirection,
  type ThumbsDownTag,
  type ThumbsUpTag,
} from "./types";

export function GameModeClient({
  playbookId,
  plays,
}: {
  playbookId: string;
  plays: GameModePlay[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [showIntro, setShowIntro] = useState(true);
  const [currentPlayId, setCurrentPlayId] = useState<string | null>(null);
  const [nextPlayId, setNextPlayId] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<"closed" | "current" | "next">(
    "closed",
  );
  const [exitOpen, setExitOpen] = useState(false);
  const [outcome, setOutcome] = useState<PlayOutcome>(null);
  const [log, setLog] = useState<CalledPlayLogEntry[]>([]);
  // Session start is fixed at mount and read during render (passed to the
  // exit dialog) so it lives in state, not a ref.
  const [startedAt] = useState<string>(() => new Date().toISOString());
  const playCalledAtRef = useRef<string | null>(null);
  const [saving, startSaving] = useTransition();

  const playMap = useMemo(() => {
    const m = new Map<string, GameModePlay>();
    for (const p of plays) m.set(p.id, p);
    return m;
  }, [plays]);

  const currentPlay = currentPlayId ? playMap.get(currentPlayId) ?? null : null;
  const nextPlay = nextPlayId ? playMap.get(nextPlayId) ?? null : null;

  /** Append the just-finished play to the call log with whatever outcome was
   *  selected (or null if the coach didn't tap thumbs). */
  const finalizeCurrent = useCallback(() => {
    if (!currentPlay || !playCalledAtRef.current) return;
    setLog((prev) => [
      ...prev,
      {
        playId: currentPlay.id,
        playName: currentPlay.name,
        outcome,
        calledAt: playCalledAtRef.current!,
      },
    ]);
  }, [currentPlay, outcome]);

  function dismissIntro() {
    setShowIntro(false);
    // First-time entry: open the picker to choose the opening play. Without
    // this, the screen would render an empty state and the coach would have
    // to hunt for the right button.
    if (!currentPlayId) setPickerMode("current");
  }

  function pickPlay(playId: string) {
    if (pickerMode === "current") {
      setCurrentPlayId(playId);
      playCalledAtRef.current = new Date().toISOString();
      setOutcome(null);
    } else if (pickerMode === "next") {
      setNextPlayId(playId);
    }
    setPickerMode("closed");
  }

  function runNextPlay() {
    if (!nextPlay) return;
    finalizeCurrent();
    setCurrentPlayId(nextPlay.id);
    setNextPlayId(null);
    playCalledAtRef.current = new Date().toISOString();
    setOutcome(null);
  }

  function tapThumb(direction: ThumbDirection) {
    setOutcome((prev) => {
      // Tapping the active thumb again clears the outcome — coaches can
      // change their mind without an extra "clear" button.
      if (prev?.thumb === direction) return null;
      return { thumb: direction, tag: null };
    });
  }

  function tapTag(direction: ThumbDirection, tag: ThumbsUpTag | ThumbsDownTag) {
    setOutcome((prev) => {
      if (prev?.thumb !== direction) {
        return { thumb: direction, tag } as PlayOutcome;
      }
      // Tapping the active tag again clears it (thumb stays selected).
      const sameTag = prev.tag === tag;
      return {
        thumb: direction,
        tag: sameTag ? null : (tag as ThumbsUpTag & ThumbsDownTag),
      } as PlayOutcome;
    });
  }

  function exitGame(data: {
    opponent: string | null;
    scoreUs: number | null;
    scoreThem: number | null;
    notes: string | null;
  }) {
    // Capture the current play's outcome before leaving so the final play
    // call lands in the saved session.
    const finalLog: CalledPlayLogEntry[] = [...log];
    if (currentPlay && playCalledAtRef.current) {
      finalLog.push({
        playId: currentPlay.id,
        playName: currentPlay.name,
        outcome,
        calledAt: playCalledAtRef.current,
      });
    }
    startSaving(async () => {
      const res = await saveGameSessionAction({
        playbookId,
        startedAt,
        endedAt: new Date().toISOString(),
        opponent: data.opponent,
        scoreUs: data.scoreUs,
        scoreThem: data.scoreThem,
        notes: data.notes,
        calls: finalLog.map((c) => ({
          playId: c.playId,
          calledAt: c.calledAt,
          thumb: c.outcome?.thumb ?? null,
          tag: c.outcome?.tag ?? null,
        })),
      });
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast("Game saved.", "success");
      router.push(`/playbooks/${playbookId}`);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-inset text-foreground">
      {/* Top bar — minimal: just an exit affordance and the play name. */}
      <div className="flex items-center gap-2 border-b border-border bg-surface-raised px-3 py-2">
        <button
          type="button"
          onClick={() => setExitOpen(true)}
          className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-surface-hover"
          aria-label="Exit game mode"
        >
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-semibold">
            {currentPlay?.name ?? "Pick a play"}
          </div>
          {currentPlay?.formation_name && (
            <div className="truncate text-[11px] text-muted">
              {currentPlay.formation_name}
            </div>
          )}
        </div>
        <div className="size-10" aria-hidden />
      </div>

      {/* Main play area + thumb overlays. flex-1 + min-h-0 lets the SVG
          fill all remaining vertical space without spilling past the bottom
          control bar. */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {currentPlay?.preview ? (
          <div className="absolute inset-0 flex items-center justify-center p-2">
            <PlayThumbnail preview={currentPlay.preview} />
          </div>
        ) : (
          <p className="px-6 text-center text-sm text-muted">
            Pick a play to start the game.
          </p>
        )}

        {currentPlay && (
          <>
            <ThumbButton
              direction="down"
              active={outcome?.thumb === "down"}
              onTap={() => tapThumb("down")}
            />
            <ThumbButton
              direction="up"
              active={outcome?.thumb === "up"}
              onTap={() => tapThumb("up")}
            />
            {outcome?.thumb === "up" && (
              <TagRail
                position="right"
                tags={THUMBS_UP_TAGS}
                active={outcome.tag}
                onTap={(t) => tapTag("up", t)}
              />
            )}
            {outcome?.thumb === "down" && (
              <TagRail
                position="left"
                tags={THUMBS_DOWN_TAGS}
                active={outcome.tag}
                onTap={(t) => tapTag("down", t)}
              />
            )}
          </>
        )}
      </div>

      {/* Bottom controls. Either the big "Choose next play" CTA, or the
          next-play preview with Run / Change. Always followed by Exit. */}
      <div className="border-t border-border bg-surface-raised px-3 py-2">
        {nextPlay ? (
          <div className="flex items-center gap-2">
            <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md border border-border bg-surface">
              {nextPlay.preview && (
                <PlayThumbnail preview={nextPlay.preview} thin />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="truncate text-xs font-semibold">
                Next: {nextPlay.name}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={runNextPlay}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Play className="size-4" /> Run next
                </button>
                <button
                  type="button"
                  onClick={() => setPickerMode("next")}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-sm font-semibold text-foreground hover:bg-surface-hover"
                >
                  <Repeat className="size-4" /> Change
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerMode("next")}
            disabled={!currentPlay}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:text-muted"
          >
            Choose next play
          </button>
        )}
      </div>

      {/* Intro: shown the first time per session. Coaches landing on the
          screen mid-game shouldn't have to dismiss this every time, but
          per-session is fine. */}
      {showIntro && <IntroOverlay onDismiss={dismissIntro} />}

      <PlayPickerDialog
        open={pickerMode !== "closed"}
        plays={plays}
        currentPlayId={pickerMode === "current" ? null : currentPlayId}
        onPick={pickPlay}
        onClose={() => setPickerMode("closed")}
        canClose={currentPlay != null}
      />

      <ExitGameDialog
        open={exitOpen}
        onCancel={() => setExitOpen(false)}
        onConfirm={exitGame}
        startedAt={startedAt}
        callCount={log.length + (currentPlay ? 1 : 0)}
        saving={saving}
      />
    </div>
  );
}

function ThumbButton({
  direction,
  active,
  onTap,
}: {
  direction: ThumbDirection;
  active: boolean;
  onTap: () => void;
}) {
  const Icon = direction === "up" ? ThumbsUp : ThumbsDown;
  const positionClass =
    direction === "up" ? "right-3 sm:right-6" : "left-3 sm:left-6";
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={direction === "up" ? "Thumbs up" : "Thumbs down"}
      aria-pressed={active}
      className={
        "absolute top-1/2 -translate-y-1/2 inline-flex size-14 items-center justify-center rounded-full border backdrop-blur-sm transition " +
        positionClass +
        " " +
        (active
          ? direction === "up"
            ? "border-emerald-400 bg-emerald-500/80 text-white shadow-[0_0_24px_rgba(16,185,129,0.6)]"
            : "border-rose-400 bg-rose-500/80 text-white shadow-[0_0_24px_rgba(244,63,94,0.6)]"
          : "border-border bg-surface-raised/70 text-foreground hover:bg-surface-raised")
      }
    >
      <Icon className="size-7" />
    </button>
  );
}

function TagRail<T extends string>({
  position,
  tags,
  active,
  onTap,
}: {
  position: "left" | "right";
  tags: { value: T; label: string }[];
  active: T | null;
  onTap: (value: T) => void;
}) {
  return (
    <div
      className={
        "absolute top-1/2 flex -translate-y-1/2 flex-col gap-1.5 " +
        (position === "left"
          ? "left-3 ml-0 sm:left-6"
          : "right-3 sm:right-6")
      }
      style={{
        // Stack tag pills directly below the thumb button: thumb is centered
        // vertically; bump rail down so its first pill sits below the thumb.
        marginTop: "3.75rem",
      }}
    >
      {tags.map((t) => {
        const isActive = active === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onTap(t.value)}
            aria-pressed={isActive}
            className={
              "rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur-sm " +
              (isActive
                ? position === "right"
                  ? "border-emerald-400 bg-emerald-500/80 text-white"
                  : "border-rose-400 bg-rose-500/80 text-white"
                : "border-border bg-surface-raised/70 text-foreground hover:bg-surface-raised")
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function IntroOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to game mode"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-5 shadow-elevated">
        <h2 className="text-lg font-semibold text-foreground">Game mode</h2>
        <p className="mt-2 text-sm text-muted">
          A simple in-game flow for coaches. Pick a play, give it a thumbs
          up or down after the snap, then choose the next call. Exit when
          the game ends to record the score and notes.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-foreground">
          <li>· Big buttons. No menus.</li>
          <li>· Rotate to landscape for a bigger field.</li>
          <li>· Outcomes save when you exit.</li>
        </ul>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg border border-primary bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Start
        </button>
      </div>
    </div>
  );
}
