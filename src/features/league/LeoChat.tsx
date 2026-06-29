"use client";

import { useEffect, useRef, useState } from "react";

type Turn = { role: "user" | "assistant"; text: string; toolCalls?: string[] };

const SUGGESTIONS = [
  "What's the state of my league?",
  "Who still needs a team?",
  "How many families would an announcement reach?",
];

function Bubble({ turn }: { turn: Turn }) {
  const isUser = turn.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
          isUser
            ? "bg-primary text-white"
            : "bg-surface-raised text-foreground ring-1 ring-border"
        }`}
      >
        {turn.text}
        {!isUser && turn.toolCalls && turn.toolCalls.length > 0 ? (
          <div className="mt-1.5 text-[11px] text-muted">
            Looked up: {Array.from(new Set(turn.toolCalls)).join(", ")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LeoChat({ leagueId }: { leagueId: string }) {
  const storageKey = `leo:chat:v1:${leagueId}`;
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setMessages(JSON.parse(raw) as Turn[]);
    } catch {
      /* ignore corrupt history */
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-50)));
    } catch {
      /* quota / disabled storage — non-fatal */
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, storageKey, pending]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || pending) return;
    setError(null);
    setInput("");
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setPending(true);
    try {
      const res = await fetch("/api/league-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leagueId, history, userMessage: msg }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        text?: string;
        toolCalls?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data?.error || "Leo had a problem.");
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.text ?? "…", toolCalls: data.toolCalls },
        ]);
      }
    } catch {
      setError("Network error — try again.");
    }
    setPending(false);
  }

  function clearChat() {
    setMessages([]);
    setError(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="text-sm font-semibold text-foreground">Leo</div>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={clearChat}
            className="text-xs text-muted hover:text-foreground hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="mx-auto mt-6 max-w-sm text-center">
            <p className="text-sm text-foreground">
              Ask about registrations, rosters, teams, or communications.
            </p>
            <p className="mt-1 text-xs text-muted">
              Leo can look things up and draft messages — it can&apos;t send or change
              anything yet.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-left text-sm text-foreground hover:bg-foreground/5"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <Bubble key={i} turn={m} />)
        )}
        {pending ? <div className="text-sm text-muted">Leo is thinking…</div> : null}
        {error ? <div className="text-sm text-amber-700 dark:text-amber-300">{error}</div> : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Leo about your league…"
          disabled={pending}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
