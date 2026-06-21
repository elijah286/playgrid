"use client";

import { useState, useTransition } from "react";

import {
  listBroadcastsAction,
  sendBroadcastAction,
  type BroadcastRow,
} from "@/app/actions/league-broadcasts";

type Msg = { kind: "error" | "success"; text: string } | null;

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function BroadcastsManager({
  leagueId,
  initialBroadcasts,
  coachCount,
}: {
  leagueId: string;
  initialBroadcasts: BroadcastRow[];
  coachCount: number;
}) {
  const [items, setItems] = useState(initialBroadcasts);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const r = await listBroadcastsAction(leagueId);
      if (r.ok) setItems(r.items);
    });
  }

  function send() {
    if (!title.trim() || !body.trim()) return;
    if (!globalThis.confirm(`Send this to ${coachCount} coach${coachCount === 1 ? "" : "es"}?`)) return;
    setMsg(null);
    startTransition(async () => {
      const r = await sendBroadcastAction(leagueId, title, body);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      setTitle("");
      setBody("");
      setMsg({ kind: "success", text: `Sent to ${r.sent} coach${r.sent === 1 ? "" : "es"}.` });
      refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border p-4">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Subject</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Practice moved to Field 3"
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="font-medium text-foreground">Message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="Write your announcement…"
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || !title.trim() || !body.trim() || coachCount === 0}
            onClick={send}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? "Sending…" : `Send to ${coachCount} coach${coachCount === 1 ? "" : "es"}`}
          </button>
          <span className="text-xs text-muted">
            Goes by email to coaches with an address. Parent announcements arrive with registration.
          </span>
        </div>
        {coachCount === 0 ? (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            No coaches have an email yet — add coach emails on the Teams page.
          </p>
        ) : null}
        {msg ? (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm ring-1 ${
              msg.kind === "error"
                ? "bg-amber-50 text-amber-950 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-800"
                : "bg-emerald-50 text-emerald-950 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-50 dark:ring-emerald-800"
            }`}
          >
            {msg.text}
          </p>
        ) : null}
      </div>

      <div>
        <div className="mb-2 text-xs font-medium text-muted">Sent announcements</div>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-border px-4 py-8 text-center text-sm text-muted">
            No announcements yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((b) => (
              <li key={b.id} className="rounded-2xl border border-border bg-surface-raised p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-foreground">{b.title}</div>
                  <div className="shrink-0 text-xs text-muted">{fmtDate(b.sentAt ?? b.createdAt)}</div>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{b.body}</p>
                <div className="mt-2 text-xs text-muted">
                  Sent to {b.recipientCount} {b.recipientCount === 1 ? "coach" : "coaches"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
