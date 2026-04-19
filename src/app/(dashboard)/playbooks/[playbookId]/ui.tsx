"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  FileText,
  Folders,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Printer,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import {
  archivePlayAction,
  createPlayAction,
  createPlaybookGroupAction,
  deletePlayAction,
  deletePlaybookGroupAction,
  duplicatePlayAction,
  renamePlayAction,
  renamePlaybookGroupAction,
  reorderPlaybookGroupsAction,
  setPlayGroupAction,
  type PlaybookDetailPlayRow,
} from "@/app/actions/plays";
import { listFormationsAction } from "@/app/actions/formations";
import type { SavedFormation } from "@/app/actions/formations";
import type { Player, Route, SportVariant } from "@/domain/play/types";
import { resolveEndDecoration, resolveRouteStroke, sportProfileForVariant, SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import { routeToRenderedSegments } from "@/domain/play/geometry";
import type { PlaybookGroupRow } from "@/domain/print/playbookPrint";
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  SegmentedControl,
  useToast,
  type ActionMenuItem,
} from "@/components/ui";

type GroupBy = "formation" | "group";

const UNASSIGNED = "__unassigned__";

type ThumbSize = "small" | "medium" | "large";

const SIZE_COL_CLASS: Record<ThumbSize, string> = {
  large: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  medium: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  small: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
};

export function PlaybookDetailClient({
  playbookId,
  sportVariant,
  initialPlays,
  initialGroups,
}: {
  playbookId: string;
  sportVariant: string;
  initialPlays: PlaybookDetailPlayRow[];
  initialGroups: PlaybookGroupRow[];
}) {
  const variant = sportVariant as SportVariant;
  const variantProfile = sportProfileForVariant(variant);
  const expectedPlayerCount = variantProfile.offensePlayerCount;
  const variantLabel = SPORT_VARIANT_LABELS[variant] ?? variant;
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");
  const [groupBy, setGroupBy] = useState<GroupBy>("formation");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [thumbSize, setThumbSize] = useState<ThumbSize>("medium");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [showManageGroups, setShowManageGroups] = useState(false);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Formation picker state
  const [showFormationPicker, setShowFormationPicker] = useState(false);
  const [availableFormations, setAvailableFormations] = useState<SavedFormation[]>([]);
  const [loadingFormations, setLoadingFormations] = useState(false);
  const [creating, setCreating] = useState(false);

  const viewed = initialPlays.filter((p) =>
    view === "archived" ? p.is_archived : !p.is_archived,
  );
  const filtered = viewed.filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      p.name.toLowerCase().includes(s) ||
      (p.wristband_code && p.wristband_code.toLowerCase().includes(s)) ||
      (p.shorthand && p.shorthand.toLowerCase().includes(s)) ||
      (p.concept && p.concept.toLowerCase().includes(s)) ||
      (p.formation_name && p.formation_name.toLowerCase().includes(s)) ||
      p.tags.some((t) => t.toLowerCase().includes(s))
    );
  });

  const groupById = useMemo(() => {
    const m = new Map<string, PlaybookGroupRow>();
    for (const g of initialGroups) m.set(g.id, g);
    return m;
  }, [initialGroups]);

  type Section = { key: string; label: string; plays: PlaybookDetailPlayRow[]; sortOrder: number };

  const sections: Section[] = useMemo(() => {
    const buckets = new Map<string, Section>();
    const pushInto = (key: string, label: string, sortOrder: number, p: PlaybookDetailPlayRow) => {
      const existing = buckets.get(key);
      if (existing) existing.plays.push(p);
      else buckets.set(key, { key, label, sortOrder, plays: [p] });
    };

    if (groupBy === "group") {
      // Always show every existing group (even if empty) plus an Ungrouped bucket,
      // so the user can drop plays onto empty groups.
      buckets.set(UNASSIGNED, { key: UNASSIGNED, label: "Ungrouped", plays: [], sortOrder: Number.POSITIVE_INFINITY });
      for (const g of initialGroups) {
        buckets.set(g.id, { key: g.id, label: g.name, plays: [], sortOrder: g.sort_order });
      }
    }

    for (const p of filtered) {
      if (groupBy === "formation") {
        const label = p.formation_name?.trim() || "Unassigned formation";
        pushInto(label.toLowerCase(), label, 0, p);
      } else {
        if (!p.group_id) pushInto(UNASSIGNED, "Ungrouped", Number.POSITIVE_INFINITY, p);
        else {
          const g = groupById.get(p.group_id);
          if (!g) pushInto(UNASSIGNED, "Ungrouped", Number.POSITIVE_INFINITY, p);
          else pushInto(p.group_id, g.name, g.sort_order, p);
        }
      }
    }

    const arr = Array.from(buckets.values());
    arr.sort((a, b) => {
      const aUn = a.key === UNASSIGNED;
      const bUn = b.key === UNASSIGNED;
      if (aUn !== bUn) return aUn ? 1 : -1;
      if (groupBy === "group") return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    });
    for (const s of arr) s.plays.sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));
    return arr;
  }, [filtered, groupBy, groupById, initialGroups]);

  // Scroll-spy: highlight the section nearest the top of the main area.
  useEffect(() => {
    if (sections.length === 0) {
      setActiveSection(null);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          const key = (visible[0].target as HTMLElement).dataset.sectionKey;
          if (key) setActiveSection(key);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );
    for (const el of sectionRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [sections]);

  function jumpToSection(key: string) {
    const el = sectionRefs.current.get(key);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top, behavior: "smooth" });
      setActiveSection(key);
    }
  }

  function openFormationPicker() {
    setShowFormationPicker(true);
    setLoadingFormations(true);
    listFormationsAction().then((res) => {
      if (res.ok) {
        setAvailableFormations(res.formations);
      }
      setLoadingFormations(false);
    });
  }

  async function createWithFormation(players?: Player[]) {
    setShowFormationPicker(false);
    setCreating(true);
    const res = await createPlayAction(playbookId, players);
    if (res.ok) {
      router.push(`/plays/${res.playId}/edit`);
    } else {
      setCreating(false);
      toast(res.error, "error");
    }
  }

  function handle<T>(fn: () => Promise<T>, onOk?: (r: T) => void) {
    startTransition(async () => {
      const res = await fn();
      if (res && typeof res === "object" && "ok" in res) {
        const r = res as { ok: boolean; error?: string };
        if (!r.ok) {
          toast(r.error ?? "Something went wrong.", "error");
          return;
        }
      }
      onOk?.(res);
      router.refresh();
    });
  }

  function onRenamePlay(id: string, current: string) {
    const next = window.prompt("Rename play", current);
    if (next == null) return;
    handle(() => renamePlayAction(id, next));
  }

  function onDropToGroup(groupKey: string, playId: string) {
    const target = groupKey === UNASSIGNED ? null : groupKey;
    handle(() => setPlayGroupAction(playId, target));
  }

  function confirmAnd(msg: string, fn: () => void) {
    if (window.confirm(msg)) fn();
  }

  return (
    <div className="space-y-4">
      {/* Slim top bar: search, print, new */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Input
            leftIcon={Search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, code, formation, tag…"
          />
        </div>
        <Link href={`/playbooks/${playbookId}/print`}>
          <Button variant="secondary" leftIcon={Printer}>
            Print playbook
          </Button>
        </Link>
        <Button
          variant="primary"
          leftIcon={Plus}
          loading={creating}
          onClick={openFormationPicker}
        >
          New play
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
        {/* Side rail */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-3">
            <SegmentedControl
              value={groupBy}
              onChange={(v) => setGroupBy(v as GroupBy)}
              options={[
                { value: "formation", label: "Formation" },
                { value: "group", label: "Group" },
              ]}
            />
            {groupBy === "group" && (
              <button
                type="button"
                onClick={() => setShowManageGroups(true)}
                className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-xs font-medium text-muted hover:border-primary hover:text-primary"
              >
                <Folders className="size-3.5" />
                Manage groups
              </button>
            )}

            <nav className="flex max-h-[55vh] flex-col gap-0.5 overflow-y-auto">
              {sections.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted">No sections</p>
              )}
              {sections.map((s) => {
                const active = activeSection === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => jumpToSection(s.key)}
                    className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-surface-inset"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    <span className="shrink-0 text-[10px] text-muted">
                      {s.plays.length}
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="border-t border-border pt-3">
              <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                <Settings2 className="size-3" /> View
              </div>
              <div className="flex flex-col gap-1.5">
                <SegmentedControl
                  size="sm"
                  value={viewMode}
                  onChange={(v) => setViewMode(v as "cards" | "list")}
                  options={[
                    { value: "cards", label: "Cards", icon: LayoutGrid },
                    { value: "list", label: "List", icon: List },
                  ]}
                />
                {viewMode === "cards" && (
                  <SegmentedControl
                    size="sm"
                    value={thumbSize}
                    onChange={(v) => setThumbSize(v as ThumbSize)}
                    options={[
                      { value: "small", label: "Sm" },
                      { value: "medium", label: "Md" },
                      { value: "large", label: "Lg" },
                    ]}
                  />
                )}
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <SegmentedControl
                size="sm"
                value={view}
                onChange={(v) => setView(v as "active" | "archived")}
                options={[
                  { value: "active", label: "Active" },
                  { value: "archived", label: "Archived" },
                ]}
              />
            </div>
          </div>
        </aside>

        {/* Main area */}
        <div className="min-w-0">
      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          heading="No plays yet"
          description="Create your first play to start designing routes and formations."
          action={
            <Button variant="primary" leftIcon={Plus} onClick={openFormationPicker} loading={creating}>
              New play
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {sections.map((section) => {
            const buildItems = (p: PlaybookDetailPlayRow): ActionMenuItem[] => [
              {
                label: "Rename",
                icon: Pencil,
                onSelect: () => onRenamePlay(p.id, p.name),
              },
              {
                label: "Duplicate",
                icon: Copy,
                onSelect: () =>
                  handle(
                    () => duplicatePlayAction(p.id),
                    (res) => {
                      if (res.ok) router.push(`/plays/${res.playId}/edit`);
                    },
                  ),
              },
              p.is_archived
                ? {
                    label: "Restore",
                    icon: ArchiveRestore,
                    onSelect: () => handle(() => archivePlayAction(p.id, false)),
                  }
                : {
                    label: "Archive",
                    icon: Archive,
                    onSelect: () => handle(() => archivePlayAction(p.id, true)),
                  },
              {
                label: "Delete",
                icon: Trash2,
                danger: true,
                onSelect: () =>
                  confirmAnd(
                    `Delete "${p.name}"? This can't be undone.`,
                    () => handle(() => deletePlayAction(p.id)),
                  ),
              },
            ];
            const isGroupSection = groupBy === "group";
            const isDropTarget = isGroupSection;
            const isNamedGroup = isGroupSection && section.key !== UNASSIGNED;
            const isDragOver = dragOverKey === section.key;
            return (
              <section
                key={section.key}
                data-section-key={section.key}
                ref={(el) => {
                  if (el) sectionRefs.current.set(section.key, el);
                  else sectionRefs.current.delete(section.key);
                }}
                className={`scroll-mt-20 space-y-3 rounded-lg transition-colors ${
                  isDropTarget ? "p-2 -m-2" : ""
                } ${isDragOver ? "bg-primary/10 outline outline-2 outline-primary/50" : ""}`}
                onDragOver={
                  isDropTarget
                    ? (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverKey !== section.key) setDragOverKey(section.key);
                      }
                    : undefined
                }
                onDragLeave={
                  isDropTarget
                    ? (e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDragOverKey((k) => (k === section.key ? null : k));
                        }
                      }
                    : undefined
                }
                onDrop={
                  isDropTarget
                    ? (e) => {
                        e.preventDefault();
                        const playId = e.dataTransfer.getData("text/play-id");
                        setDragOverKey(null);
                        if (playId) onDropToGroup(section.key, playId);
                      }
                    : undefined
                }
              >
                <div className="flex items-center gap-2 border-b border-border pb-1.5">
                  <h2 className="truncate text-sm font-semibold text-foreground">{section.label}</h2>
                  <Badge variant="default">{section.plays.length}</Badge>
                </div>
                {viewMode === "cards" && (
                  <div className={`grid gap-3 ${SIZE_COL_CLASS[thumbSize]}`}>

                    {section.plays.map((p) => (
                      <Card
                        key={`${section.key}:${p.id}`}
                        hover
                        className="relative flex cursor-grab flex-col p-0 active:cursor-grabbing"
                        draggable={isGroupSection}
                        onDragStart={
                          isGroupSection
                            ? (e) => {
                                e.dataTransfer.setData("text/play-id", p.id);
                                e.dataTransfer.effectAllowed = "move";
                              }
                            : undefined
                        }
                      >
                        <Link
                          href={`/plays/${p.id}/edit`}
                          className="flex flex-1 flex-col p-4"
                          aria-label={`Open ${p.name}`}
                        >
                          <div className="flex items-start gap-2 pr-16">
                            <h3 className="min-w-0 flex-1 truncate font-semibold text-foreground">
                              {p.name}
                            </h3>
                          </div>
                          {p.preview && (
                            <div className="mt-2">
                              <PlayPreview preview={p.preview} />
                            </div>
                          )}
                          <p className="mt-2 truncate text-xs text-muted">
                            {[p.formation_name, p.concept].filter(Boolean).join(" · ") ||
                              p.shorthand ||
                              "No details"}
                          </p>
                          {p.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {p.tags.map((t) => (
                                <Badge key={t} variant="default">
                                  {t}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </Link>
                        <div className="absolute right-2 top-2 flex items-center gap-1">
                          {p.wristband_code && (
                            <Badge variant="primary">{p.wristband_code}</Badge>
                          )}
                          <ActionMenu items={buildItems(p)} />
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
                {viewMode === "list" && (
                  <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
                    {section.plays.map((p) => (
                      <li
                        key={`${section.key}:${p.id}`}
                        className={`flex items-center gap-2 pl-8 pr-2 ${isGroupSection ? "cursor-grab active:cursor-grabbing" : ""}`}
                        draggable={isGroupSection}
                        onDragStart={
                          isGroupSection
                            ? (e) => {
                                e.dataTransfer.setData("text/play-id", p.id);
                                e.dataTransfer.effectAllowed = "move";
                              }
                            : undefined
                        }
                      >
                        <Link
                          href={`/plays/${p.id}/edit`}
                          className="flex min-w-0 flex-1 items-center gap-3 py-2 hover:opacity-80"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {p.name}
                          </span>
                          <span className="truncate text-xs text-muted">
                            {[p.formation_name, p.concept].filter(Boolean).join(" · ") ||
                              p.shorthand ||
                              ""}
                          </span>
                          {p.wristband_code && (
                            <Badge variant="primary">{p.wristband_code}</Badge>
                          )}
                          {p.tags.length > 0 && (
                            <div className="hidden flex-wrap gap-1 md:flex">
                              {p.tags.slice(0, 3).map((t) => (
                                <Badge key={t} variant="default">
                                  {t}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </Link>
                        <ActionMenu items={buildItems(p)} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
        </div>
      </div>

      {showManageGroups && (
        <ManageGroupsDialog
          playbookId={playbookId}
          initialGroups={initialGroups}
          onClose={() => {
            setShowManageGroups(false);
            router.refresh();
          }}
        />
      )}

      {/* Formation picker overlay */}
      {showFormationPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowFormationPicker(false);
          }}
        >
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface-raised shadow-elevated">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Choose a starting formation
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Pick a saved formation or start with the default.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-inset hover:text-foreground"
                onClick={() => setShowFormationPicker(false)}
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="p-6">
              {loadingFormations ? (
                <p className="text-center text-sm text-muted">Loading formations…</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <button
                    type="button"
                    className="flex flex-col items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-4 text-center transition-colors hover:border-primary hover:bg-primary/10"
                    onClick={() => createWithFormation()}
                  >
                    <MiniPlayerDiagram players={null} />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Default ({variantLabel})</p>
                      <p className="text-xs text-muted">Standard formation</p>
                    </div>
                  </button>

                  <Link
                    href={`/formations/new?variant=${variant}`}
                    className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface-inset p-4 text-center transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    <div className="flex size-20 items-center justify-center rounded-md bg-surface-raised text-muted">
                      <Plus className="size-7" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">New formation</p>
                      <p className="text-xs text-muted">Design from scratch</p>
                    </div>
                  </Link>

                  {availableFormations
                    .filter((f) => {
                      const fv = f.sportProfile?.variant as SportVariant | undefined;
                      if (fv) return fv === variant;
                      return f.players.length === expectedPlayerCount;
                    })
                    .map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface-inset p-4 text-center transition-colors hover:border-primary hover:bg-primary/5"
                      onClick={() => createWithFormation(f.players)}
                    >
                      <MiniPlayerDiagram players={f.players} />
                      <div>
                        <p className="text-sm font-semibold text-foreground">{f.displayName}</p>
                        <p className="text-xs text-muted">
                          {f.players.length} players
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ManageGroupsDialog({
  playbookId,
  initialGroups,
  onClose,
}: {
  playbookId: string;
  initialGroups: PlaybookGroupRow[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<PlaybookGroupRow[]>(
    [...initialGroups].sort((a, b) => a.sort_order - b.sort_order),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  async function addGroup() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const res = await createPlaybookGroupAction(playbookId, name);
    setBusy(false);
    if (!res.ok) { toast(res.error, "error"); return; }
    setGroups((g) => [...g, res.group]);
    setNewName("");
  }

  async function saveRename(id: string) {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    setBusy(true);
    const res = await renamePlaybookGroupAction(id, name);
    setBusy(false);
    if (!res.ok) { toast(res.error, "error"); return; }
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, name } : g)));
    setEditingId(null);
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this group? Plays in it become ungrouped.")) return;
    setBusy(true);
    const res = await deletePlaybookGroupAction(id);
    setBusy(false);
    if (!res.ok) { toast(res.error, "error"); return; }
    setGroups((gs) => gs.filter((g) => g.id !== id));
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = groups.findIndex((g) => g.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= groups.length) return;
    const reordered = [...groups];
    [reordered[idx], reordered[next]] = [reordered[next], reordered[idx]];
    setGroups(reordered.map((g, i) => ({ ...g, sort_order: i })));
    setBusy(true);
    const res = await reorderPlaybookGroupsAction(playbookId, reordered.map((g) => g.id));
    setBusy(false);
    if (!res.ok) toast(res.error, "error");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-bold text-foreground">Manage groups</h2>
          <button
            type="button"
            className="rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-1 p-4">
          {groups.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">No groups yet.</p>
          )}
          {groups.map((g, i) => (
            <div
              key={g.id}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-inset px-2 py-1.5"
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  disabled={busy || i === 0}
                  onClick={() => move(g.id, -1)}
                  className="rounded p-0.5 text-muted hover:bg-surface-raised hover:text-foreground disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busy || i === groups.length - 1}
                  onClick={() => move(g.id, 1)}
                  className="rounded p-0.5 text-muted hover:bg-surface-raised hover:text-foreground disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ArrowDown className="size-3.5" />
                </button>
              </div>
              {editingId === g.id ? (
                <>
                  <Input
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(g.id);
                      else if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => saveRename(g.id)}
                    className="rounded p-1 text-primary hover:bg-primary/10"
                    aria-label="Save"
                  >
                    <Check className="size-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm text-foreground">{g.name}</span>
                  <button
                    type="button"
                    onClick={() => { setEditingId(g.id); setEditName(g.name); }}
                    className="rounded p-1 text-muted hover:bg-surface-raised hover:text-foreground"
                    aria-label="Rename"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(g.id)}
                className="rounded p-1 text-muted hover:bg-surface-raised hover:text-rose-500"
                aria-label="Delete"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <Input
            placeholder="New group name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addGroup(); }}
            className="flex-1"
          />
          <Button size="sm" leftIcon={Plus} onClick={addGroup} loading={busy}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

function PlayPreview({
  preview,
}: {
  preview: { players: Player[]; routes: Route[]; lineOfScrimmageY: number };
}) {
  // Render in normalized 0-1 field coords (same as editor) so zigzag,
  // curves, dashes and end decorations match the edited play exactly.
  const R = 0.032;

  // Compute bbox over every player + every route node, then stretch the
  // bbox to a fixed-aspect display area so all thumbnails are the same size.
  const PAD = R * 1.4;
  let minX = Infinity;
  let maxX = -Infinity;
  let minSvgY = Infinity;
  let maxSvgY = -Infinity;
  for (const p of preview.players) {
    if (p.position.x < minX) minX = p.position.x;
    if (p.position.x > maxX) maxX = p.position.x;
    const sy = 1 - p.position.y;
    if (sy < minSvgY) minSvgY = sy;
    if (sy > maxSvgY) maxSvgY = sy;
  }
  for (const r of preview.routes) {
    for (const n of r.nodes) {
      if (n.position.x < minX) minX = n.position.x;
      if (n.position.x > maxX) maxX = n.position.x;
      const sy = 1 - n.position.y;
      if (sy < minSvgY) minSvgY = sy;
      if (sy > maxSvgY) maxSvgY = sy;
    }
  }
  if (!isFinite(minSvgY) || !isFinite(maxSvgY) || !isFinite(minX) || !isFinite(maxX)) {
    minX = 0;
    maxX = 1;
    minSvgY = 0.22;
    maxSvgY = 0.78;
  }
  // Always include LOS (svgY = 1 - lineOfScrimmageY) through 10yd downfield
  // so the faint yard guides stay in frame.
  const losSvgY = 1 - preview.lineOfScrimmageY;
  const tenSvgY = 1 - (preview.lineOfScrimmageY + 0.40);
  minSvgY = Math.min(minSvgY, tenSvgY);
  maxSvgY = Math.max(maxSvgY, losSvgY);

  let vbX = Math.max(0, minX - PAD);
  let vbW = Math.min(1, maxX + PAD) - vbX;
  let vbY = Math.max(0, minSvgY - PAD);
  let vbH = Math.min(1, maxSvgY + PAD) - vbY;

  // Pad the bbox to a fixed 16:10 tile so every thumbnail is the same size.
  // Narrower content → pad width; taller → pad height.
  const TARGET = 16 / 10;
  const currentAspect = vbW / vbH;
  if (currentAspect < TARGET) {
    const needed = vbH * TARGET;
    const extra = needed - vbW;
    vbX = Math.max(0, vbX - extra / 2);
    vbW = Math.min(1 - vbX, needed);
  } else if (currentAspect > TARGET) {
    const needed = vbW / TARGET;
    const extra = needed - vbH;
    vbY = Math.max(0, vbY - extra / 2);
    vbH = Math.min(1 - vbY, needed);
  }

  const aspect = vbW / vbH;
  // Screen-space scaleY/scaleX ratio after preserveAspectRatio="none". Used
  // below to counter-scale player shapes so circles stay round.
  const sxCorr = aspect / TARGET;
  // Faint yard-guide positions in SVG-y (y-down).
  const losY = 1 - preview.lineOfScrimmageY;
  const fiveY = 1 - (preview.lineOfScrimmageY + 0.20);
  const tenY = 1 - (preview.lineOfScrimmageY + 0.40);

  return (
    <div className="aspect-[16/10] w-full overflow-hidden rounded-lg border border-border bg-surface-inset">
    <svg
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
    >
      <g>
        <line x1={vbX} x2={vbX + vbW} y1={losY} y2={losY} stroke="rgba(100,116,139,0.45)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
        <line x1={vbX} x2={vbX + vbW} y1={fiveY} y2={fiveY} stroke="rgba(100,116,139,0.3)" strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        <line x1={vbX} x2={vbX + vbW} y1={tenY} y2={tenY} stroke="rgba(100,116,139,0.3)" strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        {preview.routes.map((r) => {
          const rendered = routeToRenderedSegments(r);
          const stroke = resolveRouteStroke(r, preview.players);
          return (
            <g key={r.id}>
              {rendered.map((rs) => (
                <path
                  key={rs.segmentId}
                  d={rs.d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={1.8}
                  strokeDasharray={rs.dash}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          );
        })}
        {preview.routes.map((r) => {
          const decoration = resolveEndDecoration(r);
          if (decoration === "none") return null;
          const fromIds = new Set(r.segments.map((s) => s.fromNodeId));
          const terminals = r.segments.filter((s) => !fromIds.has(s.toNodeId));
          const stroke = resolveRouteStroke(r, preview.players);
          return (
            <g key={`deco-${r.id}`}>
              {terminals.map((seg) => {
                const fromNode = r.nodes.find((n) => n.id === seg.fromNodeId);
                const toNode = r.nodes.find((n) => n.id === seg.toNodeId);
                if (!fromNode || !toNode) return null;
                const dirFromX = seg.shape === "curve" && seg.controlOffset
                  ? seg.controlOffset.x
                  : fromNode.position.x;
                const dirFromY = seg.shape === "curve" && seg.controlOffset
                  ? seg.controlOffset.y
                  : fromNode.position.y;
                const tipX = toNode.position.x;
                const tipY = 1 - toNode.position.y;
                const fromX = dirFromX;
                const fromY = 1 - dirFromY;
                const dxS = tipX - fromX;
                const dyS = tipY - fromY;
                const len = Math.hypot(dxS, dyS);
                if (len < 1e-4) return null;
                const ux = dxS / len;
                const uy = dyS / len;
                if (decoration === "arrow") {
                  const arrowLen = 0.05;
                  const cosA = Math.cos(Math.PI / 6);
                  const sinA = Math.sin(Math.PI / 6);
                  const bx = -ux;
                  const by = -uy;
                  const r1x = cosA * bx - sinA * by;
                  const r1y = sinA * bx + cosA * by;
                  const r2x = cosA * bx + sinA * by;
                  const r2y = -sinA * bx + cosA * by;
                  const p1x = tipX + arrowLen * r1x;
                  const p1y = tipY + arrowLen * r1y;
                  const p2x = tipX + arrowLen * r2x;
                  const p2y = tipY + arrowLen * r2y;
                  return (
                    <polygon
                      key={seg.id}
                      points={`${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`}
                      fill={stroke}
                      stroke={stroke}
                      strokeWidth={0.8}
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                }
                if (decoration === "t") {
                  const halfLen = 0.028;
                  const perpX = -uy;
                  const perpY = ux;
                  return (
                    <line key={seg.id} x1={tipX + perpX * halfLen} y1={tipY + perpY * halfLen} x2={tipX - perpX * halfLen} y2={tipY - perpY * halfLen} stroke={stroke} strokeWidth={1.8} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  );
                }
                return null;
              })}
            </g>
          );
        })}
        {preview.players.map((p) => {
          const cx = p.position.x;
          const cy = 1 - p.position.y;
          const shape = p.shape ?? "circle";
          const fill = p.style.fill;
          const strokeColor = p.style.stroke;
          const common = { fill, stroke: strokeColor, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };
          // Shape drawn at origin, counter-scaled in x to undo the
          // preserveAspectRatio="none" stretch so circles stay round.
          let shapeEl: React.ReactNode;
          if (shape === "square") {
            shapeEl = <rect x={-R} y={-R} width={R * 2} height={R * 2} {...common} />;
          } else if (shape === "diamond") {
            shapeEl = <polygon points={`0,${-R} ${R},0 0,${R} ${-R},0`} {...common} />;
          } else if (shape === "triangle") {
            shapeEl = <polygon points={`0,${-R} ${R},${R} ${-R},${R}`} {...common} />;
          } else if (shape === "star") {
            const outer = R * 1.15;
            const inner = outer * 0.45;
            const pts = Array.from({ length: 10 }, (_, i) => {
              const angle = -Math.PI / 2 + (i * Math.PI) / 5;
              const rad = i % 2 === 0 ? outer : inner;
              return `${rad * Math.cos(angle)},${rad * Math.sin(angle)}`;
            }).join(" ");
            shapeEl = <polygon points={pts} strokeLinejoin="round" {...common} />;
          } else {
            shapeEl = <circle cx={0} cy={0} r={R} {...common} />;
          }
          return (
            <g key={p.id} transform={`translate(${cx} ${cy}) scale(${sxCorr} 1)`}>
              {shapeEl}
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={0.035}
                fontWeight={700}
                fill={p.style.labelColor}
                style={{ fontFamily: "Inter, system-ui, sans-serif" }}
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
    </div>
  );
}

function MiniPlayerDiagram({ players }: { players: Player[] | null }) {
  const SIZE = 80;
  const DOT_R = 4;

  if (!players) {
    return (
      <svg width={SIZE} height={SIZE} viewBox="0 0 80 80" className="opacity-60">
        <rect width={80} height={80} rx={6} fill="#2D8B4E" />
        {[
          [40, 68], [40, 58], [22, 48], [40, 48], [58, 48], [12, 36], [68, 36],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={DOT_R} fill="#FFFFFF" />
        ))}
      </svg>
    );
  }

  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 80 80">
      <rect width={80} height={80} rx={6} fill="#2D8B4E" />
      {players.map((pl) => {
        const cx = pl.position.x * SIZE;
        const cy = (1 - pl.position.y) * SIZE;
        return (
          <circle
            key={pl.id}
            cx={cx}
            cy={cy}
            r={DOT_R}
            fill={pl.style.fill}
            stroke={pl.style.stroke}
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
}
