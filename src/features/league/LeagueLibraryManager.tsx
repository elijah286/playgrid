"use client";

import { useMemo, useState, useTransition } from "react";

import {
  registerLibraryItemAction,
  removeLibraryItemAction,
  setLibraryDefaultAction,
} from "@/app/actions/league-library";
import type {
  LibraryDefault,
  LibraryItem,
  LibraryItemKind,
  LibrarySourcePlaybook,
} from "@/lib/league/library";

const VARIANT_LABEL: Record<string, string> = {
  flag_4v4: "Flag 4v4",
  flag_5v5: "Flag 5v5",
  flag_6v6: "Flag 6v6",
  flag_7v7: "Flag 7v7",
  touch_7v7: "Touch 7v7",
  tackle_11: "Tackle 11v11",
  other: "Custom",
};

export function LeagueLibraryManager({
  initialItems,
  initialDefaults,
  sources,
  leagues,
}: {
  initialItems: LibraryItem[];
  initialDefaults: LibraryDefault[];
  sources: LibrarySourcePlaybook[];
  leagues: { id: string; name: string }[];
}) {
  const [items, setItems] = useState(initialItems);
  const [defaults, setDefaults] = useState(initialDefaults);
  const [tagFilter, setTagFilter] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // add form
  const [srcPb, setSrcPb] = useState("");
  const [srcId, setSrcId] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");

  const selectedPb = sources.find((p) => p.playbookId === srcPb) ?? null;
  const allTags = useMemo(() => [...new Set(items.flatMap((i) => i.tags))].sort(), [items]);
  const visible = tagFilter ? items.filter((i) => i.tags.includes(tagFilter)) : items;
  const byVariant = useMemo(() => {
    const m = new Map<string, LibraryItem[]>();
    for (const i of visible) m.set(i.variant, [...(m.get(i.variant) ?? []), i]);
    return [...m.entries()];
  }, [visible]);

  function refreshFrom(res: { ok: boolean; error?: string }) {
    if (!res.ok) {
      setErr(res.error ?? "Something went wrong.");
      return false;
    }
    setErr(null);
    return true;
  }

  function add() {
    if (!selectedPb || !srcId) return;
    const [kind, id] = srcId.split(":") as [LibraryItemKind, string];
    const fallback =
      kind === "play_group"
        ? selectedPb.groups.find((g) => g.id === id)?.name
        : selectedPb.practicePlans.find((p) => p.id === id)?.title;
    startTransition(async () => {
      const res = await registerLibraryItemAction({
        kind,
        sourcePlaybookId: selectedPb.playbookId,
        sourceId: id,
        title: title.trim() || fallback || "Untitled",
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      if (refreshFrom(res)) {
        setTitle("");
        setTags("");
        setSrcId("");
        globalThis.location.reload();
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await removeLibraryItemAction(id);
      if (refreshFrom(res)) setItems((prev) => prev.filter((i) => i.id !== id));
    });
  }

  function toggleDefault(item: LibraryItem, leagueId: string | null, on: boolean) {
    startTransition(async () => {
      const res = await setLibraryDefaultAction(item.id, leagueId, on);
      if (!refreshFrom(res)) return;
      setDefaults((prev) => {
        const without = prev.filter((d) => !(d.itemId === item.id && d.leagueId === leagueId));
        return on ? [...without, { id: `local-${item.id}-${leagueId}`, itemId: item.id, leagueId }] : without;
      });
    });
  }

  const inputCls =
    "rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="space-y-5">
      {/* add from my playbooks */}
      <div className="rounded-2xl border border-border bg-surface-raised p-4">
        <div className="text-sm font-semibold text-foreground">Add to library</div>
        <p className="mt-0.5 text-xs text-muted">
          Pick a play group or practice plan from one of your playbooks. The game type comes from
          the playbook.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select value={srcPb} onChange={(e) => { setSrcPb(e.target.value); setSrcId(""); }} className={inputCls}>
            <option value="">Choose a playbook…</option>
            {sources.map((p) => (
              <option key={p.playbookId} value={p.playbookId}>
                {p.playbookName} ({VARIANT_LABEL[p.variant] ?? p.variant})
              </option>
            ))}
          </select>
          <select value={srcId} onChange={(e) => setSrcId(e.target.value)} disabled={!selectedPb} className={inputCls}>
            <option value="">Choose content…</option>
            {selectedPb?.groups.map((g) => (
              <option key={g.id} value={`play_group:${g.id}`}>
                Play group: {g.name} ({g.playCount} plays)
              </option>
            ))}
            {selectedPb?.practicePlans.map((p) => (
              <option key={p.id} value={`practice_plan:${p.id}`}>
                Practice plan: {p.title}
              </option>
            ))}
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Library title (optional)" className={inputCls} />
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma-separated (new coaches, advanced…)" className={inputCls} />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!srcId}
            onClick={add}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            Add to library
          </button>
        </div>
      </div>

      {err ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-800">{err}</p>
      ) : null}

      {/* tag filter */}
      {allTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button type="button" onClick={() => setTagFilter("")} className={`rounded-full border px-2.5 py-1 ${tagFilter === "" ? "border-primary text-primary" : "border-border text-muted"}`}>
            All
          </button>
          {allTags.map((t) => (
            <button key={t} type="button" onClick={() => setTagFilter(t)} className={`rounded-full border px-2.5 py-1 ${tagFilter === t ? "border-primary text-primary" : "border-border text-muted"}`}>
              {t}
            </button>
          ))}
        </div>
      ) : null}

      {/* items grouped by game type */}
      {items.length === 0 ? (
        <p className="rounded-2xl border border-border px-4 py-8 text-center text-sm text-muted">
          Your library is empty. Build plays and practice plans in your playbooks, then register
          the groups you want to distribute to teams.
        </p>
      ) : (
        byVariant.map(([variant, list]) => (
          <div key={variant}>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              {VARIANT_LABEL[variant] ?? variant}
            </div>
            <div className="space-y-2">
              {list.map((item) => {
                const itemDefaults = defaults.filter((d) => d.itemId === item.id);
                const orgWide = itemDefaults.some((d) => d.leagueId === null);
                return (
                  <div key={item.id} className="rounded-2xl border border-border bg-surface-raised p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground">{item.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="rounded-full bg-surface-inset px-2 py-0.5 text-muted">
                            {item.kind === "play_group" ? "Play group" : "Practice plan"}
                          </span>
                          {item.tags.map((t) => (
                            <span key={t} className="rounded-full border border-border px-2 py-0.5 text-muted">{t}</span>
                          ))}
                        </div>
                      </div>
                      <button type="button" onClick={() => remove(item.id)} className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:bg-foreground/5">
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-xs">
                      <label className="flex items-center gap-1.5 text-foreground">
                        <input type="checkbox" checked={orgWide} onChange={(e) => toggleDefault(item, null, e.target.checked)} className="size-3.5" />
                        Default for new {VARIANT_LABEL[item.variant] ?? item.variant} teams (all leagues)
                      </label>
                      <select
                        value=""
                        onChange={(e) => { if (e.target.value) toggleDefault(item, e.target.value, true); }}
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground"
                      >
                        <option value="">+ league default…</option>
                        {leagues
                          .filter((l) => !itemDefaults.some((dd) => dd.leagueId === l.id))
                          .map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                      </select>
                      {itemDefaults
                        .filter((dd) => dd.leagueId !== null)
                        .map((dd) => (
                          <button
                            key={dd.id}
                            type="button"
                            onClick={() => toggleDefault(item, dd.leagueId, false)}
                            title="Remove this league default"
                            className="rounded-full bg-surface-inset px-2 py-0.5 text-muted hover:text-foreground"
                          >
                            {leagues.find((l) => l.id === dd.leagueId)?.name ?? "League"} ✕
                          </button>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
