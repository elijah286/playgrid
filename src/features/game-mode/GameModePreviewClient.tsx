"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ThumbsUp,
  ThumbsDown,
  Play,
  Repeat,
  X,
  Maximize,
  Minimize,
  StickyNote,
  ChevronDown,
} from "lucide-react";
import { PlayThumbnail } from "@/features/editor/PlayThumbnail";
import { usePlayAnimation } from "@/features/animation/usePlayAnimation";
import { PlayPickerDialog } from "./PlayPickerDialog";
import { PlayNumberBadge } from "./PlayNumberBadge";
import { GameFieldView } from "./GameFieldView";
import { ScoreCard } from "./ScoreCard";
import type { PlayDocument } from "@/domain/play/types";
import type { PlayThumbnailInput } from "@/features/editor/PlayThumbnail";
import {
  THUMBS_DOWN_TAGS,
  THUMBS_UP_TAGS,
  type GameModePlay,
  type PlayOutcome,
  type ThumbDirection,
  type ThumbsDownTag,
  type ThumbsUpTag,
} from "./types";
import type { LiveScoreEvent } from "./live-session-types";

type Props = {
  playbookId: string;
  plays: GameModePlay[];
  playbookName: string;
  sportVariant: string;
  accentColor: string;
};

type Call = {
  id: string;
  playId: string;
  position: number;
  calledAt: string;
  thumb: "up" | "down" | null;
  tag: string | null;
};

/**
 * Ephemeral Game Mode for example-playbook visitors. Mirrors the real
 * GameModeClient UX but holds everything in local state — no server
 * actions, no realtime, no persistence. Every page load starts a fresh
 * session; closing the tab discards it. There is no caller/spectator
 * concept since preview is single-user by construction.
 */
export function GameModePreviewClient({
  playbookId,
  plays,
  playbookName,
  sportVariant,
  accentColor,
}: Props) {
  const router = useRouter();
  const isTackle = sportVariant === "tackle_11";

  const [currentPlayId, setCurrentPlayId] = useState<string | null>(null);
  const [nextPlayId, setNextPlayId] = useState<string | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [scoreEvents, setScoreEvents] = useState<LiveScoreEvent[]>([]);
  // Open the picker on mount so visitors land in the call sheet
  // immediately — no intro overlay to click past.
  const [pickerMode, setPickerMode] = useState<"closed" | "current" | "next">(
    plays.length > 0 ? "current" : "closed",
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    type FsDoc = Document & { webkitFullscreenElement?: Element | null };
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
      /* silent */
    }
  }

  const playMap = useMemo(() => {
    const m = new Map<string, GameModePlay>();
    for (const p of plays) m.set(p.id, p);
    return m;
  }, [plays]);

  const playNumberById = useMemo(() => {
    const byType = new Map<string, GameModePlay[]>();
    for (const p of plays) {
      const arr = byType.get(p.play_type);
      if (arr) arr.push(p);
      else byType.set(p.play_type, [p]);
    }
    const m = new Map<string, string>();
    for (const arr of byType.values()) {
      arr.sort((a, b) => a.sort_order - b.sort_order);
      arr.forEach((p, i) => {
        const code = (p.wristband_code ?? "").trim();
        m.set(p.id, code || String(i + 1).padStart(2, "0"));
      });
    }
    return m;
  }, [plays]);

  const currentPlay = currentPlayId ? playMap.get(currentPlayId) ?? null : null;
  const nextPlay = nextPlayId ? playMap.get(nextPlayId) ?? null : null;

  const currentCall = calls.length > 0 ? calls[calls.length - 1] : null;
  const currentOutcome: PlayOutcome =
    currentCall && currentPlayId === currentCall.playId
      ? toOutcome(currentCall)
      : null;

  function pickPlay(playId: string) {
    const mode = pickerMode;
    setPickerMode("closed");
    if (mode === "closed") return;
    if (mode === "current") {
      setCurrentPlayId(playId);
      // First pick creates the first call row so scoring taps attach to it.
      if (calls.length === 0) {
        setCalls([
          {
            id: localId(),
            playId,
            position: 0,
            calledAt: new Date().toISOString(),
            thumb: null,
            tag: null,
          },
        ]);
      }
    } else {
      setNextPlayId(playId);
    }
  }

  function runNextPlay() {
    if (!nextPlayId) return;
    const maxPos = calls.reduce((m, c) => Math.max(m, c.position), -1);
    setCalls((prev) => [
      ...prev,
      {
        id: localId(),
        playId: nextPlayId,
        position: maxPos + 1,
        calledAt: new Date().toISOString(),
        thumb: null,
        tag: null,
      },
    ]);
    setCurrentPlayId(nextPlayId);
    setNextPlayId(null);
  }

  function applyScore(next: { thumb: "up" | "down" | null; tag: string | null }) {
    if (!currentPlayId) return;
    setCalls((prev) => {
      const lastIdx = prev.length - 1;
      const last = lastIdx >= 0 ? prev[lastIdx] : null;
      if (last && last.playId === currentPlayId) {
        const copy = prev.slice();
        copy[lastIdx] = { ...last, thumb: next.thumb, tag: next.tag };
        return copy;
      }
      const maxPos = prev.reduce((m, c) => Math.max(m, c.position), -1);
      return [
        ...prev,
        {
          id: localId(),
          playId: currentPlayId,
          position: maxPos + 1,
          calledAt: new Date().toISOString(),
          thumb: next.thumb,
          tag: next.tag,
        },
      ];
    });
  }

  function tapThumb(direction: ThumbDirection) {
    const next: { thumb: "up" | "down" | null; tag: string | null } =
      currentOutcome?.thumb === direction
        ? { thumb: null, tag: null }
        : { thumb: direction, tag: null };
    applyScore(next);
  }

  function tapTag(direction: ThumbDirection, tag: ThumbsUpTag | ThumbsDownTag) {
    const next: { thumb: "up" | "down" | null; tag: string | null } = (() => {
      if (currentOutcome?.thumb !== direction) return { thumb: direction, tag };
      if (currentOutcome.tag === tag) return { thumb: direction, tag: null };
      return { thumb: direction, tag };
    })();
    applyScore(next);
  }

  function addScore(side: "us" | "them", delta: number) {
    if (!Number.isFinite(delta) || delta === 0) return;
    setScoreEvents((prev) => [
      ...prev,
      {
        id: localId(),
        side,
        delta: Math.trunc(delta),
        playId: currentCall?.playId ?? null,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function overwriteScore(side: "us" | "them", target: number) {
    if (!Number.isFinite(target) || target < 0) return;
    const current = scoreEvents
      .filter((e) => e.side === side)
      .reduce((sum, e) => sum + (Number.isFinite(e.delta) ? e.delta : 0), 0);
    const delta = Math.trunc(target) - current;
    if (delta === 0) return;
    addScore(side, delta);
  }

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex flex-col bg-surface-inset text-foreground"
    >
      <div className="flex items-center gap-2 border-b border-border bg-surface-raised px-2 py-1">
        <button
          type="button"
          onClick={() => router.push(`/playbooks/${playbookId}`)}
          className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-surface text-foreground hover:bg-surface-hover"
          aria-label="Exit game mode"
        >
          <X className="size-4" />
        </button>
        <div className="min-w-0 flex-1 text-center leading-tight landscape:hidden">
          <div className="truncate text-xs font-semibold">
            {currentPlay?.name ?? "Pick a play"}
          </div>
          {currentPlay?.formation_name && (
            <div className="truncate text-[10px] text-muted">
              {currentPlay.formation_name}
            </div>
          )}
        </div>
        <div className="hidden flex-1 landscape:block" aria-hidden />
        <button
          type="button"
          onClick={toggleFullscreen}
          className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-surface text-foreground hover:bg-surface-hover"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? (
            <Minimize className="size-4" />
          ) : (
            <Maximize className="size-4" />
          )}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 landscape:items-center landscape:justify-center landscape:overflow-hidden landscape:p-0">
        {currentPlay ? (
          <CurrentPlaySection
            key={currentPlay.id}
            document={currentPlay.document}
            preview={currentPlay.preview}
            outcome={currentOutcome}
            onTapThumb={tapThumb}
            onTapTag={tapTag}
            playNumber={playNumberById.get(currentPlay.id) ?? null}
          />
        ) : (
          <p className="px-6 py-12 text-center text-sm text-muted">
            Pick a play to start the game.
          </p>
        )}

        {currentPlay && pickerMode !== "next" && (
          <div className="mx-auto w-full max-w-[640px] landscape:hidden">
            <NotesCard notes={currentPlay.document?.metadata?.notes ?? ""} />
          </div>
        )}

        {pickerMode === "next" ? (
          <div className="mx-auto flex min-h-0 w-full max-w-[640px] flex-1 flex-col landscape:hidden">
            <PlayPickerDialog
              inline
              open
              plays={plays}
              currentPlayId={currentPlayId}
              onPick={pickPlay}
              onClose={() => setPickerMode("closed")}
              canClose
              playNumberById={playNumberById}
            />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[640px] landscape:hidden">
            {nextPlay ? (
              <div className="rounded-lg border border-border bg-surface-raised px-3 py-2">
                <div className="truncate text-[11px] font-semibold text-muted">
                  Next: <span className="text-foreground">{nextPlay.name}</span>
                </div>
                <div className="mt-1 flex items-start gap-3">
                  <div className="relative w-full max-w-[200px] flex-1">
                    {nextPlay.preview && (
                      <PlayThumbnail preview={nextPlay.preview} thin />
                    )}
                    {playNumberById.get(nextPlay.id) && (
                      <PlayNumberBadge
                        value={playNumberById.get(nextPlay.id)!}
                      />
                    )}
                  </div>
                  <div className="flex w-44 shrink-0 flex-col gap-1.5 sm:w-48">
                    <button
                      type="button"
                      onClick={runNextPlay}
                      className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      <Play className="size-4" /> Run
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerMode("next")}
                      className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-sm font-semibold text-foreground hover:bg-surface-hover"
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
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:text-muted"
              >
                Choose next play
              </button>
            )}
          </div>
        )}

        {pickerMode !== "next" && (
          <ScoreCard
            events={scoreEvents}
            usLabel={playbookName}
            themLabel="Opponent"
            isTackle={isTackle}
            onAdd={addScore}
            onOverwrite={overwriteScore}
            accentColor={accentColor}
          />
        )}
      </div>

      <PlayPickerDialog
        open={pickerMode === "current"}
        plays={plays}
        currentPlayId={null}
        onPick={pickPlay}
        onClose={() => setPickerMode("closed")}
        canClose={currentPlay != null}
        playNumberById={playNumberById}
      />
    </div>
  );
}

function toOutcome(call: Call): PlayOutcome {
  if (call.thumb === "up") {
    const tag = (["yards", "first_down", "score"] as const).find(
      (t) => t === call.tag,
    );
    return { thumb: "up", tag: (tag as ThumbsUpTag | undefined) ?? null };
  }
  if (call.thumb === "down") {
    const tag = (["loss", "flag", "incomplete", "fumble"] as const).find(
      (t) => t === call.tag,
    );
    return { thumb: "down", tag: (tag as ThumbsDownTag | undefined) ?? null };
  }
  return null;
}

function localId() {
  return `preview:${Date.now().toString(36)}:${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function NotesCard({ notes }: { notes: string }) {
  const trimmed = notes.trim();
  const [expanded, setExpanded] = useState(false);
  if (!trimmed) {
    return (
      <div
        aria-disabled="true"
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted"
      >
        <StickyNote className="size-4 shrink-0" aria-hidden />
        <span>No notes for this play</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      className="flex w-full flex-col gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-left hover:bg-surface-hover"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <StickyNote className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">Coach notes</span>
        <ChevronDown
          className={
            "size-4 shrink-0 transition-transform " +
            (expanded ? "rotate-180" : "")
          }
          aria-hidden
        />
      </div>
      <div
        className={
          "whitespace-pre-wrap text-sm text-foreground " +
          (expanded ? "" : "line-clamp-1 text-muted")
        }
      >
        {trimmed}
      </div>
    </button>
  );
}

function CurrentPlaySection({
  document,
  preview,
  outcome,
  onTapThumb,
  onTapTag,
  playNumber,
}: {
  document: PlayDocument | null;
  preview: PlayThumbnailInput | null;
  outcome: PlayOutcome;
  onTapThumb: (dir: ThumbDirection) => void;
  onTapTag: (dir: ThumbDirection, tag: ThumbsUpTag | ThumbsDownTag) => void;
  playNumber: string | null;
}) {
  if (!document) {
    return (
      <div className="relative mx-auto w-full">
        <GameFieldView document={null} fallbackPreview={preview} anim={null} />
        {playNumber && <PlayNumberBadge value={playNumber} size="md" />}
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
      playNumber={playNumber}
    />
  );
}

function CurrentPlaySectionAnimated({
  document,
  preview,
  outcome,
  onTapThumb,
  onTapTag,
  playNumber,
}: {
  document: PlayDocument;
  preview: PlayThumbnailInput | null;
  outcome: PlayOutcome;
  onTapThumb: (dir: ThumbDirection) => void;
  onTapTag: (dir: ThumbDirection, tag: ThumbsUpTag | ThumbsDownTag) => void;
  playNumber: string | null;
}) {
  const anim = usePlayAnimation(document);
  // Preview is driven by a marketing capture script — no human is here to
  // tap the field. Auto-step through idle → motion → play → done so the
  // Xs and Os move on their own.
  useEffect(() => {
    if (anim.phase === "idle") {
      const t = setTimeout(() => anim.step(), 700);
      return () => clearTimeout(t);
    }
    if (anim.phase === "motion-done") {
      const t = setTimeout(() => anim.step(), 350);
      return () => clearTimeout(t);
    }
  }, [anim.phase, anim.step]);
  return (
    <div className="relative mx-auto flex w-full flex-col items-center justify-center landscape:h-full landscape:flex-1">
      <GameFieldView document={document} fallbackPreview={preview} anim={anim} />
      {playNumber && <PlayNumberBadge value={playNumber} size="md" />}
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
      onPointerDown={(e) => {
        e.preventDefault();
        onTap();
      }}
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
          : "border-border bg-surface-raised/70 text-foreground")
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
        (position === "left" ? "left-3 ml-0 sm:left-6" : "right-3 sm:right-6")
      }
      style={{ marginTop: "3.75rem" }}
    >
      {tags.map((t) => {
        const isActive = active === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              onTap(t.value);
            }}
            aria-pressed={isActive}
            className={
              "rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur-sm " +
              (isActive
                ? position === "right"
                  ? "border-emerald-400 bg-emerald-500/80 text-white"
                  : "border-rose-400 bg-rose-500/80 text-white"
                : "border-border bg-surface-raised/70 text-foreground")
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
