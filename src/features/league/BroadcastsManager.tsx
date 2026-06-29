"use client";

import { useState, useTransition } from "react";

import {
  listBroadcastsAction,
  sendBroadcastAction,
  sendBroadcastTestAction,
  type BroadcastRow,
  type BroadcastAudiences,
} from "@/app/actions/league-broadcasts";
import type { BroadcastAudienceKind } from "@/lib/league/broadcast-recipients";

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
  audiences,
}: {
  leagueId: string;
  initialBroadcasts: BroadcastRow[];
  audiences: BroadcastAudiences;
}) {
  const [items, setItems] = useState(initialBroadcasts);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audienceKey, setAudienceKey] = useState("everyone");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();

  function countFor(key: string): number {
    if (key === "everyone") return audiences.everyone;
    if (key === "families") return audiences.families;
    if (key === "coaches") return audiences.coaches;
    if (key.startsWith("team:")) {
      const id = key.slice(5);
      return audiences.teams.find((t) => t.id === id)?.count ?? 0;
    }
    return 0;
  }

  function parseAudience(key: string): { audience: BroadcastAudienceKind; teamId?: string } {
    if (key.startsWith("team:")) return { audience: "team", teamId: key.slice(5) };
    return { audience: key as BroadcastAudienceKind };
  }

  const count = countFor(audienceKey);

  function refresh() {
    startTransition(async () => {
      const r = await listBroadcastsAction(leagueId);
      if (r.ok) setItems(r.items);
    });
  }

  function send() {
    if (!title.trim() || !body.trim()) return;
    const noun = count === 1 ? "recipient" : "recipients";
    if (!globalThis.confirm(`Send this to ${count} ${noun}?`)) return;
    setMsg(null);
    const { audience, teamId } = parseAudience(audienceKey);
    startTransition(async () => {
      const r = await sendBroadcastAction(leagueId, { title, body, audience, teamId });
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      setTitle("");
      setBody("");
      setMsg({ kind: "success", text: `Sent to ${r.sent} ${r.sent === 1 ? "recipient" : "recipients"}.` });
      refresh();
    });
  }

  function sendTest() {
    if (!title.trim() || !body.trim()) return;
    setMsg(null);
    startTransition(async () => {
      const r = await sendBroadcastTestAction(leagueId, { title, body });
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      const emailPart = r.emailed
        ? `Test sent to ${r.email}`
        : "Couldn't email you (no address on file)";
      const pushPart =
        r.pushDelivered > 0
          ? " and pushed to your device"
          : r.pushConfigured
            ? " (no registered device to push to)"
            : " (push not set up here)";
      setMsg({ kind: "success", text: `${emailPart}${pushPart}.` });
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border p-4">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Audience</span>
          <select
            value={audienceKey}
            onChange={(e) => setAudienceKey(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="everyone">Everyone — families &amp; coaches ({audiences.everyone})</option>
            <option value="families">All families ({audiences.families})</option>
            <option value="coaches">Coaches ({audiences.coaches})</option>
            {audiences.teams.length > 0 ? (
              <optgroup label="A team's families + coach">
                {audiences.teams.map((t) => (
                  <option key={t.id} value={`team:${t.id}`}>
                    {t.name} ({t.count})
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>

        <label className="mt-3 block text-sm">
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
            disabled={pending || !title.trim() || !body.trim() || count === 0}
            onClick={send}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? "Sending…" : `Send to ${count} ${count === 1 ? "recipient" : "recipients"}`}
          </button>
          <button
            type="button"
            disabled={pending || !title.trim() || !body.trim()}
            onClick={sendTest}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
          >
            Send a test to myself
          </button>
          <span className="text-xs text-muted">
            Preview lands in your own email &amp; as a push to your device.
          </span>
        </div>
        {count === 0 ? (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            No reachable emails for that audience yet — families appear once they register; coaches
            once you add their email on the Teams page.
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
                  {b.audience} · {b.recipientCount} {b.recipientCount === 1 ? "recipient" : "recipients"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
