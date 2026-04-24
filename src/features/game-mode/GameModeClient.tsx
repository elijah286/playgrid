"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  Radio,
} from "lucide-react";
import { PlayThumbnail } from "@/features/editor/PlayThumbnail";
import { useToast } from "@/components/ui";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import {
  startOrJoinGameSessionAction,
  heartbeatGameSessionAction,
  takeoverCallerAction,
  setInitialPlayAction,
  setNextPlayAction,
  advanceToNextPlayAction,
  scoreCurrentCallAction,
  endGameSessionAction,
  discardGameSessionAction,
  leaveGameSessionAction,
  logScoreEventAction,
} from "@/app/actions/game-sessions";
import { usePlayAnimation } from "@/features/animation/usePlayAnimation";
import { PlayPickerDialog } from "./PlayPickerDialog";
import { ExitGameDialog } from "./ExitGameDialog";
import { KindToggle } from "./KindToggle";
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
import {
  callToOutcome,
  type GameKind,
  type LiveGameCall,
  type LiveGameSession,
  type LiveParticipant,
  type LiveScoreEvent,
} from "./live-session-types";

const HEARTBEAT_MS = 20_000;

type Props = {
  playbookId: string;
  plays: GameModePlay[];
  initialPlayId?: string | null;
  currentUserId: string;
  currentUserName: string | null;
  initialSession: LiveGameSession | null;
  initialCalls: LiveGameCall[];
  initialParticipants: LiveParticipant[];
  initialScoreEvents: LiveScoreEvent[];
  playbookName: string;
  sportVariant: string;
};

export function GameModeClient({
  playbookId,
  plays,
  initialPlayId = null,
  currentUserId,
  currentUserName,
  initialSession,
  initialCalls,
  initialParticipants,
  initialScoreEvents,
  playbookName,
  sportVariant,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();

  // If we arrived to an already-active session, skip intro and go straight
  // to shared state. Otherwise show the intro; dismissing it starts/joins
  // the session on the server.
  const [showIntro, setShowIntro] = useState(() => initialSession == null);
  const [session, setSession] = useState<LiveGameSession | null>(initialSession);
  const [calls, setCalls] = useState<LiveGameCall[]>(initialCalls);
  const [participants, setParticipants] =
    useState<LiveParticipant[]>(initialParticipants);
  const [scoreEvents, setScoreEvents] =
    useState<LiveScoreEvent[]>(initialScoreEvents);
  const isTackle = sportVariant === "tackle_11";

  const [pickerMode, setPickerMode] = useState<"closed" | "current" | "next">(
    "closed",
  );
  const [exitOpen, setExitOpen] = useState(false);
  const [saving, startSaving] = useTransition();
  const [, startMutating] = useTransition();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isCaller =
    session != null && session.callerUserId === currentUserId;
  const callerParticipant = session?.callerUserId
    ? participants.find((p) => p.userId === session.callerUserId)
    : undefined;
  const callerName = callerParticipant?.displayName ?? "Another coach";

  // --- Fullscreen (unchanged from pre-refactor) -----------------------------
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

  const currentPlayId = session?.currentPlayId ?? null;
  const nextPlayId = session?.nextPlayId ?? null;
  const currentPlay = currentPlayId ? playMap.get(currentPlayId) ?? null : null;
  const nextPlay = nextPlayId ? playMap.get(nextPlayId) ?? null : null;

  const currentCall = calls.length > 0 ? calls[calls.length - 1] : null;
  const currentOutcome: PlayOutcome =
    currentCall && currentPlayId === currentCall.playId
      ? callToOutcome(currentCall)
      : null;

  // --- Session bootstrap ---------------------------------------------------
  // The first coach in opens this page with no initialSession; the intro
  // overlay doubles as the start form (kind + optional opponent) and
  // triggers the server-side start/join on submit. Waiting for that form
  // means closing the tab without starting leaves no stale session behind.
  const bootstrappedRef = useRef(false);
  const startSession = useCallback(
    async (opts: { kind: GameKind; opponent: string | null }) => {
      if (session || bootstrappedRef.current) return;
      bootstrappedRef.current = true;
      const res = await startOrJoinGameSessionAction(playbookId, opts);
      if (!res.ok) {
        bootstrappedRef.current = false;
        toast(res.error, "error");
        return;
      }
      setSession({
        id: res.sessionId,
        playbookId,
        status: "active",
        callerUserId: currentUserId,
        currentPlayId: null,
        nextPlayId: null,
        startedAt: new Date().toISOString(),
        kind: opts.kind,
        opponent: opts.opponent,
      });
      setParticipants((prev) =>
        prev.some((p) => p.userId === currentUserId)
          ? prev
          : [
              ...prev,
              {
                userId: currentUserId,
                displayName: currentUserName,
                lastSeenAt: new Date().toISOString(),
              },
            ],
      );
      if (initialPlayId) {
        void setInitialPlayAction(res.sessionId, initialPlayId);
      }
    },
    [session, playbookId, currentUserId, currentUserName, initialPlayId, toast],
  );

  // --- Realtime subscription -----------------------------------------------
  useEffect(() => {
    if (!session) return;
    const supabase = createBrowserSupabase();
    const sessionId = session.id;

    const channel = supabase
      .channel(`game-session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setSession(null);
            return;
          }
          const row = payload.new as Record<string, unknown>;
          // Merge: Supabase realtime may only ship the primary key + changed
          // columns on an UPDATE (unless REPLICA IDENTITY FULL is set).
          // Overwriting the whole session from a partial payload used to
          // drop caller/current_play and bomb action calls with
          // `uuid: "undefined"`. Prefer existing fields when the payload
          // doesn't include them.
          setSession((prev) => {
            const merged: LiveGameSession = {
              id: (row.id as string | undefined) ?? prev?.id ?? sessionId,
              playbookId:
                (row.playbook_id as string | undefined) ??
                prev?.playbookId ??
                playbookId,
              status:
                (row.status as "active" | "ended" | undefined) ??
                prev?.status ??
                "active",
              callerUserId:
                "caller_user_id" in row
                  ? ((row.caller_user_id as string | null) ?? null)
                  : (prev?.callerUserId ?? null),
              currentPlayId:
                "current_play_id" in row
                  ? ((row.current_play_id as string | null) ?? null)
                  : (prev?.currentPlayId ?? null),
              nextPlayId:
                "next_play_id" in row
                  ? ((row.next_play_id as string | null) ?? null)
                  : (prev?.nextPlayId ?? null),
              startedAt:
                (row.started_at as string | undefined) ??
                prev?.startedAt ??
                new Date().toISOString(),
              kind:
                "kind" in row
                  ? (row.kind as string) === "scrimmage"
                    ? "scrimmage"
                    : "game"
                  : (prev?.kind ?? "game"),
              opponent:
                "opponent" in row
                  ? ((row.opponent as string | null) ?? null)
                  : (prev?.opponent ?? null),
            };
            return merged;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_plays",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setCalls((prev) => {
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as { id?: string }).id;
              return prev.filter((c) => c.id !== oldId);
            }
            const row = payload.new as Record<string, unknown>;
            const next: LiveGameCall = {
              id: row.id as string,
              playId: row.play_id as string,
              position: row.position as number,
              calledAt: row.called_at as string,
              thumb: (row.thumb as "up" | "down" | null) ?? null,
              tag: (row.tag as string | null) ?? null,
            };
            // Replace any optimistic stand-in for the same play/position
            // so we don't end up with a duplicate row. Then upsert by id.
            const pruned = prev.filter(
              (c) =>
                !(
                  c.id.startsWith("optimistic:") &&
                  c.playId === next.playId &&
                  c.position === next.position
                ),
            );
            const idx = pruned.findIndex((c) => c.id === next.id);
            if (idx >= 0) {
              const copy = pruned.slice();
              copy[idx] = next;
              return copy;
            }
            return [...pruned, next].sort((a, b) => a.position - b.position);
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_session_participants",
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            const oldUserId = (payload.old as { user_id?: string }).user_id;
            setParticipants((prev) => prev.filter((p) => p.userId !== oldUserId));
            return;
          }
          const row = payload.new as Record<string, unknown>;
          const userId = row.user_id as string;
          const lastSeenAt = row.last_seen_at as string;
          // Ensure we have a display name (one-shot profile fetch on new joiner).
          setParticipants((prev) => {
            const existing = prev.find((p) => p.userId === userId);
            if (existing) {
              return prev.map((p) =>
                p.userId === userId ? { ...p, lastSeenAt } : p,
              );
            }
            return [...prev, { userId, displayName: null, lastSeenAt }];
          });
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", userId)
            .maybeSingle();
          const name = (profile?.display_name as string | null) ?? null;
          setParticipants((prev) =>
            prev.map((p) => (p.userId === userId ? { ...p, displayName: name } : p)),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_score_events",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setScoreEvents((prev) => {
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as { id?: string }).id;
              return prev.filter((e) => e.id !== oldId);
            }
            const row = payload.new as Record<string, unknown>;
            const next: LiveScoreEvent = {
              id: row.id as string,
              side: (row.side as "us" | "them") ?? "us",
              delta: row.delta as number,
              playId: (row.play_id as string | null) ?? null,
              createdAt: row.created_at as string,
            };
            // Replace any optimistic placeholder for the same delta+side
            // so we don't double-count.
            const pruned = prev.filter(
              (e) =>
                !(
                  e.id.startsWith("optimistic:") &&
                  e.side === next.side &&
                  e.delta === next.delta
                ),
            );
            const idx = pruned.findIndex((e) => e.id === next.id);
            if (idx >= 0) {
              const copy = pruned.slice();
              copy[idx] = next;
              return copy;
            }
            return [...pruned, next].sort((a, b) =>
              a.createdAt < b.createdAt ? -1 : 1,
            );
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session]);

  // --- Heartbeat -----------------------------------------------------------
  useEffect(() => {
    if (!session) return;
    const id = session.id;
    void heartbeatGameSessionAction(id);
    const interval = setInterval(() => {
      void heartbeatGameSessionAction(id);
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [session]);

  // --- Caller-ended-while-I-watch detection --------------------------------
  // If the session flips to 'ended' while I'm still here, I'm a spectator and
  // the caller just closed the game. Kick back to the playbook.
  useEffect(() => {
    if (!session) return;
    if (session.status === "ended") {
      toast("Game ended.", "success");
      router.push(`/playbooks/${playbookId}`);
    }
  }, [session, router, playbookId, toast]);

  // --- Actions -------------------------------------------------------------
  async function dismissIntro(opts: {
    kind: GameKind;
    opponent: string | null;
  }) {
    await startSession(opts);
    setShowIntro(false);
    // After the session lands, show the "pick a starting play" picker.
    // currentPlayId and session aren't read here because startSession has
    // already set them synchronously.
    setPickerMode("current");
  }

  // Optimistic UI: the device that triggers a change updates local state
  // immediately and fires the server action in the background. Realtime
  // echoes the same truth back and our state stays consistent (idempotent
  // reducers — we match by id). On failure we roll back to the snapshot.

  function pickPlay(playId: string) {
    if (!session) return;
    const mode = pickerMode;
    setPickerMode("closed");
    if (mode === "closed") return;

    const snapshot = session;
    setSession({
      ...session,
      ...(mode === "current"
        ? { currentPlayId: playId }
        : { nextPlayId: playId }),
    });

    startMutating(async () => {
      const res =
        mode === "current"
          ? await setInitialPlayAction(session.id, playId)
          : await setNextPlayAction(session.id, playId);
      if (!res.ok) {
        toast(res.error, "error");
        setSession(snapshot);
      }
    });
  }

  function runNextPlay() {
    if (!session) return;
    const target = session.nextPlayId;
    if (!target) return;

    const sessionSnapshot = session;
    const callsSnapshot = calls;
    // Optimistic: promote next → current, clear next, insert a pending
    // call row so scoring taps are responsive even before the server
    // INSERT echoes back. We tag the id so the realtime handler can
    // replace it when the real row arrives.
    const optimisticCallId = `optimistic:${Date.now()}`;
    const maxPos = calls.reduce((m, c) => Math.max(m, c.position), -1);
    setSession({ ...session, currentPlayId: target, nextPlayId: null });
    setCalls([
      ...calls,
      {
        id: optimisticCallId,
        playId: target,
        position: maxPos + 1,
        calledAt: new Date().toISOString(),
        thumb: null,
        tag: null,
      },
    ]);

    startMutating(async () => {
      if (!isCaller) {
        const t = await takeoverCallerAction(session.id);
        if (!t.ok) {
          toast(t.error, "error");
          setSession(sessionSnapshot);
          setCalls(callsSnapshot);
          return;
        }
      }
      const res = await advanceToNextPlayAction(session.id);
      if (!res.ok) {
        toast(res.error, "error");
        setSession(sessionSnapshot);
        setCalls(callsSnapshot);
      }
    });
  }

  /** Open the "choose next play" picker. For a spectator, transparently
   *  claim the caller role first so the tap does what the label says.
   *  High-trust environment — we don't gate this behind a confirm. */
  function openNextPicker() {
    setPickerMode("next");
    if (!session || isCaller) return;
    const snapshot = session;
    setSession({ ...session, callerUserId: currentUserId });
    startMutating(async () => {
      const t = await takeoverCallerAction(session.id);
      if (!t.ok) {
        toast(t.error, "error");
        setSession(snapshot);
      }
    });
  }

  function applyScore(next: { thumb: "up" | "down" | null; tag: string | null }) {
    if (!session) return;
    const currentPlayIdNow = session.currentPlayId;
    if (!currentPlayIdNow) return;

    const callsSnapshot = calls;
    // Update (or synthesize) the latest call for the current play so the
    // scoring UI reflects the tap instantly.
    const lastIdx = calls.length - 1;
    const last = lastIdx >= 0 ? calls[lastIdx] : null;
    if (last && last.playId === currentPlayIdNow) {
      const copy = calls.slice();
      copy[lastIdx] = { ...last, thumb: next.thumb, tag: next.tag };
      setCalls(copy);
    } else {
      const maxPos = calls.reduce((m, c) => Math.max(m, c.position), -1);
      setCalls([
        ...calls,
        {
          id: `optimistic:${Date.now()}`,
          playId: currentPlayIdNow,
          position: maxPos + 1,
          calledAt: new Date().toISOString(),
          thumb: next.thumb,
          tag: next.tag,
        },
      ]);
    }

    startMutating(async () => {
      const res = await scoreCurrentCallAction(session.id, next);
      if (!res.ok) {
        toast(res.error, "error");
        setCalls(callsSnapshot);
      }
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

  function takeover() {
    if (!session || !session.id) return;
    const snapshot = session;
    const id = session.id;
    setSession({ ...session, callerUserId: currentUserId });
    startMutating(async () => {
      const res = await takeoverCallerAction(id);
      if (!res.ok) {
        toast(res.error, "error");
        setSession(snapshot);
      }
    });
  }

  function addScore(side: "us" | "them", delta: number) {
    if (!session) return;
    if (delta === 0) return;
    const currentCallId =
      currentCall && currentCall.playId === session.currentPlayId
        ? currentCall.id
        : null;
    // Optimistic event so the scoreboard ticks instantly on the tapping
    // device. Realtime INSERT dedupes by matching side+delta.
    const optimistic: LiveScoreEvent = {
      id: `optimistic:${Date.now()}`,
      side,
      delta,
      playId: currentCallId,
      createdAt: new Date().toISOString(),
    };
    const snapshot = scoreEvents;
    setScoreEvents([...scoreEvents, optimistic]);
    startMutating(async () => {
      const res = await logScoreEventAction(session.id, {
        side,
        delta,
        playId: currentCallId,
      });
      if (!res.ok) {
        toast(res.error, "error");
        setScoreEvents(snapshot);
      }
    });
  }

  function overwriteScore(side: "us" | "them", target: number) {
    if (!session) return;
    const current = scoreEvents
      .filter((e) => e.side === side)
      .reduce((sum, e) => sum + e.delta, 0);
    const delta = target - current;
    if (delta === 0) return;
    addScore(side, delta);
  }

  function handleTopLeftClose() {
    if (!session) {
      router.push(`/playbooks/${playbookId}`);
      return;
    }
    if (isCaller) {
      setExitOpen(true);
      return;
    }
    // Spectator: leave silently.
    startMutating(async () => {
      await leaveGameSessionAction(session.id);
      router.push(`/playbooks/${playbookId}`);
    });
  }

  function endGame(data: {
    kind: GameKind;
    opponent: string | null;
    scoreUs: number | null;
    scoreThem: number | null;
    notes: string | null;
  }) {
    if (!session) return;
    startSaving(async () => {
      const res = await endGameSessionAction(session.id, data);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast(
        data.kind === "scrimmage" ? "Scrimmage saved." : "Game saved.",
        "success",
      );
      router.push(`/playbooks/${playbookId}`);
    });
  }

  function discardGame() {
    if (!session) return;
    if (!isCaller) return;
    // The ExitGameDialog itself asks for confirmation before invoking this,
    // so no second confirm here — one warning is enough.
    startSaving(async () => {
      const res = await discardGameSessionAction(session.id);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      router.push(`/playbooks/${playbookId}`);
    });
  }

  const callCount =
    calls.length > 0 ? calls.filter((c) => c.thumb != null).length : 0;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex flex-col bg-surface-inset text-foreground"
    >
      {/* Top bar — exit affordance and the play name. The X opens the end-
          game dialog for the caller, or quietly leaves for spectators. */}
      <div className="flex items-center gap-2 border-b border-border bg-surface-raised px-3 py-2">
        <button
          type="button"
          onClick={handleTopLeftClose}
          className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-surface-hover"
          aria-label={isCaller ? "End game" : "Leave game mode"}
        >
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1 text-center landscape:hidden">
          <div className="truncate text-sm font-semibold">
            {currentPlay?.name ?? (isCaller ? "Pick a play" : "Waiting for caller…")}
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

      {/* Spectator banner: caller's name + takeover affordance. Hidden in
          landscape so viewing coaches get the full field. */}
      {session && !isCaller && (
        <button
          type="button"
          onClick={takeover}
          className="mx-auto mt-3 flex w-full max-w-[640px] items-center gap-2 rounded-lg border border-primary bg-surface-raised px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-hover landscape:hidden"
        >
          <Radio className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="flex-1 text-left">
            {callerName} is calling plays — tap to take over
          </span>
        </button>
      )}

      {/* Scrollable column: field on top, notes + next-play row beneath. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 landscape:items-center landscape:justify-center landscape:overflow-hidden landscape:p-0">
        {currentPlay ? (
          <CurrentPlaySection
            key={currentPlay.id}
            document={currentPlay.document}
            preview={currentPlay.preview}
            outcome={currentOutcome}
            onTapThumb={tapThumb}
            onTapTag={tapTag}
          />
        ) : (
          <p className="px-6 py-12 text-center text-sm text-muted">
            {isCaller
              ? "Pick a play to start the game."
              : `${callerName} hasn't picked a play yet.`}
          </p>
        )}

        {currentPlay && pickerMode !== "next" && (
          <div className="mx-auto w-full max-w-[640px] landscape:hidden">
            <NotesCard notes={currentPlay.document?.metadata?.notes ?? ""} />
          </div>
        )}

        {/* Next-play area. Inline picker replaces it for the caller when
            picking; spectators always see a disabled stub with caller name. */}
        {pickerMode === "next" && isCaller ? (
          <div className="mx-auto flex min-h-0 w-full max-w-[640px] flex-1 flex-col landscape:hidden">
            <PlayPickerDialog
              inline
              open
              plays={plays}
              currentPlayId={currentPlayId}
              onPick={pickPlay}
              onClose={() => setPickerMode("closed")}
              canClose
            />
          </div>
        ) : (
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
                    onClick={openNextPicker}
                    className="inline-flex h-14 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-base font-semibold text-foreground hover:bg-surface-hover"
                  >
                    <Repeat className="size-5" /> Change
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={openNextPicker}
                disabled={!currentPlay}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:text-muted"
              >
                Choose next play
              </button>
            )}
          </div>
        )}

        {session &&
          session.kind === "game" &&
          pickerMode !== "next" && (
            <ScoreCard
              events={scoreEvents}
              usLabel={playbookName}
              themLabel={session.opponent?.trim() || "Opponent"}
              isTackle={isTackle}
              onAdd={addScore}
              onOverwrite={overwriteScore}
            />
          )}
      </div>

      {showIntro && <IntroOverlay onDismiss={dismissIntro} />}

      {/* Fullscreen picker only for the initial "pick your first play" state,
          and only for the caller. Spectators see the waiting message. */}
      <PlayPickerDialog
        open={pickerMode === "current" && isCaller}
        plays={plays}
        currentPlayId={null}
        onPick={pickPlay}
        onClose={() => setPickerMode("closed")}
        canClose={currentPlay != null}
      />

      <ExitGameDialog
        open={exitOpen}
        onCancel={() => setExitOpen(false)}
        onConfirm={endGame}
        onDiscard={discardGame}
        startedAt={session?.startedAt ?? new Date().toISOString()}
        callCount={callCount}
        saving={saving}
        initialKind={session?.kind ?? "game"}
        initialOpponent={session?.opponent ?? null}
      />
    </div>
  );
}

function NotesCard({ notes }: { notes: string }) {
  const trimmed = notes.trim();
  const hasNotes = trimmed.length > 0;
  const [expanded, setExpanded] = useState(false);

  if (!hasNotes) {
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
      style={{ marginTop: "3.75rem" }}
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

function IntroOverlay({
  onDismiss,
}: {
  onDismiss: (opts: { kind: GameKind; opponent: string | null }) => void;
}) {
  const [kind, setKind] = useState<GameKind>("game");
  const [opponent, setOpponent] = useState("");
  const [starting, setStarting] = useState(false);
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
          A sideline tool for live play calling. Pick a play, score it with a
          thumb after the snap, then queue the next call. Other coaches on your
          playbook can join to help score — everyone sees the same thing.
        </p>

        <KindToggle value={kind} onChange={setKind} className="mt-4" />

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-semibold text-muted">
            Opponent <span className="font-normal">(optional)</span>
          </span>
          <input
            type="text"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="e.g. Wildcats"
            className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </label>

        <button
          type="button"
          disabled={starting}
          onClick={() => {
            setStarting(true);
            onDismiss({ kind, opponent: opponent.trim() || null });
          }}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg border border-primary bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {starting ? "Starting…" : `Start ${kind === "scrimmage" ? "scrimmage" : "game"}`}
        </button>
      </div>
    </div>
  );
}

