"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui";
import type { CoachAiTurn, PlaybookChip } from "@/app/actions/coach-ai";
import Link from "next/link";
import {
  getAiFeedbackOptInAction,
  setAiFeedbackOptInAction,
  logCoachAiPositiveFeedbackAction,
  logCoachAiNegativeFeedbackAction,
} from "@/app/actions/coach-ai-feedback";
import { CoachAiIcon } from "./CoachAiIcon";
import { AssistantMessageWithFeedback } from "./AssistantMessageWithFeedback";
import { AssistantMessage } from "./AssistantMessage";
import { CoachAiUsageMeter } from "./CoachAiUsageMeter";

// Bumped if the persisted shape changes — older blobs are then ignored.
const STORAGE_VERSION = 1;
const MAX_PERSISTED_TURNS = 50;

function storageKeyFor(mode: string, playbookId: string | null | undefined): string {
  const scope = mode === "playbook_training" || mode === "normal" ? (playbookId ?? "global") : "global";
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
  mode = "normal",
}: {
  playbookId?: string | null;
  mode?: "normal" | "admin_training" | "playbook_training";
}) {
  const storageKey = storageKeyFor(mode, playbookId ?? null);
  const [turns, setTurns] = useState<CoachAiTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [partialText, setPartialText] = useState("");
  const [toolCallsDuringStream, setToolCallsDuringStream] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [usageTick, setUsageTick] = useState(0);
  const [feedbackOptIn, setFeedbackOptIn] = useState<"loading" | "consenting" | "declined" | "unanswered">("loading");
  const [optInPending, setOptInPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  // Load the user's AI-feedback opt-in status once. NULL → show modal on
  // first chat use; true/false → never show again. The modal only blocks
  // the first message — subsequent sends never see it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getAiFeedbackOptInAction();
      if (cancelled) return;
      setFeedbackOptIn(res.ok ? res.status : "declined");
    })();
    return () => { cancelled = true; };
  }, []);

  async function answerOptIn(consenting: boolean) {
    setOptInPending(true);
    const res = await setAiFeedbackOptInAction(consenting);
    setOptInPending(false);
    if (res.ok) setFeedbackOptIn(consenting ? "consenting" : "declined");
  }

  // Auto-scroll whenever content changes
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
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
        const bridgeTurn: CoachAiTurn = {
          role: "assistant",
          text: teamName
            ? `Got it — I'm now in your **${teamName}** playbook. What date and time do you want to schedule, and how long? (Recurrence is optional.)`
            : "Got it — I'm now in this playbook. What date, time, and duration do you want to schedule?",
          toolCalls: [],
        };
        const merged = [...carried, bridgeTurn];
        setTurns(merged);
        saveTurns(storageKey, merged);
        setError(null);
        return;
      }
    }
    setTurns(loadTurns(storageKey));
    setError(null);
  }, [storageKey]);

  useEffect(() => {
    saveTurns(storageKey, turns);
  }, [storageKey, turns]);

  function clearChat() {
    setTurns([]);
    setError(null);
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
  }

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || streaming) return;
    setError(null);
    setStatusText(null);
    setPartialText("");
    setToolCallsDuringStream([]);

    const userTurn: CoachAiTurn = { role: "user", text };
    const prior = turns;
    setTurns((cur) => [...cur, userTurn]);
    setDraft("");
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/coach-ai/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ history: prior, userMessage: text, playbookId, mode }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      let accumulated = "";
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
          setError((payload.message as string | undefined) ?? "An error occurred.");
        }
        if (event === "done") {
          const finalText = (payload.text as string | undefined) || accumulated;
          const finalToolCalls = (payload.toolCalls as string[] | undefined) ?? seenToolCalls;
          const chips = (payload.playbookChips as PlaybookChip[] | null | undefined) ?? null;
          const mutated = payload.mutated === true;
          setTurns((cur) => [
            ...cur,
            { role: "assistant", text: finalText, toolCalls: finalToolCalls, playbookChips: chips },
          ]);
          setUsageTick((n) => n + 1);
          // If the agent ran any DB-mutating tool (create_event, update_play,
          // KB writes, etc.), refresh the surrounding page so newly created
          // rows appear without a manual reload. router.refresh re-runs the
          // server components for the current route — cheap, no full reload,
          // and leaves the chat panel mounted.
          if (mutated) router.refresh();
          break;
        }
      }
    } catch (e) {
      if ((e as { name?: string }).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Coach AI request failed.");
      }
    } finally {
      setStreaming(false);
      setStatusText(null);
      setPartialText("");
      setToolCallsDuringStream([]);
      abortRef.current = null;
    }
  }, [draft, streaming, turns, playbookId, mode, router]);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {feedbackOptIn === "unanswered" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
          <div className="max-w-sm rounded-2xl bg-surface-raised p-5 shadow-xl ring-1 ring-black/10">
            <h3 className="text-base font-semibold text-foreground">Help improve Coach AI?</h3>
            <p className="mt-2 text-sm text-muted">
              When Coach AI answers from general football knowledge instead of our seeded playbook,
              we&apos;d like to log the topic of your question so we can fill that gap. We never log
              your full chat — just the topic + your question + a few details about your playbook
              context.
            </p>
            <p className="mt-2 text-sm text-muted">
              You can change your mind anytime — just ask Coach AI to update your feedback
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {turns.length === 0 && !streaming ? (
          <Empty />
        ) : (
          <ul className="space-y-5">
            {turns.map((t, i) => {
              const prevUserMessage = i > 0 ? turns[i - 1]?.text : "";
              return (
                <li key={i} className={t.role === "user" ? "flex justify-end" : "flex items-start gap-2.5"}>
                  {t.role === "assistant" && (
                    <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <CoachAiIcon className="size-4" />
                    </div>
                  )}
                  {t.role === "user" ? (
                    <div className="max-w-[82%] rounded-2xl rounded-tr-sm bg-brand-green px-3.5 py-2 text-sm leading-relaxed text-white">
                      {t.text}
                    </div>
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
            disabled={streaming || !draft.trim()}
            onClick={() => void send()}
            aria-label="Send"
          >
            <Send className="size-4" />
          </Button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <p className="truncate text-[11px] leading-snug text-muted">
              Coach AI may be wrong — double-check rules against the official source.
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

function Empty() {
  const suggestions = [
    "What is the rush rule in NFL Flag 5v5?",
    "Generate a 5-play red zone package for me.",
    "How should I attack Cover 3 with a 7v7 offense?",
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <CoachAiIcon className="size-7" />
      </div>
      <h3 className="mt-3 text-base font-semibold text-foreground">Coach Cal</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Ask about rules, formations, or play concepts. Coach Cal grounds answers
        in a curated knowledge base and asks before assuming your league.
      </p>
      <ul className="mt-4 flex w-full max-w-sm flex-col gap-1.5">
        {suggestions.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => {
                const ta = document.querySelector<HTMLTextAreaElement>("[data-coach-ai-input]");
                if (ta) {
                  ta.value = s;
                  ta.dispatchEvent(new Event("input", { bubbles: true }));
                  ta.focus();
                }
              }}
              className="w-full rounded-lg bg-surface-inset px-3 py-2 text-left text-xs text-foreground hover:bg-surface-inset/80"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
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
