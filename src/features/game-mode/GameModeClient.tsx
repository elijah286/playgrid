"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ThumbsUp, ThumbsDown, Play, Repeat, X, Maximize, Minimize } from "lucide-react";
import { PlayThumbnail } from "@/features/editor/PlayThumbnail";
import { useToast } from "@/components/ui";
import { saveGameSessionAction } from "@/app/actions/game-sessions";
import { usePlayAnimation } from "@/features/animation/usePlayAnimation";
import { PlayPickerDialog } from "./PlayPickerDialog";
import { ExitGameDialog } from "./ExitGameDialog";
import { GameFieldView } from "./GameFieldView";
import type { PlayDocument } from "@/domain/play/types";
import type { PlayThumbnailInput } from "@/features/editor/PlayThumbnail";
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
  initialPlayId = null,
}: {
  playbookId: string;
  plays: GameModePlay[];
  initialPlayId?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [showIntro, setShowIntro] = useState(true);
  const [currentPlayId, setCurrentPlayId] = useState<string | null>(
    initialPlayId,
  );
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
  const playCalledAtRef = useRef<string | null>(
    initialPlayId ? new Date().toISOString() : null,
  );
  const [saving, startSaving] = useTransition();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    type FsDoc = Document & {
      webkitFullscreenElement?: Element | null;
    };
    const doc = document as FsDoc;
    function onChange() {
      const el = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      setIsFullscreen(Boolean(el));
    }
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  async function toggleFullscreen() {
    type FsDoc = Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    type FsEl = HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const doc = document as FsDoc;
    const el = rootRef.current as FsEl | null;
    const active = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
    try {
      if (active) {
        await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      } else if (el) {
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      }
    } catch {
      // User-gesture requirements or platform restrictions — silent.
    }
  }

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
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex flex-col bg-surface-inset text-foreground"
    >
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
        <div className="min-w-0 flex-1 text-center landscape:hidden">
          <div className="truncate text-sm font-semibold">
            {currentPlay?.name ?? "Pick a play"}
          </div>
          {currentPlay?.formation_name && (
            <div className="truncate text-[11px] text-muted">
              {currentPlay.formation_name}
            </div>
          )}
        </div>
        <div className="hidden flex-1 landscape:block" aria-hidden />
        <button
          type="button"
          onClick={toggleFullscreen}
          className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-surface-hover"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
        </button>
      </div>

      {/* Scrollable column: field on top (natural aspect, never stretched),
          next-play row beneath. The next-play row is always rendered so the
          field's position doesn't shift when a next play is enqueued. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 landscape:items-center landscape:justify-center landscape:overflow-hidden landscape:p-0">
        {currentPlay ? (
          /* Keyed on play id so React remounts the section (and the
             animation hook inside) when the coach runs the next play —
             otherwise phase state would leak from the previous call. */
          <CurrentPlaySection
            key={currentPlay.id}
            document={currentPlay.document}
            preview={currentPlay.preview}
            outcome={outcome}
            onTapThumb={tapThumb}
            onTapTag={tapTag}
          />
        ) : (
          <p className="px-6 py-12 text-center text-sm text-muted">
            Pick a play to start the game.
          </p>
        )}

        {/* Next-play row below the field. Always present (CTA when empty)
            so the field above never shifts. Hidden in landscape — coaches
            use landscape for viewing only. */}
        <div className="mx-auto w-full max-w-[640px] landscape:hidden">
          {nextPlay ? (
            <div className="flex items-stretch gap-3 rounded-lg border border-border bg-surface-raised p-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="truncate text-xs font-semibold">
                  Next: {nextPlay.name}
                </div>
                <div className="w-full max-w-[220px]">
                  {nextPlay.preview && (
                    <PlayThumbnail preview={nextPlay.preview} thin />
                  )}
                </div>
              </div>
              <div className="flex w-36 shrink-0 flex-col gap-2 sm:w-40">
                <button
                  type="button"
                  onClick={runNextPlay}
                  className="inline-flex h-14 w-full items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Play className="size-5" /> Run
                </button>
                <button
                  type="button"
                  onClick={() => setPickerMode("next")}
                  className="inline-flex h-14 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-base font-semibold text-foreground hover:bg-surface-hover"
                >
                  <Repeat className="size-5" /> Change
                </button>
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
        onDiscard={() => router.push(`/playbooks/${playbookId}`)}
        startedAt={startedAt}
        callCount={log.length + (currentPlay ? 1 : 0)}
        saving={saving}
      />
    </div>
  );
}

function CurrentPlaySection({
  document,
  preview,
  outcome,
  onTapThumb,
  onTapTag,
}: {
  document: PlayDocument | null;
  preview: PlayThumbnailInput | null;
  outcome: PlayOutcome;
  onTapThumb: (dir: ThumbDirection) => void;
  onTapTag: (dir: ThumbDirection, tag: ThumbsUpTag | ThumbsDownTag) => void;
}) {
  if (!document) {
    return (
      <div className="relative mx-auto w-full">
        <GameFieldView document={null} fallbackPreview={preview} anim={null} />
        <ThumbButton
          direction="down"
          active={outcome?.thumb === "down"}
          onTap={() => onTapThumb("down")}
        />
        <ThumbButton
          direction="up"
          active={outcome?.thumb === "up"}
          onTap={() => onTapThumb("up")}
        />
        {outcome?.thumb === "up" && (
          <TagRail
            position="right"
            tags={THUMBS_UP_TAGS}
            active={outcome.tag}
            onTap={(t) => onTapTag("up", t)}
          />
        )}
        {outcome?.thumb === "down" && (
          <TagRail
            position="left"
            tags={THUMBS_DOWN_TAGS}
            active={outcome.tag}
            onTap={(t) => onTapTag("down", t)}
          />
        )}
      </div>
    );
  }
  return (
    <CurrentPlaySectionAnimated
      document={document}
      preview={preview}
      outcome={outcome}
      onTapThumb={onTapThumb}
      onTapTag={onTapTag}
    />
  );
}

function CurrentPlaySectionAnimated({
  document,
  preview,
  outcome,
  onTapThumb,
  onTapTag,
}: {
  document: PlayDocument;
  preview: PlayThumbnailInput | null;
  outcome: PlayOutcome;
  onTapThumb: (dir: ThumbDirection) => void;
  onTapTag: (dir: ThumbDirection, tag: ThumbsUpTag | ThumbsDownTag) => void;
}) {
  const anim = usePlayAnimation(document);
  return (
    <div className="relative mx-auto flex w-full flex-col items-center justify-center landscape:h-full landscape:flex-1">
      <GameFieldView document={document} fallbackPreview={preview} anim={anim} />
      <ThumbButton
        direction="down"
        active={outcome?.thumb === "down"}
        onTap={() => onTapThumb("down")}
      />
      <ThumbButton
        direction="up"
        active={outcome?.thumb === "up"}
        onTap={() => onTapThumb("up")}
      />
      {outcome?.thumb === "up" && (
        <TagRail
          position="right"
          tags={THUMBS_UP_TAGS}
          active={outcome.tag}
          onTap={(t) => onTapTag("up", t)}
        />
      )}
      {outcome?.thumb === "down" && (
        <TagRail
          position="left"
          tags={THUMBS_DOWN_TAGS}
          active={outcome.tag}
          onTap={(t) => onTapTag("down", t)}
        />
      )}
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
