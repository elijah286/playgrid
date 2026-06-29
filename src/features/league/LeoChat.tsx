"use client";

import { useEffect, useRef, useState } from "react";

type Proposal = { toolName: string; input: Record<string, unknown>; preview: string };

type Turn = {
  role: "user" | "assistant";
  text: string;
  toolCalls?: string[];
  proposal?: Proposal;
  proposalState?: "pending" | "approved" | "dismissed";
  proposalResult?: string;
};

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

export function LeoChat({
  leagueId,
  writesEnabled,
}: {
  leagueId: string;
  writesEnabled: boolean;
}) {
  const storageKey = `leo:chat:v1:${leagueId}`;
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
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
        proposal?: Proposal | null;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data?.error || "Leo had a problem.");
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: data.text ?? "…",
            toolCalls: data.toolCalls,
            proposal: data.proposal ?? undefined,
            proposalState: data.proposal ? "pending" : undefined,
          },
        ]);
      }
    } catch {
      setError("Network error — try again.");
    }
    setPending(false);
  }

  async function approve(idx: number) {
    const turn = messages[idx];
    if (!turn?.proposal || busyIdx !== null) return;
    setError(null);
    setBusyIdx(idx);
    try {
      const res = await fetch("/api/league-ai/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leagueId,
          toolName: turn.proposal.toolName,
          input: turn.proposal.input,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; result?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data?.error || "Couldn't complete that action.");
      } else {
        setMessages((prev) =>
          prev.map((m, i) =>
            i === idx
              ? { ...m, proposalState: "approved", proposalResult: data.result ?? "Done." }
              : m,
          ),
        );
      }
    } catch {
      setError("Network error — try again.");
    }
    setBusyIdx(null);
  }

  function dismiss(idx: number) {
    setMessages((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, proposalState: "dismissed" } : m)),
    );
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
              {writesEnabled
                ? "Leo looks things up for you. Anything it would change, it asks you to approve first."
                : "Leo can look things up and draft messages — it can't send or change anything yet."}
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
          messages.map((m, i) => (
            <div key={i} className="space-y-2">
              <Bubble turn={m} />
              {m.proposal ? (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm dark:border-amber-800 dark:bg-amber-950/40">
                    <div className="font-medium text-amber-900 dark:text-amber-100">
                      {m.proposal.preview}
                    </div>
                    {m.proposalState === "approved" ? (
                      <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                        ✓ {m.proposalResult}
                      </div>
                    ) : m.proposalState === "dismissed" ? (
                      <div className="mt-1 text-xs text-muted">Dismissed.</div>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={busyIdx !== null}
                          onClick={() => approve(i)}
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50"
                        >
                          {busyIdx === i ? "Working…" : "Approve"}
                        </button>
                        <button
                          type="button"
                          disabled={busyIdx !== null}
                          onClick={() => dismiss(i)}
                          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ))
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
