"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Crown,
  FileText,
  Folders,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Search,
  Settings2,
  SlidersHorizontal,
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
import { PlaybookFormationsTab } from "./PlaybookFormationsTab";
import type { Player, PlayType, Route, SpecialTeamsUnit, SportVariant, Zone } from "@/domain/play/types";
import {
  defaultDefendersForVariant,
  defaultPlayersForVariant,
  defenseTemplatesForVariant,
  resolveEndDecoration,
  resolveRouteStroke,
  sportProfileForVariant,
  specialTeamsTemplates,
  SPORT_VARIANT_LABELS,
  type DefenseTemplate,
  type SpecialTeamsTemplate,
} from "@/domain/play/factory";
import { routeToRenderedSegments } from "@/domain/play/geometry";
import type { PlaybookGroupRow } from "@/domain/print/playbookPrint";
import type { PlaybookRosterMember } from "@/app/actions/playbook-roster";
import {
  approveMemberAction,
  denyMemberAction,
  removeStaffMemberAction,
  setCoachTitleAction,
  setHeadCoachAction,
} from "@/app/actions/playbook-roster";
import {
  createInviteAction,
  revokeInviteAction,
  type PlaybookInvite,
} from "@/app/actions/invites";
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

type GroupBy = "none" | "formation" | "group";

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
  playerCount: playbookPlayerCount,
  initialPlays,
  initialGroups,
  initialRoster,
  initialInvites,
  initialFormations,
  pageHeader,
}: {
  playbookId: string;
  sportVariant: string;
  playerCount?: number;
  initialPlays: PlaybookDetailPlayRow[];
  initialGroups: PlaybookGroupRow[];
  initialRoster: PlaybookRosterMember[];
  initialInvites: PlaybookInvite[];
  initialFormations: SavedFormation[];
  // Back link + playbook identity block. Rendered inside the sticky header
  // region so it stays pinned while plays scroll.
  pageHeader?: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const initialTab = (() => {
    const t = searchParams?.get("tab");
    if (t === "formations" || t === "roster" || t === "staff") return t;
    return "plays";
  })();
  const [tab, setTab] = useState<"plays" | "formations" | "roster" | "staff">(
    initialTab,
  );
  const variant = sportVariant as SportVariant;
  const variantProfile = sportProfileForVariant(variant);
  const expectedPlayerCount = playbookPlayerCount ?? variantProfile.offensePlayerCount;
  // Default players for this variant/count — used for "No specific formation"
  const defaultPlayers = useMemo(
    () => defaultPlayersForVariant(variant, playbookPlayerCount),
    [variant, playbookPlayerCount],
  );
  const variantLabel = SPORT_VARIANT_LABELS[variant] ?? variant;
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");
  const [typeFilter, setTypeFilter] = useState<PlayType | "all">("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersPanelRef = useRef<HTMLDivElement | null>(null);
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
  const [openSection, setOpenSection] = useState<PlayType>("offense");
  const defenseTemplates = useMemo(
    () => defenseTemplatesForVariant(variant),
    [variant],
  );
  const stTemplates = useMemo(
    () => (variant === "tackle_11" ? specialTeamsTemplates() : []),
    [variant],
  );
  const defaultDefenders = useMemo(
    () => defaultDefendersForVariant(variant, playbookPlayerCount),
    [variant, playbookPlayerCount],
  );

  const viewed = initialPlays.filter((p) =>
    view === "archived" ? p.is_archived : !p.is_archived,
  );
  const filtered = viewed.filter((p) => {
    if (typeFilter !== "all" && p.play_type !== typeFilter) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      p.name.toLowerCase().includes(s) ||
      (p.wristband_code && p.wristband_code.toLowerCase().includes(s)) ||
      (p.shorthand && p.shorthand.toLowerCase().includes(s)) ||
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
      if (groupBy === "none") {
        pushInto("__all__", "", 0, p);
      } else if (groupBy === "formation") {
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
    for (const s of arr)
      s.plays.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
      );
    return arr;
  }, [filtered, groupBy, groupById, initialGroups]);

  // Close the filters popover on outside click or Escape.
  useEffect(() => {
    if (!filtersOpen) return;
    const onDown = (e: MouseEvent) => {
      const panel = filtersPanelRef.current;
      if (panel && !panel.contains(e.target as Node)) setFiltersOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

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

  async function createWithFormation(
    formation?: SavedFormation,
    opts?: { playType?: PlayType; specialTeamsUnit?: SpecialTeamsUnit | null; initialPlayers?: Player[]; formationName?: string; playName?: string },
  ) {
    setCreating(true);
    const playType = opts?.playType ?? "offense";
    const initialPlayers =
      opts?.initialPlayers ?? formation?.players ?? defaultPlayers;
    const res = await createPlayAction(playbookId, {
      initialPlayers,
      formationId: formation?.id ?? null,
      formationName: opts?.formationName ?? formation?.displayName ?? "",
      variant,
      playerCount: playbookPlayerCount,
      playType,
      specialTeamsUnit: opts?.specialTeamsUnit ?? null,
      playName: opts?.playName,
    });
    if (res.ok) {
      router.push(`/plays/${res.playId}/edit`);
    } else {
      setCreating(false);
      setShowFormationPicker(false);
      toast(res.error, "error");
    }
  }

  function nextPlayNameForTemplate(displayName: string): string {
    const base = displayName.trim();
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped}(?:\\s+(\\d+))?$`, "i");
    let maxN = 0;
    let anyMatch = false;
    for (const p of initialPlays) {
      const m = (p.name ?? "").trim().match(re);
      if (!m) continue;
      anyMatch = true;
      const n = m[1] ? parseInt(m[1], 10) : 1;
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }
    return `${base} ${anyMatch ? maxN + 1 : 1}`;
  }

  function createFromDefenseTemplate(t: DefenseTemplate) {
    void createWithFormation(undefined, {
      playType: "defense",
      initialPlayers: t.players,
      formationName: t.displayName,
      playName: nextPlayNameForTemplate(t.displayName),
    });
  }

  function createFromSTTemplate(t: SpecialTeamsTemplate) {
    void createWithFormation(undefined, {
      playType: "special_teams",
      specialTeamsUnit: t.unit,
      initialPlayers: t.players,
      formationName: t.displayName,
      playName: nextPlayNameForTemplate(t.displayName),
    });
  }

  async function createAndGoToFormationEditor() {
    setCreating(true);
    const res = await createPlayAction(playbookId, { initialPlayers: defaultPlayers, variant, playerCount: playbookPlayerCount });
    if (res.ok) {
      // Go to formation editor; when user saves, the formation editor
      // should redirect back to the play. Pass playId as return target.
      router.push(`/formations/new?variant=${variant}&returnToPlay=${res.playId}`);
    } else {
      setCreating(false);
      setShowFormationPicker(false);
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

  function onRenamePlayInline(id: string, next: string) {
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
      {/* Sticky header region: back link + playbook identity + slim top bar.
          Stays pinned below the global dashboard header (h ≈ 56px = top-14)
          while plays scroll beneath. `-mt-8` cancels the dashboard `<main>`
          py-8 top padding so the pre-scroll layout matches the scrolled
          (compact) layout — same spacing in both states. Solid bg (not
          blur) avoids the "appearing header" flicker when scroll begins. */}
      <div className="sticky top-14 z-20 -mx-6 -mt-8 space-y-4 bg-surface px-6 pb-4 pt-3">
        {pageHeader}

        <div className="border-b border-border">
          <nav className="-mb-px flex gap-6" aria-label="Playbook sections">
            {(
              [
                { key: "plays" as const, label: "Plays", count: initialPlays.filter((p) => !p.is_archived).length },
                { key: "formations" as const, label: "Formations", count: initialFormations.length },
                { key: "roster" as const, label: "Roster", count: initialRoster.filter((m) => m.role === "viewer").length },
                { key: "staff" as const, label: "Staff", count: initialRoster.filter((m) => m.role !== "viewer").length },
              ]
            ).map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  aria-current={active ? "page" : undefined}
                  className={`relative inline-flex items-center gap-2 border-b-[3px] px-1 pb-3 pt-1 text-base font-bold tracking-tight transition-colors ${
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted hover:text-foreground"
                  }`}
                >
                  {t.label}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                      active ? "bg-primary/10 text-primary" : "bg-surface-inset text-muted"
                    }`}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {tab === "plays" && (
        /* Slim top bar: type tabs, search, filters, print, new */
        <div className="flex flex-wrap items-end gap-3">
          <SegmentedControl
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as PlayType | "all")}
            options={
              variant === "tackle_11"
                ? [
                    { value: "all", label: "All" },
                    { value: "offense", label: "Offense" },
                    { value: "defense", label: "Defense" },
                    { value: "special_teams", label: "Special teams" },
                  ]
                : [
                    { value: "all", label: "All" },
                    { value: "offense", label: "Offense" },
                    { value: "defense", label: "Defense" },
                  ]
            }
          />
          <div className="min-w-[200px] flex-1">
            <Input
              leftIcon={Search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, code, formation, tag…"
            />
          </div>

          <div ref={filtersPanelRef} className="relative">
            <Button
              variant="secondary"
              leftIcon={SlidersHorizontal}
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
            >
              {groupBy === "none" && typeFilter === "all" && view === "active"
                ? "Filters"
                : "Filters •"}
            </Button>
            {filtersOpen && (
              <div
                role="dialog"
                aria-label="Play filters"
                className="absolute right-0 top-full z-30 mt-2 w-[280px] space-y-4 rounded-xl border border-border bg-surface-raised p-4 shadow-elevated"
              >
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Group by
                  </div>
                  <SegmentedControl
                    size="sm"
                    className="w-full [&>button]:flex-1"
                    value={groupBy}
                    onChange={(v) => setGroupBy(v as GroupBy)}
                    options={[
                      { value: "none", label: "None" },
                      { value: "formation", label: "Formation" },
                      { value: "group", label: "Group" },
                    ]}
                  />
                  {groupBy === "group" && (
                    <button
                      type="button"
                      onClick={() => setShowManageGroups(true)}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-xs font-medium text-muted hover:border-primary hover:text-primary"
                    >
                      <Folders className="size-3.5" />
                      Manage groups
                    </button>
                  )}
                </div>
                <div>
                  <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    <Settings2 className="size-3" /> View
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <SegmentedControl
                      size="sm"
                      className="w-full [&>button]:flex-1"
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
                        className="w-full [&>button]:flex-1"
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
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Type
                  </div>
                  <SegmentedControl
                    size="sm"
                    className="w-full [&>button]:flex-1"
                    value={typeFilter}
                    onChange={(v) => setTypeFilter(v as PlayType | "all")}
                    options={
                      variant === "tackle_11"
                        ? [
                            { value: "all", label: "All" },
                            { value: "offense", label: "Off" },
                            { value: "defense", label: "Def" },
                            { value: "special_teams", label: "ST" },
                          ]
                        : [
                            { value: "all", label: "All" },
                            { value: "offense", label: "Off" },
                            { value: "defense", label: "Def" },
                          ]
                    }
                  />
                </div>
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Status
                  </div>
                  <SegmentedControl
                    size="sm"
                    className="w-full [&>button]:flex-1"
                    value={view}
                    onChange={(v) => setView(v as "active" | "archived")}
                    options={[
                      { value: "active", label: "Active" },
                      { value: "archived", label: "Archived" },
                    ]}
                  />
                </div>
              </div>
            )}
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
        )}
      </div>

      {tab === "roster" && (
        <RosterPanel
          playbookId={playbookId}
          members={initialRoster}
          invites={initialInvites}
        />
      )}

      {tab === "formations" && (
        <PlaybookFormationsTab
          playbookId={playbookId}
          variant={variant}
          initial={initialFormations}
        />
      )}

      {tab === "staff" && (
        <StaffPanel
          playbookId={playbookId}
          members={initialRoster}
          invites={initialInvites}
        />
      )}

      {tab === "plays" && (
      <div>
        {/* Section jump pills — only shown when grouping is active and there's
            more than one section. Horizontal scroll on overflow so this stays
            tidy on mobile and doesn't introduce a separate sidebar. */}
        {groupBy !== "none" && sections.length > 1 && (
          <nav
            aria-label="Jump to section"
            className="mb-4 -mx-6 flex gap-1.5 overflow-x-auto px-6 pb-1"
          >
            {sections.map((s) => {
              const active = activeSection === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => jumpToSection(s.key)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                      : "bg-surface-inset text-foreground hover:bg-surface-raised"
                  }`}
                >
                  <span className="truncate max-w-[12rem]">{s.label || "Ungrouped"}</span>
                  <span className="text-[10px] text-muted tabular-nums">{s.plays.length}</span>
                </button>
              );
            })}
          </nav>
        )}

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
                onSelect: () => handle(() => duplicatePlayAction(p.id)),
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
                {groupBy !== "none" && (
                  <div className="flex items-center gap-2 border-b border-border pb-1.5">
                    <h2 className="truncate text-sm font-semibold text-foreground">{section.label}</h2>
                    <Badge variant="default">{section.plays.length}</Badge>
                  </div>
                )}
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
                          <div className="pr-16">
                            <EditablePlayTitle
                              name={p.name}
                              onRename={(next) => onRenamePlayInline(p.id, next)}
                              className="font-semibold"
                            />
                          </div>
                          {p.preview && (
                            <div className="mt-2">
                              <PlayPreview preview={p.preview} />
                            </div>
                          )}
                          <p className="mt-2 truncate text-xs text-muted">
                            {p.formation_name ||
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
                          <ActionMenu items={buildItems(p)} />
                        </div>
                        {p.play_type !== "offense" && (
                          <div className="pointer-events-none absolute bottom-2 right-2">
                            <PlayTypeBadge type={p.play_type} />
                          </div>
                        )}
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
                          <EditablePlayTitle
                            name={p.name}
                            onRename={(next) => onRenamePlayInline(p.id, next)}
                            className="text-sm font-medium"
                          />
                          <span className="truncate text-xs text-muted">
                            {p.formation_name ||
                              p.shorthand ||
                              ""}
                          </span>
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

      )}

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
            if (creating) return;
            if (e.target === e.currentTarget) setShowFormationPicker(false);
          }}
        >
          <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface-raised shadow-elevated">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Start a new play
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Choose a formation to begin with, or start blank.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-inset hover:text-foreground disabled:opacity-40"
                onClick={() => setShowFormationPicker(false)}
                disabled={creating}
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-4">
              {loadingFormations ? (
                <p className="py-8 text-center text-sm text-muted">Loading formations…</p>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                  <PlayTypeSection
                    title="Offense"
                    subtitle={`${expectedPlayerCount} players`}
                    open={openSection === "offense"}
                    onToggle={() => setOpenSection(openSection === "offense" ? "offense" : "offense")}
                    onHeaderClick={() => setOpenSection("offense")}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        className="flex flex-col items-center gap-2 rounded-xl border-2 border-primary/40 bg-primary/5 p-4 text-center transition-colors hover:border-primary hover:bg-primary/10"
                        onClick={() => createWithFormation()}
                      >
                        <MiniPlayerDiagram players={defaultPlayers} />
                        <div>
                          <p className="text-sm font-semibold text-foreground">No specific formation</p>
                          <p className="text-xs text-muted">{expectedPlayerCount} default players</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface-inset p-4 text-center transition-colors hover:border-primary hover:bg-primary/5"
                        onClick={createAndGoToFormationEditor}
                      >
                        <div className="flex size-20 items-center justify-center rounded-md bg-surface-raised text-muted">
                          <Plus className="size-7" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Create new formation</p>
                          <p className="text-xs text-muted">Design from scratch</p>
                        </div>
                      </button>
                    </div>
                    {(() => {
                      const off = availableFormations.filter((f) => {
                        if ((f.kind ?? "offense") !== "offense") return false;
                        const fv = f.sportProfile?.variant as SportVariant | undefined;
                        if (fv) return fv === variant;
                        return f.players.length === expectedPlayerCount;
                      });
                      if (off.length === 0) return null;
                      return (
                        <>
                          <SectionDivider>Your formations</SectionDivider>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {off.map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-inset p-4 text-center transition-colors hover:border-primary hover:bg-primary/5"
                                onClick={() => createWithFormation(f)}
                              >
                                <MiniPlayerDiagram players={f.players} />
                                <div>
                                  <p className="text-sm font-semibold text-foreground">{f.displayName}</p>
                                  <p className="text-xs text-muted">{f.players.length} players</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </PlayTypeSection>

                  <PlayTypeSection
                    title="Defense"
                    subtitle={`${sportProfileForVariant(variant).defensePlayerCount} defenders`}
                    open={openSection === "defense"}
                    onHeaderClick={() => setOpenSection("defense")}
                  >
                    {defenseTemplates.length > 0 && (
                      <>
                        <p className="mb-2 text-xs font-medium text-muted">
                          Select a template to start with
                        </p>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {defenseTemplates.map((t) => (
                            <button
                              key={t.key}
                              type="button"
                              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-inset p-4 text-center transition-colors hover:border-primary hover:bg-primary/5"
                              onClick={() => createFromDefenseTemplate(t)}
                              title={t.description}
                            >
                              <MiniPlayerDiagram players={t.players} />
                              <div>
                                <p className="text-sm font-semibold text-foreground">{t.displayName}</p>
                                <p className="text-xs text-muted">{t.players.length} defenders</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {(() => {
                      const def = availableFormations.filter((f) => f.kind === "defense");
                      if (def.length === 0) return null;
                      return (
                        <>
                          <SectionDivider>Your formations</SectionDivider>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {def.map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-inset p-4 text-center transition-colors hover:border-primary hover:bg-primary/5"
                                onClick={() =>
                                  createWithFormation(f, { playType: "defense" })
                                }
                              >
                                <MiniPlayerDiagram players={f.players} />
                                <div>
                                  <p className="text-sm font-semibold text-foreground">{f.displayName}</p>
                                  <p className="text-xs text-muted">{f.players.length} players</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </PlayTypeSection>

                  {variant === "tackle_11" && (
                    <PlayTypeSection
                      title="Special Teams"
                      subtitle="Punt, kickoff, field goal, returns"
                      open={openSection === "special_teams"}
                      onHeaderClick={() => setOpenSection("special_teams")}
                    >
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {stTemplates.map((t) => (
                          <button
                            key={t.key}
                            type="button"
                            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-inset p-4 text-center transition-colors hover:border-primary hover:bg-primary/5"
                            onClick={() => createFromSTTemplate(t)}
                            title={t.description}
                          >
                            <MiniPlayerDiagram players={t.players} />
                            <div>
                              <p className="text-sm font-semibold text-foreground">{t.displayName}</p>
                              <p className="text-xs text-muted">{t.players.length} players</p>
                            </div>
                          </button>
                        ))}
                      </div>
                      {(() => {
                        const st = availableFormations.filter((f) => f.kind === "special_teams");
                        if (st.length === 0) return null;
                        return (
                          <>
                            <SectionDivider>Your formations</SectionDivider>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                              {st.map((f) => (
                                <button
                                  key={f.id}
                                  type="button"
                                  className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-inset p-4 text-center transition-colors hover:border-primary hover:bg-primary/5"
                                  onClick={() =>
                                    createWithFormation(f, { playType: "special_teams" })
                                  }
                                >
                                  <MiniPlayerDiagram players={f.players} />
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">{f.displayName}</p>
                                    <p className="text-xs text-muted">{f.players.length} players</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </PlayTypeSection>
                  )}
                </div>
              )}
            </div>
            {creating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-surface-raised/80 backdrop-blur-sm">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">Preparing play editor…</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RosterPanel({
  playbookId,
  members,
  invites,
}: {
  playbookId: string;
  members: PlaybookRosterMember[];
  invites: PlaybookInvite[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Roster tab is player-only; coaches (owner/editor) live in the Staff tab.
  const players = members.filter((m) => m.role === "viewer");
  const pending = players.filter((m) => m.status === "pending");
  const active = players.filter((m) => m.status === "active");
  const activeInvites = invites.filter(
    (i) => !i.revoked_at && new Date(i.expires_at) > new Date(),
  );

  const roleLabel = (r: PlaybookRosterMember["role"]) =>
    r === "owner" ? "Coach (owner)" : r === "editor" ? "Coach" : "Player";

  async function approve(userId: string) {
    setPendingId(userId);
    const res = await approveMemberAction(playbookId, userId);
    setPendingId(null);
    if (!res.ok) toast(`Approve failed: ${res.error}`, "error");
    else router.refresh();
  }
  async function deny(userId: string) {
    setPendingId(userId);
    const res = await denyMemberAction(playbookId, userId);
    setPendingId(null);
    if (!res.ok) toast(`Deny failed: ${res.error}`, "error");
    else router.refresh();
  }
  async function revoke(inviteId: string) {
    const res = await revokeInviteAction(inviteId, playbookId);
    if (!res.ok) toast(`Revoke failed: ${res.error}`, "error");
    else router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Roster</h2>
          <p className="text-xs text-muted">Players and coaches with access to this playbook.</p>
        </div>
        <Button
          variant="primary"
          leftIcon={Plus}
          onClick={() => setShowInviteModal(true)}
        >
          Invite
        </Button>
      </div>

      {pending.length > 0 && (
        <section className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            Pending approvals
            <span className="ml-2 rounded-full bg-warning/20 px-2 py-0.5 text-[11px] text-warning">
              {pending.length}
            </span>
          </h3>
          <ul className="divide-y divide-border">
            {pending.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {m.label || m.display_name || m.user_id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-muted">Requested {roleLabel(m.role)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="primary"
                    leftIcon={Check}
                    loading={pendingId === m.user_id}
                    onClick={() => approve(m.user_id)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={X}
                    disabled={pendingId === m.user_id}
                    onClick={() => deny(m.user_id)}
                  >
                    Deny
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {active.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-raised p-8 text-center">
          <p className="text-sm font-semibold text-foreground">No one on the roster yet</p>
          <p className="mt-1 text-xs text-muted">Use Invite to share this playbook with a player or coach.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-raised">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-4 py-2.5 font-semibold">Role</th>
                  <th className="px-4 py-2.5 font-semibold">Jersey</th>
                  <th className="px-4 py-2.5 font-semibold">Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {active.map((m) => {
                  const name = m.label || m.display_name || "—";
                  return (
                    <tr key={m.user_id}>
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        <span className="inline-flex items-center gap-2">
                          {name}
                          {m.is_minor && (
                            <Badge variant="warning" className="text-[10px]">
                              Minor
                            </Badge>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={m.role === "owner" ? "primary" : "default"} className="text-[10px]">
                          {roleLabel(m.role)}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {m.jersey_number ? `#${m.jersey_number}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted">{m.position || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeInvites.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Active invite links</h3>
          <ul className="space-y-2">
            {activeInvites.map((inv) => (
              <InviteRow key={inv.id} invite={inv} onRevoke={() => revoke(inv.id)} />
            ))}
          </ul>
        </section>
      )}

      {showInviteModal && (
        <InviteModal
          playbookId={playbookId}
          onClose={() => {
            setShowInviteModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function InviteRow({ invite, onRevoke }: { invite: PlaybookInvite; onRevoke: () => void }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/invite/${invite.token}`
      : `/invite/${invite.token}`;

  const expiresLabel = new Date(invite.expires_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const usesLabel = invite.max_uses
    ? `${invite.uses_count}/${invite.max_uses} used`
    : `${invite.uses_count} used`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Copy failed — copy the link manually.", "error");
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant="default" className="text-[10px]">
            {invite.role === "viewer" ? "Player" : "Coach"}
          </Badge>
          {invite.email && <span className="truncate text-xs text-muted">→ {invite.email}</span>}
          {invite.note && <span className="truncate text-xs text-muted">· {invite.note}</span>}
        </div>
        <p className="mt-0.5 text-[11px] text-muted">
          {usesLabel} · expires {expiresLabel}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="ghost" leftIcon={copied ? Check : Copy} onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button size="sm" variant="ghost" leftIcon={X} onClick={onRevoke}>
          Revoke
        </Button>
      </div>
    </li>
  );
}

function InviteModal({ playbookId, onClose }: { playbookId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [maxUses, setMaxUses] = useState<string>("25");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setCreating(true);
    const parsedMax = maxUses.trim() === "" ? null : Math.max(1, Math.floor(Number(maxUses)));
    const res = await createInviteAction({
      playbookId,
      role,
      expiresInDays,
      maxUses: parsedMax,
      email: email || null,
      note: note || null,
    });
    setCreating(false);
    if (!res.ok) {
      toast(`Could not create invite: ${res.error}`, "error");
      return;
    }
    const url = `${window.location.origin}/invite/${res.invite.token}`;
    setCreatedUrl(url);
  }

  async function copy() {
    if (!createdUrl) return;
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Copy failed — copy the link manually.", "error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-foreground">Create invite link</h2>
            <p className="mt-0.5 text-xs text-muted">
              You&apos;ll still need to approve them after they sign up.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-inset hover:text-foreground"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          {createdUrl ? (
            <>
              <p className="text-sm text-foreground">
                Link is ready — share it however you like (text, group chat, email).
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-inset px-3 py-2">
                <code className="flex-1 truncate text-xs text-foreground">{createdUrl}</code>
                <Button size="sm" variant="primary" leftIcon={copied ? Check : Copy} onClick={copy}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <Button variant="secondary" onClick={onClose} className="w-full">
                Done
              </Button>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Role</label>
                <SegmentedControl
                  value={role}
                  onChange={(v) => setRole(v as "viewer" | "editor")}
                  options={[
                    { value: "viewer", label: "Player (view)" },
                    { value: "editor", label: "Coach (edit)" },
                  ]}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Expires in</label>
                  <select
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(Number(e.target.value))}
                    className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
                  >
                    <option value={1}>1 day</option>
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days (max)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Max uses</label>
                  <Input
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                    placeholder="Leave blank = unlimited"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Email (optional, for your records)
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="player@example.com"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Note (optional)
                </label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Jamal, parents text chain, etc."
                />
              </div>

              <Button
                variant="primary"
                loading={creating}
                onClick={create}
                className="w-full"
              >
                Create link
              </Button>
            </>
          )}
        </div>
      </div>
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
  preview: { players: Player[]; routes: Route[]; zones?: Zone[]; lineOfScrimmageY: number };
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
        {(preview.zones ?? []).map((z) => {
          const cx = z.center.x;
          const cy = 1 - z.center.y;
          const w = z.size.w;
          const h = z.size.h;
          if (z.kind === "rectangle") {
            return (
              <rect
                key={z.id}
                x={cx - w}
                y={cy - h}
                width={w * 2}
                height={h * 2}
                fill={z.style.fill}
                stroke={z.style.stroke}
                strokeWidth={1}
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            );
          }
          return (
            <ellipse
              key={z.id}
              cx={cx}
              cy={cy}
              rx={w}
              ry={h}
              fill={z.style.fill}
              stroke={z.style.stroke}
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
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
        const common = {
          fill: pl.style.fill,
          stroke: pl.style.stroke,
          strokeWidth: 1,
        } as const;
        if (pl.shape === "triangle") {
          const pts = `${cx},${cy - DOT_R} ${cx - DOT_R},${cy + DOT_R} ${cx + DOT_R},${cy + DOT_R}`;
          return <polygon key={pl.id} points={pts} {...common} />;
        }
        if (pl.shape === "square") {
          return (
            <rect
              key={pl.id}
              x={cx - DOT_R}
              y={cy - DOT_R}
              width={DOT_R * 2}
              height={DOT_R * 2}
              {...common}
            />
          );
        }
        return <circle key={pl.id} cx={cx} cy={cy} r={DOT_R} {...common} />;
      })}
    </svg>
  );
}

function PlayTypeBadge({ type }: { type: PlayType }) {
  const cfg: Record<PlayType, { label: string; className: string }> = {
    offense: { label: "OFF", className: "bg-primary/10 text-primary" },
    defense: { label: "DEF", className: "bg-red-500/10 text-red-700 dark:text-red-400" },
    special_teams: { label: "ST", className: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  };
  const { label, className } = cfg[type];
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${className}`}>
      {label}
    </span>
  );
}

function PlayTypeSection({
  title,
  subtitle,
  open,
  onHeaderClick,
  children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle?: () => void;
  onHeaderClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border border-border bg-surface-raised ${open ? "min-h-0 flex-1" : "shrink-0"}`}
    >
      <button
        type="button"
        onClick={onHeaderClick}
        className="flex w-full shrink-0 items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">{title}</p>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        <span className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto border-t border-border p-4">
          {children}
        </div>
      )}
    </div>
  );
}

function StaffPanel({
  playbookId,
  members,
  invites,
}: {
  playbookId: string;
  members: PlaybookRosterMember[];
  invites: PlaybookInvite[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Coaches = owner/editor; players live in the Roster tab.
  const coaches = members.filter((m) => m.role !== "viewer");
  const pending = coaches.filter((m) => m.status === "pending");
  const active = coaches.filter((m) => m.status === "active");
  const activeInvites = invites.filter(
    (i) => !i.revoked_at && new Date(i.expires_at) > new Date(),
  );

  async function approve(userId: string) {
    setPendingId(userId);
    const res = await approveMemberAction(playbookId, userId);
    setPendingId(null);
    if (!res.ok) toast(`Approve failed: ${res.error}`, "error");
    else router.refresh();
  }
  async function deny(userId: string) {
    setPendingId(userId);
    const res = await denyMemberAction(playbookId, userId);
    setPendingId(null);
    if (!res.ok) toast(`Deny failed: ${res.error}`, "error");
    else router.refresh();
  }
  async function revoke(inviteId: string) {
    const res = await revokeInviteAction(inviteId, playbookId);
    if (!res.ok) toast(`Revoke failed: ${res.error}`, "error");
    else router.refresh();
  }

  async function toggleHeadCoach(userId: string, currentlyHead: boolean) {
    const res = await setHeadCoachAction(playbookId, currentlyHead ? null : userId);
    if (!res.ok) toast(`Update failed: ${res.error}`, "error");
    else router.refresh();
  }
  async function saveTitle(userId: string, title: string) {
    const res = await setCoachTitleAction(playbookId, userId, title);
    if (!res.ok) toast(`Update failed: ${res.error}`, "error");
    else router.refresh();
  }
  async function removeStaff(userId: string, name: string) {
    if (
      !window.confirm(
        `Remove ${name} from the staff? They'll lose access to this playbook.`,
      )
    )
      return;
    const res = await removeStaffMemberAction(playbookId, userId);
    if (!res.ok) toast(`Remove failed: ${res.error}`, "error");
    else router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Staff</h2>
          <p className="text-xs text-muted">
            Coaches who can edit this playbook. Mark one head coach and give
            others a title.
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={Plus}
          onClick={() => setShowInviteModal(true)}
        >
          Invite
        </Button>
      </div>

      {pending.length > 0 && (
        <section className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            Pending approvals
            <span className="ml-2 rounded-full bg-warning/20 px-2 py-0.5 text-[11px] text-warning">
              {pending.length}
            </span>
          </h3>
          <ul className="divide-y divide-border">
            {pending.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {m.label || m.display_name || m.user_id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-muted">
                    Requested {m.role === "owner" ? "Owner" : "Coach"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="primary"
                    leftIcon={Check}
                    loading={pendingId === m.user_id}
                    onClick={() => approve(m.user_id)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={X}
                    disabled={pendingId === m.user_id}
                    onClick={() => deny(m.user_id)}
                  >
                    Deny
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {active.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-raised p-8 text-center">
          <p className="text-sm font-semibold text-foreground">No coaches yet</p>
          <p className="mt-1 text-xs text-muted">
            Use Invite to share this playbook with other coaches.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-raised">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Head coach</th>
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-4 py-2.5 font-semibold">Title</th>
                  <th className="w-10 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {active.map((m) => {
                  const name = m.label || m.display_name || "—";
                  const isOwner = m.role === "owner";
                  return (
                    <StaffRow
                      key={m.user_id}
                      member={m}
                      name={name}
                      isOwner={isOwner}
                      onToggleHead={() => toggleHeadCoach(m.user_id, m.is_head_coach)}
                      onSaveTitle={(t) => saveTitle(m.user_id, t)}
                      onRemove={isOwner ? null : () => removeStaff(m.user_id, name)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeInvites.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Active invite links</h3>
          <ul className="space-y-2">
            {activeInvites.map((inv) => (
              <InviteRow key={inv.id} invite={inv} onRevoke={() => revoke(inv.id)} />
            ))}
          </ul>
        </section>
      )}

      {showInviteModal && (
        <InviteModal
          playbookId={playbookId}
          onClose={() => {
            setShowInviteModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function StaffRow({
  member,
  name,
  isOwner,
  onToggleHead,
  onSaveTitle,
  onRemove,
}: {
  member: PlaybookRosterMember;
  name: string;
  isOwner: boolean;
  onToggleHead: () => void;
  onSaveTitle: (title: string) => void;
  onRemove: (() => void) | null;
}) {
  const [title, setTitle] = useState(member.coach_title ?? "");
  useEffect(() => {
    setTitle(member.coach_title ?? "");
  }, [member.coach_title]);

  function commitTitle() {
    const next = title.trim();
    if (next === (member.coach_title ?? "")) return;
    onSaveTitle(next);
  }

  return (
    <tr>
      <td className="px-4 py-2.5">
        <button
          type="button"
          onClick={onToggleHead}
          aria-pressed={member.is_head_coach}
          aria-label={member.is_head_coach ? "Clear head coach" : "Make head coach"}
          title={member.is_head_coach ? "Head coach — click to clear" : "Make head coach"}
          className={`inline-flex size-7 items-center justify-center rounded-full transition-colors ${
            member.is_head_coach
              ? "bg-primary/10 text-primary"
              : "text-muted hover:bg-surface-inset hover:text-foreground"
          }`}
        >
          <Crown className="size-4" />
        </button>
      </td>
      <td className="px-4 py-2.5 font-medium text-foreground">
        <span className="inline-flex items-center gap-2">
          {name}
          {isOwner && (
            <Badge variant="primary" className="text-[10px]">
              Owner
            </Badge>
          )}
          {member.is_head_coach && (
            <Badge variant="primary" className="text-[10px]">
              Head coach
            </Badge>
          )}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="e.g. Offensive Coordinator"
          className="h-8 max-w-[260px] text-sm"
        />
      </td>
      <td className="px-4 py-2.5 text-right">
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger"
            aria-label="Remove from staff"
            title="Remove from staff"
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function EditablePlayTitle({
  name,
  onRename,
  className = "",
}: {
  name: string;
  onRename: (next: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const savedRef = useRef(false);

  useEffect(() => {
    if (!editing) setValue(name);
  }, [name, editing]);

  function stop(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function commit() {
    if (savedRef.current) return;
    savedRef.current = true;
    const next = value.trim();
    if (next && next !== name) onRename(next);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onClick={stop}
        onMouseDown={stop}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            savedRef.current = true;
            setValue(name);
            setEditing(false);
          }
        }}
        onBlur={commit}
        className={`min-w-0 flex-1 truncate rounded-md border border-primary bg-surface px-1.5 py-0 text-foreground focus:outline-none ${className}`}
        aria-label="Rename play"
      />
    );
  }

  return (
    <span className="group/title flex min-w-0 flex-1 items-center gap-1">
      <span className={`min-w-0 truncate text-foreground ${className}`}>{name}</span>
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          savedRef.current = false;
          setValue(name);
          setEditing(true);
        }}
        className="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:bg-surface-inset hover:text-foreground group-hover/title:opacity-100 focus:opacity-100"
        aria-label="Rename play"
        title="Rename"
      >
        <Pencil className="size-3.5" />
      </button>
    </span>
  );
}

function SectionDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{children}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
