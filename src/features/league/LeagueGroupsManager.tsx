"use client";

import { useState, useTransition } from "react";

import {
  addLeagueToGroupAction,
  createLeagueGroupAction,
  deleteLeagueGroupAction,
  listLeagueGroupsAction,
  removeLeagueFromGroupAction,
  sendGroupBroadcastAction,
  type LeagueGroup,
  type GroupAudienceKind,
} from "@/app/actions/league-groups";

type Msg = { kind: "error" | "success"; text: string } | null;

export function LeagueGroupsManager({
  leagues,
  initialGroups,
}: {
  leagues: { id: string; name: string }[];
  initialGroups: LeagueGroup[];
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [newName, setNewName] = useState("");
  const [composing, setComposing] = useState<string | null>(null);
  const [compose, setCompose] = useState<{ title: string; body: string; audience: GroupAudienceKind }>({
    title: "",
    body: "",
    audience: "everyone",
  });
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const g = await listLeagueGroupsAction();
      setGroups(g);
    });
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) {
    setMsg(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error ?? "Something went wrong." });
        return;
      }
      if (okText) setMsg({ kind: "success", text: okText });
      refresh();
    });
  }

  function sendGroup(groupId: string) {
    if (!compose.title.trim() || !compose.body.trim()) return;
    setMsg(null);
    startTransition(async () => {
      const r = await sendGroupBroadcastAction(groupId, compose);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      setCompose({ title: "", body: "", audience: "everyone" });
      setComposing(null);
      setMsg({
        kind: "success",
        text: `Sent to ${r.sent} recipients across ${r.leagues} ${r.leagues === 1 ? "league" : "leagues"}.`,
      });
      refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New group — e.g. Waco, TX"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          disabled={pending || !newName.trim()}
          onClick={() =>
            run(() => createLeagueGroupAction(newName), undefined)
          }
          className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          Add group
        </button>
      </div>

      {msg ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ring-1 ${
            msg.kind === "error"
              ? "bg-amber-50 text-amber-950 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-800"
              : "bg-emerald-50 text-emerald-950 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-50 dark:ring-emerald-800"
          }`}
        >
          {msg.text}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <p className="text-sm text-muted">
          No groups yet. Group leagues (e.g. by city) to message them all at once.
        </p>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => {
            const inGroup = new Set(g.leagues.map((l) => l.id));
            const addable = leagues.filter((l) => !inGroup.has(l.id));
            return (
              <li key={g.id} className="rounded-2xl border border-border bg-surface-raised p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-foreground">{g.name}</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={pending || g.leagues.length === 0}
                      onClick={() => {
                        setComposing(composing === g.id ? null : g.id);
                        setMsg(null);
                      }}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-40"
                    >
                      {composing === g.id ? "Cancel" : "Message group"}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (globalThis.confirm(`Delete the group "${g.name}"?`))
                          run(() => deleteLeagueGroupAction(g.id), "Group deleted.");
                      }}
                      className="rounded-md px-1.5 text-xs text-muted hover:text-foreground"
                      aria-label="Delete group"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {g.leagues.length === 0 ? (
                    <span className="text-xs text-muted">No leagues in this group.</span>
                  ) : (
                    g.leagues.map((l) => (
                      <span
                        key={l.id}
                        className="inline-flex items-center gap-1 rounded-full bg-surface-inset px-2 py-0.5 text-xs text-foreground"
                      >
                        {l.name}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => removeLeagueFromGroupAction(g.id, l.id))}
                          className="text-muted hover:text-foreground"
                          aria-label={`Remove ${l.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                  {addable.length > 0 ? (
                    <select
                      value=""
                      disabled={pending}
                      onChange={(e) => {
                        if (e.target.value) run(() => addLeagueToGroupAction(g.id, e.target.value));
                      }}
                      className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
                    >
                      <option value="">+ Add a league…</option>
                      {addable.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>

                {composing === g.id ? (
                  <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
                    <select
                      value={compose.audience}
                      onChange={(e) =>
                        setCompose({ ...compose, audience: e.target.value as GroupAudienceKind })
                      }
                      className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                      <option value="everyone">Everyone — families &amp; coaches</option>
                      <option value="families">All families</option>
                      <option value="coaches">Coaches</option>
                    </select>
                    <input
                      value={compose.title}
                      onChange={(e) => setCompose({ ...compose, title: e.target.value })}
                      placeholder="Subject"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                    <textarea
                      value={compose.body}
                      onChange={(e) => setCompose({ ...compose, body: e.target.value })}
                      rows={4}
                      placeholder={`Message to every league in ${g.name}…`}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={pending || !compose.title.trim() || !compose.body.trim()}
                      onClick={() => sendGroup(g.id)}
                      className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
                    >
                      {pending ? "Sending…" : "Send to group"}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
