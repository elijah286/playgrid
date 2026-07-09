"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Layers, Plus, X } from "lucide-react";

import {
  getSourcePlaybookPreviewsAction,
  registerLibraryItemAction,
  removeLibraryItemAction,
  setLibraryDefaultAction,
} from "@/app/actions/league-library";
import type {
  LibraryDefault,
  LibraryItem,
  LibraryItemKind,
  LibraryItemPreview,
  LibrarySourcePlaybook,
  SourcePlaybookPreviews,
} from "@/lib/league/library";
import { PlanTimeline, PlayThumbStrip } from "./LibraryPreview";

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
  previews,
}: {
  initialItems: LibraryItem[];
  initialDefaults: LibraryDefault[];
  sources: LibrarySourcePlaybook[];
  leagues: { id: string; name: string }[];
  previews: LibraryItemPreview[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [defaults, setDefaults] = useState(initialDefaults);
  const [tagFilter, setTagFilter] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [, startTransition] = useTransition();

  // Server refresh (router.refresh after an add) re-delivers props; sync the
  // local working copies so new items appear without a hard reload.
  useEffect(() => setItems(initialItems), [initialItems]);
  useEffect(() => setDefaults(initialDefaults), [initialDefaults]);

  const previewByItem = useMemo(
    () => new Map(previews.map((p) => [p.itemId, p])),
    [previews],
  );
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
        return on
          ? [...without, { id: `local-${item.id}-${leagueId}`, itemId: item.id, leagueId }]
          : without;
      });
    });
  }

  return (
    <div className="space-y-6">
      {/* toolbar: tag filter + add */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {allTags.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setTagFilter("")}
                className={`rounded-full border px-2.5 py-1 ${tagFilter === "" ? "border-primary text-primary" : "border-border text-muted"}`}
              >
                All
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTagFilter(t)}
                  className={`rounded-full border px-2.5 py-1 ${tagFilter === t ? "border-primary text-primary" : "border-border text-muted"}`}
                >
                  {t}
                </button>
              ))}
            </>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          <Plus className="size-4" />
          Add from my playbooks
        </button>
      </div>

      {err ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-800">
          {err}
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border px-6 py-12 text-center">
          <Layers className="mx-auto size-8 text-muted" />
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">
            Your library is empty. Build play groups and practice plans in your own playbooks,
            then add them here — every diagram shows exactly what a team receives.
          </p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Add your first item
          </button>
        </div>
      ) : (
        byVariant.map(([variant, list]) => (
          <div key={variant}>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              {VARIANT_LABEL[variant] ?? variant}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {list.map((item) => (
                <LibraryItemCard
                  key={item.id}
                  item={item}
                  preview={previewByItem.get(item.id)}
                  defaults={defaults.filter((d) => d.itemId === item.id)}
                  leagues={leagues}
                  onRemove={() => remove(item.id)}
                  onToggleDefault={(leagueId, on) => toggleDefault(item, leagueId, on)}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {addOpen ? (
        <AddToLibraryDialog
          sources={sources}
          items={items}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function LibraryItemCard({
  item,
  preview,
  defaults,
  leagues,
  onRemove,
  onToggleDefault,
}: {
  item: LibraryItem;
  preview: LibraryItemPreview | undefined;
  defaults: LibraryDefault[];
  leagues: { id: string; name: string }[];
  onRemove: () => void;
  onToggleDefault: (leagueId: string | null, on: boolean) => void;
}) {
  const orgWide = defaults.some((d) => d.leagueId === null);
  const isPlan = item.kind === "practice_plan";

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-foreground">{item.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="flex items-center gap-1 rounded-full bg-surface-inset px-2 py-0.5 text-muted">
              {isPlan ? <CalendarClock className="size-3" /> : <Layers className="size-3" />}
              {isPlan ? "Practice plan" : "Play group"}
            </span>
            {item.tags.map((t) => (
              <span key={t} className="rounded-full border border-border px-2 py-0.5 text-muted">
                {t}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          title="Remove from library"
          className="rounded-lg border border-border p-1.5 text-muted hover:bg-foreground/5 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="mt-3">
        {isPlan && preview?.plan ? (
          <div className="space-y-3">
            <PlanTimeline
              blocks={preview.plan.blocks}
              totalDurationMinutes={preview.plan.totalDurationMinutes}
            />
            {preview.plays.length > 0 ? (
              <PlayThumbStrip
                plays={preview.plays}
                totalPlays={preview.plays.length}
                max={4}
                size="sm"
              />
            ) : null}
          </div>
        ) : (
          <PlayThumbStrip plays={preview?.plays ?? []} totalPlays={preview?.totalPlays ?? 0} />
        )}
      </div>

      <div className="mt-2 text-xs text-muted">
        {isPlan && preview?.plan
          ? `${preview.plan.totalDurationMinutes} min · ${preview.plan.blocks.length} blocks`
          : `${preview?.totalPlays ?? 0} plays`}
        {preview && preview.teamsReached > 0 ? (
          <> · sent to {preview.teamsReached} team{preview.teamsReached === 1 ? "" : "s"}</>
        ) : null}
      </div>

      {/* seeding rules */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs">
        <span className="font-medium text-foreground">Seeds new teams:</span>
        <label className="flex items-center gap-1.5 text-foreground">
          <input
            type="checkbox"
            checked={orgWide}
            onChange={(e) => onToggleDefault(null, e.target.checked)}
            className="size-3.5"
          />
          All leagues ({VARIANT_LABEL[item.variant] ?? item.variant})
        </label>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onToggleDefault(e.target.value, true);
          }}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground"
        >
          <option value="">+ league…</option>
          {leagues
            .filter((l) => !defaults.some((dd) => dd.leagueId === l.id))
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </select>
        {defaults
          .filter((dd) => dd.leagueId !== null)
          .map((dd) => (
            <button
              key={dd.id}
              type="button"
              onClick={() => onToggleDefault(dd.leagueId, false)}
              title="Remove this league default"
              className="rounded-full bg-surface-inset px-2 py-0.5 text-muted hover:text-foreground"
            >
              {leagues.find((l) => l.id === dd.leagueId)?.name ?? "League"} ✕
            </button>
          ))}
      </div>
    </div>
  );
}

/**
 * Visual "Add to library" picker: choose a playbook, see its play groups and
 * practice plans with real diagrams, pick one, name + tag it. What you see
 * is what teams get.
 */
function AddToLibraryDialog({
  sources,
  items,
  onClose,
  onAdded,
}: {
  sources: LibrarySourcePlaybook[];
  items: LibraryItem[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [srcPb, setSrcPb] = useState(sources.length === 1 ? sources[0].playbookId : "");
  const [previews, setPreviews] = useState<SourcePlaybookPreviews | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<{ kind: LibraryItemKind; id: string } | null>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedPb = sources.find((p) => p.playbookId === srcPb) ?? null;
  const registeredGroups = useMemo(
    () => new Set(items.map((i) => i.sourceGroupId).filter(Boolean) as string[]),
    [items],
  );
  const registeredPlans = useMemo(
    () => new Set(items.map((i) => i.sourcePracticePlanId).filter(Boolean) as string[]),
    [items],
  );

  useEffect(() => {
    if (!srcPb) {
      setPreviews(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPreviews(null);
    getSourcePlaybookPreviewsAction(srcPb).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) setPreviews(res.previews);
      else setErr(res.error ?? "Could not load previews.");
    });
    return () => {
      cancelled = true;
    };
  }, [srcPb]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);

  function pick(kind: LibraryItemKind, id: string, fallbackTitle: string) {
    setSelected({ kind, id });
    setTitle((t) => (t.trim() ? t : fallbackTitle));
  }

  function add() {
    if (!selectedPb || !selected) return;
    startTransition(async () => {
      const res = await registerLibraryItemAction({
        kind: selected.kind,
        sourcePlaybookId: selectedPb.playbookId,
        sourceId: selected.id,
        title: title.trim() || "Untitled",
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      if (!res.ok) {
        setErr(res.error ?? "Something went wrong.");
        return;
      }
      onAdded();
    });
  }

  const inputCls =
    "rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Add to library">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-4 top-[6vh] bottom-[6vh] mx-auto flex max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-foreground">Add to library</div>
            <div className="text-xs text-muted">
              Pick a play group or practice plan from one of your playbooks.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border p-1.5 text-muted hover:bg-foreground/5"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <select
            value={srcPb}
            onChange={(e) => {
              setSrcPb(e.target.value);
              setSelected(null);
            }}
            className={`${inputCls} w-full`}
          >
            <option value="">Choose a playbook…</option>
            {sources.map((p) => (
              <option key={p.playbookId} value={p.playbookId}>
                {p.playbookName} ({VARIANT_LABEL[p.variant] ?? p.variant})
              </option>
            ))}
          </select>

          {loading ? (
            <div className="mt-6 text-center text-sm text-muted">Loading previews…</div>
          ) : null}

          {selectedPb && !loading ? (
            <div className="mt-4 space-y-4">
              {selectedPb.groups.length === 0 && selectedPb.practicePlans.length === 0 ? (
                <p className="text-sm text-muted">
                  This playbook has no named play groups or practice plans yet.
                </p>
              ) : null}

              {selectedPb.groups.map((g) => {
                const gp = previews?.groups[g.id];
                const inLibrary = registeredGroups.has(g.id);
                const isSel = selected?.kind === "play_group" && selected.id === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    disabled={inLibrary}
                    onClick={() => pick("play_group", g.id, g.name)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      isSel
                        ? "border-primary ring-1 ring-primary"
                        : inLibrary
                          ? "border-border opacity-50"
                          : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-foreground">
                        {g.name}
                        <span className="ml-2 text-xs font-normal text-muted">
                          {g.playCount} plays
                        </span>
                      </span>
                      {inLibrary ? (
                        <span className="rounded-full bg-surface-inset px-2 py-0.5 text-[11px] text-muted">
                          In library
                        </span>
                      ) : null}
                    </div>
                    {gp ? (
                      <div className="mt-2">
                        <PlayThumbStrip plays={gp.plays} totalPlays={gp.totalPlays} max={4} size="sm" />
                      </div>
                    ) : null}
                  </button>
                );
              })}

              {selectedPb.practicePlans.map((p) => {
                const pp = previews?.plans[p.id];
                const inLibrary = registeredPlans.has(p.id);
                const isSel = selected?.kind === "practice_plan" && selected.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={inLibrary}
                    onClick={() => pick("practice_plan", p.id, p.title)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      isSel
                        ? "border-primary ring-1 ring-primary"
                        : inLibrary
                          ? "border-border opacity-50"
                          : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-foreground">
                        {p.title}
                        {pp ? (
                          <span className="ml-2 text-xs font-normal text-muted">
                            {pp.totalDurationMinutes} min · {pp.blocks.length} blocks
                          </span>
                        ) : null}
                      </span>
                      {inLibrary ? (
                        <span className="rounded-full bg-surface-inset px-2 py-0.5 text-[11px] text-muted">
                          In library
                        </span>
                      ) : null}
                    </div>
                    {pp ? (
                      <div className="mt-2">
                        <PlanTimeline
                          blocks={pp.blocks}
                          totalDurationMinutes={pp.totalDurationMinutes}
                        />
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {err ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-800">
              {err}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Library title"
            className={`${inputCls} min-w-0 flex-1`}
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Tags, comma-separated"
            className={`${inputCls} min-w-0 flex-1`}
          />
          <button
            type="button"
            disabled={!selected || pending}
            onClick={add}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add to library"}
          </button>
        </div>
      </div>
    </div>
  );
}
