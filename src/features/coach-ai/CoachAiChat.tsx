"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send, Wrench } from "lucide-react";
import { Button } from "@/components/ui";
import { chatCoachAiAction, type CoachAiTurn } from "@/app/actions/coach-ai";
import { CoachAiIcon } from "./CoachAiIcon";

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
  const [turns, setTurns] = useState<CoachAiTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, pending]);

  // Switching modes resets the chat — context from one mode doesn't translate.
  useEffect(() => {
    setTurns([]);
    setError(null);
  }, [mode]);

  function send() {
    const text = draft.trim();
    if (!text || pending) return;
    setError(null);
    const userTurn: CoachAiTurn = { role: "user", text };
    const prior = turns;
    setTurns([...prior, userTurn]);
    setDraft("");
    startTransition(async () => {
      const res = await chatCoachAiAction({
        history: prior,
        userMessage: text,
        playbookId: playbookId ?? null,
        mode,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTurns((cur) => [
        ...cur,
        { role: "assistant", text: res.assistantText, toolCalls: res.toolCalls },
      ]);
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-3">
            {turns.map((t, i) => (
              <li key={i} className="flex">
                {t.role === "assistant" && (
                  <div className="mr-2 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CoachAiIcon className="size-4" />
                  </div>
                )}
                <div
                  className={
                    t.role === "user"
                      ? "ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-inset px-3 py-2 text-sm text-foreground"
                  }
                >
                  <div className="whitespace-pre-wrap leading-relaxed">{t.text}</div>
                  {t.role === "assistant" && t.toolCalls.length > 0 && (
                    <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted">
                      <Wrench className="size-3" />
                      {t.toolCalls.join(", ")}
                    </div>
                  )}
                </div>
              </li>
            ))}
            {pending && (
              <li className="flex">
                <div className="mr-2 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CoachAiIcon className="size-4" />
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-inset px-3 py-2 text-sm text-muted">
                  <Dots />
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
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask Coach AI…"
            className="flex-1 resize-none rounded-xl bg-surface-inset px-3 py-2 text-sm text-foreground ring-1 ring-inset ring-black/5 focus:outline-none focus:ring-2 focus:ring-primary/40"
            disabled={pending}
          />
          <Button
            variant="primary"
            size="sm"
            disabled={pending || !draft.trim()}
            onClick={send}
            aria-label="Send"
          >
            <Send className="size-4" />
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Coach AI may be wrong. Most knowledge-base entries are unverified seed
          data — double-check rule wording against the official source.
        </p>
      </div>
    </div>
  );
}

function Empty() {
  const suggestions = [
    "What is the rush rule in NFL Flag 5v5?",
    "Explain Cover 3 vs. Cover 4.",
    "Build a Trips Right slants concept.",
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <CoachAiIcon className="size-7" />
      </div>
      <h3 className="mt-3 text-base font-semibold text-foreground">Coach AI</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Ask about rules, formations, or play concepts. Coach AI grounds answers
        in a curated knowledge base and asks before assuming your league.
      </p>
      <ul className="mt-4 flex w-full max-w-sm flex-col gap-1.5">
        {suggestions.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => {
                const ta = document.querySelector<HTMLTextAreaElement>('[data-coach-ai-input]');
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
