"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { BookOpen, Check, Copy, Send, Trash2, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { CoachAiTurn, NoteProposalSavedState, PlaybookChip } from "@/app/actions/coach-ai";
import {
  pickStarterPrompts,
  type PromptContext,
  type SuggestedPrompt,
} from "@/lib/llm/suggested-prompts";
import Link from "next/link";
import {
  getAiFeedbackOptInAction,
  setAiFeedbackOptInAction,
  logCoachAiPositiveFeedbackAction,
  logCoachAiNegativeFeedbackAction,
} from "@/app/actions/coach-ai-feedback";
import { getCoachCalUpgradeBannerEnabledAction } from "@/app/actions/admin-coach-cal-banner";
import { commitPlaybookNoteProposalAction } from "@/app/actions/coach-ai-playbook-notes";
import { CoachAiIcon } from "./CoachAiIcon";
import { AssistantMessageWithFeedback } from "./AssistantMessageWithFeedback";
import { AssistantMessage } from "./AssistantMessage";
import { CoachAiUsageMeter } from "./CoachAiUsageMeter";
import { createMessagePackCheckoutAction } from "@/app/actions/coach-cal-pack";
import type { NoteProposal } from "@/lib/coach-ai/playbook-tools";

type OutOfMessagesPayload = {
  count: number;
  limit: number;
  resetDate: string;
  pack: { messageCount: number; priceUsdCents: number; priceConfigured: boolean };
};

function formatPackPriceCents(cents: number): string {
  if (cents % 100 === 0) return `$${cents / 100}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function formatResetDate(iso: string): string {
  // resetDate is YYYY-MM-DD UTC (first of next month). We want a short
  // human form like "May 1".
  const [y, m, d] = iso.split("-").map((s) => Number(s));
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

// Bumped if the persisted shape changes — older blobs are then ignored.
const STORAGE_VERSION = 1;
const MAX_PERSISTED_TURNS = 50;

function storageKeyFor(mode: string, playbookId: string | null | undefined): string {
  const scope = mode === "normal" ? (playbookId ?? "global") : "global";
  return `coach-ai:chat:v${STORAGE_VERSION}:${mode}:${scope}`;
}

function loadTurns(key: string): CoachAiTurn[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is CoachAiTurn =>
        t && typeof t === "object" && (t.role === "user" || t.role === "assistant") && typeof t.text === "string",
    );
  } catch {
    return [];
  }
}

function saveTurns(key: string, turns: CoachAiTurn[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(turns.slice(-MAX_PERSISTED_TURNS)));
  } catch { /* quota or disabled */ }
}

/** Minimal SSE parser — handles `event: foo\ndata: {...}\n\n` frames. */
async function* parseSse(body: ReadableStream<Uint8Array>) {
  const dec = new TextDecoder();
  const reader = body.getReader();
  let buf = "";
  let eventName = "message";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      let data: string | undefined;
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) eventName = line.slice(7).trim();
        else if (line.startsWith("data: ")) data = line.slice(6).trim();
      }
      if (data) yield { event: eventName, data };
      eventName = "message";
    }
  }
}

/**
 * Pure chat surface — fills its container. Owners (launcher / fullscreen page)
 * are responsible for sizing and outer chrome (close, fullscreen toggle).
 */
export function CoachAiChat({
  playbookId,
  playId,
  mode = "normal",
  injectedPrompt = null,
}: {
  playbookId?: string | null;
  playId?: string | null;
  mode?: "normal" | "admin_training";
  /**
   * When set (and `key` changes), populate the draft. If `autoSubmit` is
   * true, fire the request immediately. Used by in-app CTAs that open Cal
   * with a pre-written prompt. The `key` is what makes a *repeat* CTA
   * click re-fire — the launcher bumps it on every dispatch.
   */
  injectedPrompt?: { text: string; autoSubmit: boolean; key: number } | null;
}) {
  const storageKey = storageKeyFor(mode, playbookId ?? null);
  const [turns, setTurns] = useState<CoachAiTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [partialText, setPartialText] = useState("");
  const [toolCallsDuringStream, setToolCallsDuringStream] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [outOfMessages, setOutOfMessages] = useState<OutOfMessagesPayload | null>(null);
  const [packCheckoutPending, setPackCheckoutPending] = useState(false);
  const [usageTick, setUsageTick] = useState(0);
  const [feedbackOptIn, setFeedbackOptIn] = useState<"loading" | "consenting" | "declined" | "unanswered">("loading");
  const [optInPending, setOptInPending] = useState(false);
  const [upgradeBannerEnabled, setUpgradeBannerEnabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Index of the user turn added by the most recent send() call — receives
  // the .msg-in animation. Null for history turns loaded from localStorage.
  const nextFreshIdxRef = useRef<number | null>(null);
  // Tracks whether the user is "stuck to bottom" (within a small tolerance).
  // We only auto-scroll while this is true. The instant the user scrolls up
  // mid-stream to read something, this flips false and we stop dragging
  // them back down — until their next submit, which re-pins to bottom.
  const stuckToBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const prevStorageKeyRef = useRef<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Determine which context the chat is opened in, so the starter prompt
  // sampler can weight current-view-relevant prompts higher than global ones.
  const currentContext: PromptContext = useMemo(() => {
    if (playId) return "play";
    if (pathname?.startsWith("/calendar")) return "calendar";
    if (pathname?.includes("/roster")) return "roster";
    if (playbookId) return "playbook";
    return "global";
  }, [playId, playbookId, pathname]);

  // Sample once per context change. Stable across re-renders within a context
  // so the chips don't shuffle while the user is reading them, but refresh
  // when the user navigates to a new view (a coach who clicks into a play
  // sees play-relevant prompts; back out to playbook, sees playbook ones).
  const starterPrompts = useMemo<SuggestedPrompt[]>(
    () =>
      pickStarterPrompts({
        audience: "coach",
        context: currentContext,
        enabledFlags: new Set(),
        count: 5,
      }),
    [currentContext],
  );

  // Load the user's AI-feedback opt-in status once. NULL → show modal on
  // first chat use; true/false → never show again. Only entitled users
  // ever reach this surface (the launcher routes free users to a marketing
  // popover instead of opening the chat), so this consent prompt never
  // interrupts someone who hasn't actually started using Coach Cal.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getAiFeedbackOptInAction();
      if (cancelled) return;
      setFeedbackOptIn(res.ok ? res.status : "declined");
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getCoachCalUpgradeBannerEnabledAction();
      if (cancelled) return;
      if (res.ok) setUpgradeBannerEnabled(res.enabled);
    })();
    return () => { cancelled = true; };
  }, []);

  async function answerOptIn(consenting: boolean) {
    setOptInPending(true);
    const res = await setAiFeedbackOptInAction(consenting);
    setOptInPending(false);
    if (res.ok) setFeedbackOptIn(consenting ? "consenting" : "declined");
  }

  // Auto-scroll only while the user is stuck to the bottom. The moment
  // they scroll up to read something mid-stream, stuckToBottomRef flips
  // false (via the onScroll handler on the scroll container) and we stop
  // forcing them back down. The next user submit re-pins to bottom (see
  // the submit handler).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stuckToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [turns, streaming, partialText, statusText]);

  useEffect(() => {
    // If the user navigated here via a Cal playbook button (cal_from=1),
    // carry over the global conversation so context isn't lost.
    const params = new URLSearchParams(window.location.search);
    if (params.get("cal_from") === "1") {
      const globalKey = storageKeyFor("normal", null);
      const carried = loadTurns(globalKey);
      const teamName = params.get("cal_team") ?? null;
      params.delete("cal_from");
      params.delete("cal_team");
      const newUrl = window.location.pathname + (params.size > 0 ? "?" + params.toString() : "");
      window.history.replaceState(null, "", newUrl);
      if (carried.length > 0) {
        // Quote the user's last message so they can pick up where they
        // left off without re-typing — e.g. "show me a new mesh concept play".
        const lastUserMsg = [...carried].reverse().find((t) => t.role === "user")?.text ?? null;
        const quoted = lastUserMsg
          ? lastUserMsg.length > 120
            ? `${lastUserMsg.slice(0, 117)}…`
            : lastUserMsg
          : null;
        const bridgeTurn: CoachAiTurn = {
          role: "assistant",
          text: teamName
            ? quoted
              ? `Got it — I'm now in your **${teamName}** playbook. Re-ask "${quoted}" and I'll answer for the right format (variant, age tier, league).`
              : `Got it — I'm now in your **${teamName}** playbook. What can I help with?`
            : quoted
            ? `Got it — I'm now in this playbook. Re-ask "${quoted}" and I'll answer for the right format.`
            : "Got it — I'm now in this playbook. What can I help with?",
          toolCalls: [],
        };
        const merged = [...carried, bridgeTurn];
        setTurns(merged);
        saveTurns(storageKey, merged);
        setError(null);
        prevStorageKeyRef.current = storageKey;
        return;
      }
    }
    const loaded = loadTurns(storageKey);
    // Anchor switched mid-session (e.g. tackle playbook → flag playbook). Insert
    // a visible bridge turn so both the user and the model see the switch — the
    // model otherwise carries over assumptions from the previous scope's turns.
    const prev = prevStorageKeyRef.current;
    if (prev && prev !== storageKey && loaded.length > 0) {
      const bridgeTurn: CoachAiTurn = {
        role: "assistant",
        text:
          "_[Context switch] You've moved to a different playbook. Earlier turns in this thread may have been about another team — verify rules and personnel against the current playbook before applying prior advice._",
        toolCalls: [],
      };
      const merged = [...loaded, bridgeTurn];
      setTurns(merged);
      saveTurns(storageKey, merged);
    } else {
      setTurns(loaded);
    }
    setError(null);
    prevStorageKeyRef.current = storageKey;
  }, [storageKey]);

  useEffect(() => {
    saveTurns(storageKey, turns);
  }, [storageKey, turns]);

  function clearChat() {
    // Abort any in-flight stream — otherwise the SSE consumer keeps
    // reading until the server closes, and on a hung/disconnected
    // stream that means the loading overlay (the "thinking" pulse)
    // stays up forever masking what was already rendered. Surfaced
    // 2026-05-02: a coach hit Clear during a stuck stream and saw
    // the diagram pop in because the underlying turn HAD completed —
    // only the streaming UI state hadn't cleared.
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setPartialText("");
    setStatusText(null);
    setToolCallsDuringStream([]);
    setTurns([]);
    setError(null);
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
  }

  const send = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? draft).trim();
    if (!text || streaming) return;
    setError(null);
    setOutOfMessages(null);
    setStatusText(null);
    setPartialText("");
    setToolCallsDuringStream([]);

    const userTurn: CoachAiTurn = { role: "user", text };
    const prior = turns;
    nextFreshIdxRef.current = turns.length;
    setTurns((cur) => [...cur, userTurn]);
    setDraft("");
    setStreaming(true);
    // The user just submitted — re-pin to bottom so they see their own
    // message and the streaming reply, even if they had scrolled up to
    // re-read an earlier diagram while drafting. (Once Cal starts
    // generating, the onScroll handler takes over: scroll up = stop
    // dragging them down.)
    stuckToBottomRef.current = true;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/coach-ai/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          history: prior,
          userMessage: text,
          playbookId,
          playId,
          mode,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      let accumulated = "";
      let blocked = false;
      const seenToolCalls: string[] = [];

      for await (const { event, data } of parseSse(res.body)) {
        if (ctrl.signal.aborted) break;
        let payload: Record<string, unknown>;
        try { payload = JSON.parse(data) as Record<string, unknown>; } catch { continue; }

        if (event === "status")     setStatusText(payload.text as string);
        if (event === "tool_call") {
          const name = payload.name as string;
          seenToolCalls.push(name);
          setToolCallsDuringStream([...seenToolCalls]);
        }
        if (event === "text_delta") {
          accumulated += payload.text as string;
          setPartialText(accumulated);
          setStatusText(null); // clear "Searching…" once text starts
        }
        if (event === "error") {
          if (payload.code === "out_of_messages") {
            blocked = true;
            setOutOfMessages({
              count: Number(payload.count) || 0,
              limit: Number(payload.limit) || 0,
              resetDate: String(payload.resetDate ?? ""),
              pack: payload.pack as OutOfMessagesPayload["pack"],
            });
            // Roll back the optimistically-appended user turn so it
            // doesn't sit there as if it was sent.
            setTurns((cur) => (cur.at(-1)?.role === "user" ? cur.slice(0, -1) : cur));
            setDraft(text);
          } else {
            setError((payload.message as string | undefined) ?? "An error occurred.");
          }
        }
        if (event === "done") {
          if (blocked) {
            break;
          }
          const finalText = (payload.text as string | undefined) || accumulated;
          const finalToolCalls = (payload.toolCalls as string[] | undefined) ?? seenToolCalls;
          const chips = (payload.playbookChips as PlaybookChip[] | null | undefined) ?? null;
          const proposals = (payload.noteProposals as NoteProposal[] | null | undefined) ?? null;
          const mutated = payload.mutated === true;
          setTurns((cur) => [
            ...cur,
            {
              role: "assistant",
              text: finalText,
              toolCalls: finalToolCalls,
              playbookChips: chips,
              noteProposals: proposals,
              noteProposalState: null,
            },
          ]);
          setUsageTick((n) => n + 1);
          // If the agent ran any DB-mutating tool (create_event, update_play,
          // KB writes, etc.), refresh the surrounding page so newly created
          // rows appear without a manual reload. router.refresh re-runs the
          // server components for the current route — cheap, no full reload,
          // and leaves the chat panel mounted. We also broadcast a window
          // event so client-only views that fetch their own data (e.g. the
          // calendar tab) can reload without waiting for a manual refresh.
          if (mutated) {
            router.refresh();
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("coach-ai-mutated"));
            }
          }
          break;
        }
      }
    } catch (e) {
      if ((e as { name?: string }).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Coach Cal request failed.");
      }
    } finally {
      setStreaming(false);
      setStatusText(null);
      setPartialText("");
      setToolCallsDuringStream([]);
      abortRef.current = null;
    }
  }, [draft, streaming, turns, playbookId, playId, mode, router]);

  // Externally-injected prompt (in-app CTA). When the key changes, drop the
  // text into the draft and — if the CTA wanted it sent — fire send() with
  // the explicit text so we don't depend on a same-tick state update having
  // landed. Includes the key in the deps so a *repeat* click of the same
  // CTA re-injects (the openCoachCal helper bumps the key on every dispatch).
  const injectedKey = injectedPrompt?.key ?? null;
  useEffect(() => {
    if (!injectedPrompt) return;
    setDraft(injectedPrompt.text);
    if (injectedPrompt.autoSubmit) {
      void send(injectedPrompt.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectedKey]);

  const buyMessagePack = useCallback(async () => {
    setPackCheckoutPending(true);
    try {
      const res = await createMessagePackCheckoutAction();
      if (!res.ok) {
        setError(res.error);
        setOutOfMessages(null);
        return;
      }
      window.location.href = res.url;
    } finally {
      setPackCheckoutPending(false);
    }
  }, []);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {feedbackOptIn === "unanswered" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
          <div className="max-w-sm rounded-2xl bg-surface-raised p-5 shadow-xl ring-1 ring-black/10">
            <h3 className="text-base font-semibold text-foreground">Help improve Coach Cal?</h3>
            <p className="mt-2 text-sm text-muted">
              When Coach Cal answers from general football knowledge instead of our seeded playbook,
              we&apos;d like to log the topic of your question so we can fill that gap. We never log
              your full chat — just the topic + your question + a few details about your playbook
              context.
            </p>
            <p className="mt-2 text-sm text-muted">
              You can change your mind anytime — just ask Coach Cal to update your feedback
              preference. Details in our{" "}
              <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                privacy policy
              </a>.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={optInPending} onClick={() => void answerOptIn(false)}>
                No thanks
              </Button>
              <Button variant="primary" size="sm" disabled={optInPending} onClick={() => void answerOptIn(true)}>
                Help improve
              </Button>
            </div>
          </div>
        </div>
      )}
      {upgradeBannerEnabled && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <p>
            <span className="font-semibold">Coach Cal is being upgraded.</span>{" "}
            He&rsquo;s still available, but you may notice unusual behavior
            while improvements roll out. Thanks for your patience.
          </p>
        </div>
      )}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4"
        onScroll={(e) => {
          // Track whether the user is parked at the bottom. Tolerance of
          // ~24px so a near-bottom position still counts as "stuck"
          // (smooth-scroll lag, sub-pixel rounding). The autoscroll effect
          // checks this ref before forcing scrollTop to scrollHeight.
          const el = e.currentTarget;
          const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          stuckToBottomRef.current = distFromBottom <= 24;
        }}
      >
        {turns.length === 0 && !streaming ? (
          <Empty prompts={starterPrompts} />
        ) : (
          <ul className="space-y-5">
            {turns.map((t, i) => {
              const prevUserMessage = i > 0 ? turns[i - 1]?.text : "";
              return (
                <li key={i} className={t.role === "user" ? "flex justify-end" : "flex items-start gap-2.5"}>
                  {t.role === "assistant" && (
                    <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <CoachAiIcon className="size-4 text-primary" bare />
                    </div>
                  )}
                  {t.role === "user" ? (
                    <UserMessageBubble text={t.text} animate={i === nextFreshIdxRef.current} />
                  ) : (
                    <div className="min-w-0 flex-1">
                      {t.role === "assistant" && t.playbookChips && t.playbookChips.length > 0 && (
                        <div className="mb-2 flex flex-col gap-1.5">
                          {t.playbookChips.map((pb) => (
                            <Link
                              key={pb.id}
                              href={`/playbooks/${pb.id}?cal_from=1&cal_team=${encodeURIComponent(pb.name)}`}
                              style={{ backgroundColor: pb.color ?? "#134e2a" }}
                              className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 active:opacity-75"
                            >
                              {[pb.name, pb.season].filter(Boolean).join(" · ")}
                            </Link>
                          ))}
                        </div>
                      )}
                      <AssistantMessageWithFeedback
                        text={t.text}
                        onThumbsUp={() =>
                          void logCoachAiPositiveFeedbackAction(t.text, prevUserMessage)
                        }
                        onThumbsDown={() =>
                          void logCoachAiNegativeFeedbackAction(t.text, prevUserMessage)
                        }
                      />
                      {t.role === "assistant" && t.noteProposals && t.noteProposals.length > 0 && playbookId && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {t.noteProposals.map((p) => (
                            <NoteProposalChip
                              key={p.proposalId}
                              proposal={p}
                              playbookId={playbookId}
                              state={t.noteProposalState?.[p.proposalId] ?? null}
                              onUpdate={(next) =>
                                setTurns((cur) =>
                                  cur.map((tt, j) =>
                                    j === i && tt.role === "assistant"
                                      ? {
                                          ...tt,
                                          noteProposalState: {
                                            ...(tt.noteProposalState ?? {}),
                                            [p.proposalId]: next,
                                          },
                                        }
                                      : tt,
                                  ),
                                )
                              }
                            />
                          ))}
                        </div>
                      )}
                      {t.toolCalls.length > 0 && (
                        <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted">
                          <Wrench className="size-3" />
                          {t.toolCalls.join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}

            {/* Live streaming turn */}
            {streaming && (
              <li className="flex items-start gap-2.5">
                <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CoachAiIcon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  {partialText ? (
                    <>
                      <AssistantMessage text={partialText} />
                      <span className="mt-0.5 inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-primary/60 align-middle" />
                    </>
                  ) : (
                    <div className="flex items-center gap-2 py-1 text-sm text-muted">
                      <Dots />
                      {statusText && (
                        <span className="text-[12px] italic">{statusText}</span>
                      )}
                    </div>
                  )}
                  {toolCallsDuringStream.length > 0 && !partialText && (
                    <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted">
                      <Wrench className="size-3" />
                      {toolCallsDuringStream.join(", ")}
                    </div>
                  )}
                </div>
              </li>
            )}
          </ul>
        )}
      </div>

      {outOfMessages && (
        <div className="mx-3 mb-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
          <p className="font-semibold">
            You&rsquo;ve used all {outOfMessages.limit} Coach Cal messages this month.
          </p>
          <p className="mt-1 text-amber-800/90 dark:text-amber-100/90">
            Resets {formatResetDate(outOfMessages.resetDate)}.
            {outOfMessages.pack.priceConfigured
              ? ` Or buy ${outOfMessages.pack.messageCount} more for ${formatPackPriceCents(outOfMessages.pack.priceUsdCents)} — they expire at month-end.`
              : " Need more before then? Contact support."}
          </p>
          {outOfMessages.pack.priceConfigured && (
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                loading={packCheckoutPending}
                disabled={packCheckoutPending}
                onClick={() => void buyMessagePack()}
              >
                Buy {outOfMessages.pack.messageCount} more for {formatPackPriceCents(outOfMessages.pack.priceUsdCents)}
              </Button>
              <button
                type="button"
                onClick={() => setOutOfMessages(null)}
                className="text-xs font-medium text-amber-900/70 hover:underline dark:text-amber-100/70"
              >
                I&rsquo;ll wait
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mx-3 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="border-t border-border bg-surface-raised px-3 pb-3 pt-2">
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            data-coach-ai-input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask Coach Cal…"
            className="flex-1 resize-none rounded-xl bg-surface-inset px-3 py-2 text-sm text-foreground ring-1 ring-inset ring-black/5 focus:outline-none focus:ring-2 focus:ring-primary/40"
            disabled={streaming}
          />
          <Button
            variant="primary"
            size="sm"
            disabled={streaming || !draft.trim() || outOfMessages !== null}
            onClick={() => void send()}
            aria-label="Send"
          >
            <Send className="size-4" />
          </Button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <p className="truncate text-[11px] leading-snug text-muted">
              Coach Cal may be wrong — double-check rules against the official source.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CoachAiUsageMeter refreshTick={usageTick} />
            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => { if (confirm("Clear this chat? History will be erased.")) clearChat(); }}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-inset hover:text-foreground"
                title="Clear chat history"
              >
                <Trash2 className="size-3" /> Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UserMessageBubble({ text, animate }: { text: string; animate?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail — same fallback as the assistant copy button.
    }
  }
  return (
    <div className={`flex max-w-[82%] flex-col items-end gap-1${animate ? " msg-in" : ""}`}>
      <div className="rounded-2xl rounded-tr-sm bg-brand-green px-3.5 py-2 text-sm leading-relaxed text-white">
        {text}
      </div>
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? "Copied!" : "Copy message"}
        aria-label={copied ? "Copied" : "Copy message"}
        className="inline-flex items-center rounded p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

function Empty({ prompts }: { prompts: SuggestedPrompt[] }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      {/* Standalone mark — icon ships its own gradient tile. */}
      <CoachAiIcon className="size-12" />
      <h3 className="mt-3 text-base font-semibold text-foreground">Coach Cal</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Generate plays and playbooks, plan practices and seasons, review games,
        and get strategy vs. any defense — all from a single chat.
      </p>
      <ul className="mt-4 flex w-full max-w-sm flex-col gap-1.5">
        {prompts.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => {
                const ta = document.querySelector<HTMLTextAreaElement>("[data-coach-ai-input]");
                if (ta) {
                  ta.value = p.text;
                  ta.dispatchEvent(new Event("input", { bubbles: true }));
                  ta.focus();
                }
              }}
              className="w-full rounded-lg bg-surface-inset px-3 py-2 text-left text-xs text-foreground hover:bg-surface-inset/80"
            >
              {p.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NoteProposalChip({
  proposal,
  playbookId,
  state,
  onUpdate,
}: {
  proposal: NoteProposal;
  playbookId: string;
  state: NoteProposalSavedState | null;
  onUpdate: (next: NoteProposalSavedState) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headline =
    proposal.kind === "add"
      ? proposal.title
      : proposal.kind === "edit"
        ? `Edit: ${proposal.after.title}`
        : `Retire: ${proposal.snapshot.title}`;

  const subline =
    proposal.kind === "add"
      ? proposal.content.length > 140
        ? `${proposal.content.slice(0, 140).trim()}…`
        : proposal.content
      : proposal.change_summary;

  const action =
    proposal.kind === "add"
      ? "Save to playbook notes"
      : proposal.kind === "edit"
        ? "Save edit"
        : "Retire note";

  async function save() {
    setPending(true);
    setError(null);
    const res = await commitPlaybookNoteProposalAction(playbookId, proposal);
    setPending(false);
    if (res.ok) {
      onUpdate({ status: "saved", documentId: res.documentId, revisionNumber: res.revisionNumber });
    } else {
      setError(res.error);
    }
  }

  if (state?.status === "saved") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900">
        <Check className="size-3.5 shrink-0" />
        <span className="truncate">
          Saved to playbook notes (rev {state.revisionNumber})
        </span>
      </div>
    );
  }

  if (state?.status === "dismissed") {
    return null;
  }

  return (
    <div className="rounded-lg border border-sky-300 bg-sky-50/60 p-2.5 text-xs ring-1 ring-sky-200/60 dark:border-sky-700 dark:bg-sky-950/30">
      <div className="flex items-start gap-2">
        <BookOpen className="mt-0.5 size-3.5 shrink-0 text-sky-700 dark:text-sky-300" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-sky-900 dark:text-sky-100">
            {headline}
          </div>
          {subline && (
            <div className="mt-0.5 line-clamp-2 text-sky-800/80 dark:text-sky-200/70">
              {subline}
            </div>
          )}
          {error && (
            <div className="mt-1 text-red-700 dark:text-red-300">{error}</div>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => onUpdate({ status: "dismissed" })}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-sky-900/70 hover:bg-sky-100/60 disabled:opacity-50 dark:text-sky-200/70 dark:hover:bg-sky-900/40"
          title="Dismiss this proposal"
        >
          <X className="size-3" />
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
        >
          <Check className="size-3" />
          {pending ? "Saving…" : action}
        </button>
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Thinking">
      <span className="size-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: "0ms" }} />
      <span className="size-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: "120ms" }} />
      <span className="size-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: "240ms" }} />
    </span>
  );
}
