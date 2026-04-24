"use client";

import Link from "next/link";
import {
  ExamplePreviewProvider,
  useExamplePreview,
} from "@/features/admin/ExamplePreviewContext";
import { PlayThumbnail } from "@/features/editor/PlayThumbnail";
import { PlayNumberBadge, EditablePlayNumberBadge } from "@/features/editor/PlayNumberBadge";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type SortableListeners = Record<string, (event: unknown) => void> | undefined;
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckSquare,
  Copy,
  Crown,
  FileText,
  Folders,
  Gamepad2,
  GripVertical,
  Hash,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Search,
  Settings2,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import {
  archivePlayAction,
  createPlayAction,
  createPlaybookGroupAction,
  deletePlayAction,
  deletePlaybookGroupAction,
  renamePlayAction,
  renamePlaybookGroupAction,
  reorderPlaybookGroupsAction,
  reorderPlaysAction,
  swapPlaySortOrderAction,
  setPlayGroupAction,
  type PlaybookDetailPlayRow,
} from "@/app/actions/plays";
import { listFormationsAction } from "@/app/actions/formations";
import type { SavedFormation } from "@/app/actions/formations";
import { PlaybookFormationsTab } from "./PlaybookFormationsTab";
import { GameResultsPanel } from "@/features/game-results/GameResultsPanel";
import { CopyToPlaybookDialog, type CopyTarget } from "@/features/playbooks/CopyToPlaybookDialog";
import { GameModeUpgradeDialog } from "@/features/game-mode/GameModeUpgradeDialog";
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
import type {
  PendingRosterClaim,
  PlaybookRosterMember,
} from "@/app/actions/playbook-roster";
import {
  addRosterEntryAction,
  approveCoachUpgradeAction,
  approveMemberAction,
  approveRosterClaimAction,
  deleteRosterEntryAction,
  denyCoachUpgradeAction,
  denyMemberAction,
  rejectRosterClaimAction,
  removeStaffMemberAction,
  setCoachTitleAction,
  setHeadCoachAction,
  unlinkRosterEntryAction,
} from "@/app/actions/playbook-roster";
import {
  revokeInviteAction,
  type PlaybookInvite,
} from "@/app/actions/invites";
import {
  setPlaybookViewPrefsAction,
  type PlaybookViewPrefs,
} from "@/app/actions/playbook-view-prefs";
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  SegmentedControl,
  useToast,
  type ActionMenuItem,
} from "@/components/ui";
import { PlaybookHeader, InviteTeamMemberDialog, type PlaybookHeaderPlayActions } from "./PlaybookHeader";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import type { PlaybookSettings } from "@/domain/playbook/settings";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

// Render-prop wrapper that exposes dnd-kit's useSortable outputs inline.
// Lets us keep the existing Card/li JSX in-place while a single wrapper adds
// transform, transition, and activator listeners.
function SortableItem({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (args: {
    setNodeRef: (el: HTMLElement | null) => void;
    style: CSSProperties;
    attributes: HTMLAttributes<HTMLElement>;
    listeners: SortableListeners;
    isDragging: boolean;
  }) => ReactNode;
}) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } =
    useSortable({ id, disabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <>
      {children({
        setNodeRef,
        style,
        attributes,
        listeners: listeners as SortableListeners,
        isDragging,
      })}
    </>
  );
}

// Render-prop wrapper for a section's drop zone (enables dropping onto an
// empty group, and ensures the section is a valid over-target).
function DroppableContainer({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (args: {
    setNodeRef: (el: HTMLElement | null) => void;
    isOver: boolean;
  }) => ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return <>{children({ setNodeRef, isOver })}</>;
}


type GroupBy = "type" | "formation" | "group";

const UNASSIGNED = "__unassigned__";

type ThumbSize = "small" | "medium" | "large";

type PlaybookPrefs = {
  tab?: "plays" | "formations" | "roster" | "staff" | "games";
  view: "active" | "archived";
  typeFilter: PlayType | "all";
  groupBy: GroupBy;
  viewMode: "cards" | "list";
  thumbSize: ThumbSize;
  showPlayNumbers: boolean;
};

const SIZE_COL_CLASS: Record<ThumbSize, string> = {
  large: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  medium: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  small: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
};

export function PlaybookDetailClient(props: PlaybookDetailClientProps) {
  return (
    <ExamplePreviewProvider
      isPreview={props.isExamplePreview ?? false}
      isArchived={props.isArchived ?? false}
      playbookId={props.playbookId}
      canUnarchive={props.headerProps.canManage}
    >
      <PlaybookDetailClientInner {...props} />
    </ExamplePreviewProvider>
  );
}

type PlaybookDetailClientProps = Parameters<typeof PlaybookDetailClientInner>[0] & {
  isExamplePreview?: boolean;
  isArchived?: boolean;
};

function PlaybookDetailClientInner({
  playbookId,
  sportVariant,
  playerCount: playbookPlayerCount,
  initialPlays,
  initialGroups,
  truncated,
  initialRoster,
  initialRosterClaims,
  initialInvites,
  initialFormations,
  initialPrefs,
  headerProps,
  isAdmin = false,
  freeMaxPlays,
  gameModeAvailable = false,
  canUseGameMode = false,
  gameResultsAvailable = false,
}: {
  playbookId: string;
  sportVariant: string;
  playerCount?: number;
  initialPlays: PlaybookDetailPlayRow[];
  initialGroups: PlaybookGroupRow[];
  truncated?: boolean;
  initialRoster: PlaybookRosterMember[];
  initialRosterClaims: PendingRosterClaim[];
  initialInvites: PlaybookInvite[];
  initialFormations: SavedFormation[];
  initialPrefs: PlaybookViewPrefs | null;
  isAdmin?: boolean;
  freeMaxPlays: number;
  /** When true, render the mobile "Game" button next to the search bar. */
  gameModeAvailable?: boolean;
  /** When true, show the "Games" tab for reviewing past game results. */
  gameResultsAvailable?: boolean;
  /** When true, Game Mode is unlocked (Coach+ tier). When false, the button
   *  still renders but opens an upgrade prompt instead of navigating. */
  canUseGameMode?: boolean;
  // Data for the playbook banner. Rendered inside the sticky header region
  // so it stays pinned while plays scroll. Kept as raw data (not JSX) so
  // the client can wire play-action callbacks into the banner's menu.
  headerProps: {
    name: string;
    season: string | null;
    variantLabel: string;
    settings: PlaybookSettings;
    logoUrl: string | null;
    accentColor: string;
    canManage: boolean;
    canShare: boolean;
    viewerIsCoach: boolean;
    senderName: string | null;
    ownerDisplayName: string | null;
    allowCoachDuplication: boolean;
    allowPlayerDuplication: boolean;
    allowGameResultsDuplication: boolean;
    gameResultsAvailable: boolean;
    exampleAdmin: {
      isExample: boolean;
      isPublished: boolean;
      authorLabel: string | null;
    } | null;
    exampleStatus: { isPublished: boolean } | null;
    isExamplePreview?: boolean;
  };
}) {
  const searchParams = useSearchParams();
  const initialTab = (() => {
    // Explicit ?tab= in the URL wins — this is how deep links (e.g.
    // "Invite" routing to ?tab=roster) keep working. Otherwise always
    // land on Plays, since that's the primary surface of a playbook.
    const t = searchParams?.get("tab");
    if (
      t === "plays" ||
      t === "formations" ||
      t === "roster" ||
      t === "staff" ||
      t === "games"
    )
      return t;
    return "plays";
  })();
  const [tab, setTab] = useState<
    "plays" | "formations" | "roster" | "staff" | "games"
  >(initialTab);
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
  const { isPreview, isArchived, blockIfPreview } = useExamplePreview();
  const [pending, startTransition] = useTransition();
  const [copyTarget, setCopyTarget] = useState<CopyTarget | null>(null);
  const [upgradeNotice, setUpgradeNotice] = useState<{ title: string; message: string } | null>(null);
  const [gameModeUpgradeOpen, setGameModeUpgradeOpen] = useState(false);

  function showPlayCapUpgrade() {
    setUpgradeNotice({
      title: `Free tier is capped at ${freeMaxPlays} plays per playbook`,
      message:
        "Upgrade to Coach ($9/mo or $99/yr) for unlimited plays per playbook.",
    });
  }
  // Per-playbook persisted view prefs. Server preloads the row in page.tsx
  // and passes it in as initialPrefs, so state initializes directly from
  // server state — no pre-hydration flash and no per-device drift. Search
  // query is intentionally ephemeral.
  const [q, setQ] = useState("");
  const [view, setView] = useState<"active" | "archived">(
    initialPrefs?.view === "archived" ? "archived" : "active",
  );
  const [typeFilter, setTypeFilter] = useState<PlayType | "all">(
    (initialPrefs?.typeFilter as PlayType | "all" | undefined) ?? "all",
  );
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    const raw = initialPrefs?.groupBy;
    // Legacy "none" migrates to the new default "type" grouping.
    if (raw === "formation" || raw === "group") return raw;
    return "type";
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersPanelRef = useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "list">(
    initialPrefs?.viewMode === "list" ? "list" : "cards",
  );
  const [thumbSize, setThumbSize] = useState<ThumbSize>(
    (initialPrefs?.thumbSize as ThumbSize | undefined) ?? "medium",
  );
  const [showPlayNumbers, setShowPlayNumbers] = useState<boolean>(
    typeof initialPrefs?.showPlayNumbers === "boolean"
      ? initialPrefs.showPlayNumbers
      : true,
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  // Local optimistic order. Mirrors initialPlays but can be mutated during drag
  // so other rows slide into place in real time. Committed to the server on drop.
  const [localPlays, setLocalPlays] = useState<PlaybookDetailPlayRow[]>(initialPlays);
  useEffect(() => {
    setLocalPlays(initialPlays);
  }, [initialPlays]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [selectedPlayIds, setSelectedPlayIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Transient UX for typed-number renumber: lock interaction while tiles
  // glide to their new positions, then flash a ring on the moved play so
  // the user can see what changed. Drag reorders skip this — the drag
  // itself is the feedback.
  const [isReordering, setIsReordering] = useState(false);
  const [highlightPlayId, setHighlightPlayId] = useState<string | null>(null);

  // Debounced server save. Skips the very first effect run so we don't
  // save on mount (state already equals server state). Also skips the
  // first URL-tab override so a deep-link doesn't silently overwrite the
  // saved tab with the linked one.
  const didMountPrefsRef = useRef(false);
  useEffect(() => {
    if (!didMountPrefsRef.current) {
      didMountPrefsRef.current = true;
      return;
    }
    const prefs: PlaybookViewPrefs = {
      tab,
      view,
      typeFilter: typeFilter as PlaybookViewPrefs["typeFilter"],
      groupBy,
      viewMode,
      thumbSize,
      showPlayNumbers,
    };
    const handle = window.setTimeout(() => {
      void setPlaybookViewPrefsAction(playbookId, prefs);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [playbookId, tab, view, typeFilter, groupBy, viewMode, thumbSize, showPlayNumbers]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [showManageGroups, setShowManageGroups] = useState(false);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Formation picker state
  const [showFormationPicker, setShowFormationPicker] = useState(false);
  const [availableFormations, setAvailableFormations] = useState<SavedFormation[]>([]);
  const [loadingFormations, setLoadingFormations] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showViewerCreateHint, setShowViewerCreateHint] = useState(false);
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

  const viewed = localPlays.filter((p) =>
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

    const typeOrder: Record<PlayType, number> = {
      offense: 0,
      defense: 1,
      special_teams: 2,
    };
    const typeLabel: Record<PlayType, string> = {
      offense: "Offense",
      defense: "Defense",
      special_teams: "Special Teams",
    };
    for (const p of filtered) {
      if (groupBy === "type") {
        const order = typeOrder[p.play_type] ?? 99;
        pushInto(p.play_type, typeLabel[p.play_type] ?? p.play_type, order, p);
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
      if (groupBy === "group" || groupBy === "type") return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    });
    for (const s of arr) s.plays.sort((a, b) => a.sort_order - b.sort_order);
    return arr;
  }, [filtered, groupBy, groupById, initialGroups]);

  // Per-section, 1-based position map. Each section (Offense, Defense,
  // Special Teams, or user-defined group) starts its own count at 1 so the
  // orange play-number glyph reads naturally inside its grouping.
  const positionByPlayId = useMemo(() => {
    const m = new Map<string, number>();
    for (const section of sections) {
      section.plays.forEach((p, i) => m.set(p.id, i + 1));
    }
    return m;
  }, [sections]);

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

  const isViewer = (!headerProps.viewerIsCoach && !isPreview) || isArchived;

  function openFormationPicker() {
    if (isViewer) {
      setShowViewerCreateHint(true);
      return;
    }
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
    // Preview mode: a visitor in an example playbook gets a scratch
    // editor with no DB row. Only the formation-based offense flow has
    // a scratch path today — defense/ST templates carry custom player
    // arrays we'd need to serialize, so those still surface the CTA.
    if (isPreview) {
      setShowFormationPicker(false);
      const isOffenseFromFormation =
        (opts?.playType ?? "offense") === "offense" && !opts?.initialPlayers;
      if (isOffenseFromFormation) {
        const q = new URLSearchParams({ playbookId });
        if (formation?.id) q.set("formationId", formation.id);
        router.push(`/plays/new-preview?${q.toString()}`);
      } else {
        blockIfPreview(
          "This flow isn't available in demo mode. Start your own playbook to unlock every template.",
        );
      }
      return;
    }
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
      if (/Free tier|capped at/i.test(res.error)) {
        showPlayCapUpgrade();
      } else {
        toast(res.error, "error");
      }
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
    // Preview mode: go straight to the formation editor with a preview
    // flag — there's no play to anchor returnToPlay against.
    if (isPreview) {
      setShowFormationPicker(false);
      const q = new URLSearchParams({
        preview: "1",
        variant,
        returnToPlaybook: playbookId,
      });
      router.push(`/formations/new?${q.toString()}`);
      return;
    }
    setCreating(true);
    const res = await createPlayAction(playbookId, { initialPlayers: defaultPlayers, variant, playerCount: playbookPlayerCount });
    if (res.ok) {
      // Go to formation editor; when user saves, the formation editor
      // should redirect back to the play. Pass playId as return target.
      router.push(`/formations/new?variant=${variant}&returnToPlay=${res.playId}`);
    } else {
      setCreating(false);
      setShowFormationPicker(false);
      if (/Free tier|capped at/i.test(res.error)) {
        showPlayCapUpgrade();
      } else {
        toast(res.error, "error");
      }
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

  // dnd-kit sensors: pointer for mouse, touch for iPad (short press-delay so
  // vertical scrolling still works), keyboard for a11y. Activation distance
  // on pointer lets ordinary clicks through without starting a drag.
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Map a play id (or a section id, when groupBy === "group") to the section
  // it belongs to. Used by the drag-over handler to detect cross-container
  // moves and update the in-memory list so siblings slide to make room.
  const sectionKeyOfPlay = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of localPlays) {
      if (groupBy === "group") {
        m.set(p.id, p.group_id ?? UNASSIGNED);
      } else if (groupBy === "type") {
        m.set(p.id, p.play_type);
      } else if (groupBy === "formation") {
        m.set(p.id, (p.formation_name?.trim() || "Unassigned formation").toLowerCase());
      } else {
        m.set(p.id, "__all__");
      }
    }
    return m;
  }, [localPlays, groupBy]);

  function findContainerFromId(id: string): string | undefined {
    if (sectionKeyOfPlay.has(id)) return sectionKeyOfPlay.get(id);
    // Id is a section key (e.g. empty group droppable).
    return id;
  }

  // Track the active play's group at drag-start so we can detect a
  // cross-group move on drop and persist it with setPlayGroupAction.
  const dragStartGroupRef = useRef<string | null | undefined>(undefined);

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveDragId(id);
    const play = localPlays.find((p) => p.id === id);
    dragStartGroupRef.current = play?.group_id ?? null;
  }

  // While dragging over a different container (groupBy === "group" only),
  // reassign the active play's group_id in local state. The section memo
  // re-derives and the SortableContexts update in place — siblings slide
  // into the new gap naturally, no flip-flop.
  function handleDragOver(event: DragOverEvent) {
    if (groupBy !== "group") return;
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const activeContainer = findContainerFromId(activeId);
    const overContainer = findContainerFromId(overId);
    if (!activeContainer || !overContainer) return;
    if (activeContainer === overContainer) return;
    const nextGroupId = overContainer === UNASSIGNED ? null : overContainer;
    setLocalPlays((prev) =>
      prev.map((p) => (p.id === activeId ? { ...p, group_id: nextGroupId } : p)),
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const startedGroup = dragStartGroupRef.current;
    dragStartGroupRef.current = undefined;
    setActiveDragId(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const overContainer = findContainerFromId(overId);
    if (!overContainer) return;

    // Work over the full, visually-ordered list so sort_order stays
    // monotonic across sections. Use arrayMove with original indices —
    // it handles drag-up and drag-down uniformly, unlike splice-then-
    // reinsert which mis-positions by one when moving down.
    const ordered = [...localPlays].sort((a, b) => a.sort_order - b.sort_order);
    const oldIndex = ordered.findIndex((p) => p.id === activeId);
    if (oldIndex < 0) return;

    let newIndex: number;
    if (overId === overContainer) {
      // Dropped on the section itself — place at the end of that section.
      const lastInSection = [...ordered]
        .reverse()
        .find(
          (p) => p.id !== activeId && sectionKeyOfPlay.get(p.id) === overContainer,
        );
      newIndex = lastInSection
        ? ordered.findIndex((p) => p.id === lastInSection.id)
        : ordered.length - 1;
    } else {
      const overIdx = ordered.findIndex((p) => p.id === overId);
      newIndex = overIdx < 0 ? ordered.length - 1 : overIdx;
    }
    const crossGroup =
      groupBy === "group" &&
      startedGroup !== undefined &&
      startedGroup !== (overContainer === UNASSIGNED ? null : overContainer);
    if (oldIndex === newIndex && !crossGroup) return;

    const moved = arrayMove(ordered, oldIndex, newIndex);
    const orderMap = new Map(moved.map((p, i) => [p.id, i]));
    setLocalPlays((prev) =>
      prev.map((p) => ({
        ...p,
        sort_order: orderMap.get(p.id) ?? p.sort_order,
      })),
    );

    // Persist sort order — pass the resolved ID list so we don't depend
    // on the React state we just queued.
    commitPlayOrder(moved.map((p) => p.id));

    // If groupBy === "group" and the active play moved to a different group
    // (detected during drag-over or at drop), persist the group change.
    if (groupBy === "group") {
      const newGroup = overContainer === UNASSIGNED ? null : overContainer;
      if (startedGroup !== undefined && startedGroup !== newGroup) {
        startTransition(async () => {
          const res = await setPlayGroupAction(activeId, newGroup);
          if (!res.ok) {
            toast(res.error ?? "Could not move play.", "error");
            router.refresh();
          }
        });
      }
    }
  }

  // Swap a play's position with whichever play currently holds target1Based.
  // Only the two affected rows' sort_order change; everyone else stays put.
  function renumberPlay(sourceId: string, target1Based: number) {
    const viewedOrdered = [...viewed].sort((a, b) => a.sort_order - b.sort_order);
    const tgtIdx = Math.max(0, Math.min(viewedOrdered.length - 1, target1Based - 1));
    const target = viewedOrdered[tgtIdx];
    const source = localPlays.find((p) => p.id === sourceId);
    if (!source || !target || source.id === target.id) return;
    const aOrder = source.sort_order;
    const bOrder = target.sort_order;
    setIsReordering(true);
    setHighlightPlayId(sourceId);
    setLocalPlays((prev) =>
      prev.map((p) => {
        if (p.id === source.id) return { ...p, sort_order: bOrder };
        if (p.id === target.id) return { ...p, sort_order: aOrder };
        return p;
      }),
    );
    startTransition(async () => {
      const res = await swapPlaySortOrderAction(playbookId, source.id, target.id);
      // Hold the lock until the FLIP transition has a moment to play,
      // even if the server returned faster. 400ms matches useFlipReorder's
      // default duration with a small tail so the ring flash lands.
      await new Promise((r) => setTimeout(r, 400));
      setIsReordering(false);
      window.setTimeout(() => {
        setHighlightPlayId((id) => (id === sourceId ? null : id));
      }, 800);
      if (!res.ok) {
        toast(res.error ?? "Could not save play order.", "error");
        router.refresh();
      }
    });
  }

  function commitPlayOrder(orderedIds?: string[]) {
    const ordered =
      orderedIds ??
      [...localPlays]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((p) => p.id);
    startTransition(async () => {
      const res = await reorderPlaysAction(playbookId, ordered);
      if (!res.ok) {
        toast(res.error ?? "Could not save play order.", "error");
        router.refresh();
      }
    });
  }

  function confirmAnd(msg: string, fn: () => void) {
    if (window.confirm(msg)) fn();
  }

  return (
    <div className="space-y-4">
      <UpgradeModal
        open={!!upgradeNotice}
        onClose={() => setUpgradeNotice(null)}
        title={upgradeNotice?.title ?? ""}
        message={upgradeNotice?.message ?? ""}
      />
      <Modal
        open={showViewerCreateHint}
        onClose={() => setShowViewerCreateHint(false)}
        title="Only coaches can add plays"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowViewerCreateHint(false)}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setShowViewerCreateHint(false);
                router.push("/home");
              }}
            >
              Create your own playbook
            </Button>
          </>
        }
      >
        <p className="text-sm text-foreground">
          You have view-only access to this playbook. To add plays, ask the coach
          to grant you edit access, or create your own playbook.
        </p>
      </Modal>
      {/* Sticky header region: back link + playbook identity + slim top bar.
          Desktop: pinned below the global dashboard header (h ≈ 56px = top-14).
          Mobile: the global header is hidden, so pin to the very top (top-0).
          `-mt-8` cancels the dashboard `<main>` py-8 top padding so the
          pre-scroll layout matches the scrolled (compact) layout — same
          spacing in both states. Sticky's `pt-3` and PlaybookHeader's
          `-mt-3` cancel to land the banner flush with the sticky's top.
          Solid bg (not blur) avoids the "appearing header" flicker when
          scroll begins. */}
      <div className="sticky top-0 sm:top-14 z-20 -mx-6 -mt-8 space-y-4 bg-surface px-6 pb-4 pt-3">
        <PlaybookHeader
          playbookId={playbookId}
          name={headerProps.name}
          season={headerProps.season}
          variantLabel={headerProps.variantLabel}
          settings={headerProps.settings}
          logoUrl={headerProps.logoUrl}
          accentColor={headerProps.accentColor}
          canManage={headerProps.canManage}
          canShare={headerProps.canShare}
          viewerIsCoach={headerProps.viewerIsCoach}
          senderName={headerProps.senderName}
          ownerDisplayName={headerProps.ownerDisplayName}
          allowCoachDuplication={headerProps.allowCoachDuplication}
          allowPlayerDuplication={headerProps.allowPlayerDuplication}
          allowGameResultsDuplication={headerProps.allowGameResultsDuplication}
          gameResultsAvailable={headerProps.gameResultsAvailable}
          exampleAdmin={headerProps.exampleAdmin}
          exampleStatus={headerProps.exampleStatus}
          isExamplePreview={headerProps.isExamplePreview}
          isArchived={isArchived}
          playActions={{
            onNewPlay: openFormationPicker,
            onToggleSelect: () => {
              if (selectionMode) {
                setSelectionMode(false);
                setSelectedPlayIds(new Set());
              } else {
                setSelectionMode(true);
              }
            },
            selectionMode,
            creating,
            printHref: `/playbooks/${playbookId}/print`,
            newFormationHref: `/formations/new?variant=${variant}&returnToPlaybook=${playbookId}${isPreview ? "&preview=1" : ""}`,
            isViewer,
          }}
        />

        <PendingApprovalsBanner
          canManage={headerProps.canManage}
          roster={initialRoster}
          onGoTo={(t) => setTab(t)}
        />

        {/* Tabs: on mobile, scroll horizontally so Staff stays reachable
            at narrow widths. Edge-to-edge via -mx-6 + px-6 so the first
            tab aligns with the banner content. */}
        <div className="-mx-6 overflow-x-auto px-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:overflow-visible sm:px-0">
        <div className="border-b border-border min-w-max sm:min-w-0">
          <nav className="-mb-px flex gap-6" aria-label="Playbook sections">
            {(
              [
                { key: "plays" as const, label: "Plays", count: initialPlays.filter((p) => !p.is_archived).length },
                { key: "formations" as const, label: "Formations", count: initialFormations.length },
                { key: "roster" as const, label: "Roster", count: initialRoster.filter((m) => m.role === "viewer").length },
                { key: "staff" as const, label: "Staff", count: initialRoster.filter((m) => m.role !== "viewer").length },
                ...(gameResultsAvailable
                  ? [{ key: "games" as const, label: "Games", count: null as number | null }]
                  : []),
              ] satisfies Array<{ key: "plays" | "formations" | "roster" | "staff" | "games"; label: string; count: number | null }>
            ).map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  aria-current={active ? "page" : undefined}
                  className={`relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-[3px] px-1 pb-3 pt-1 text-base font-bold tracking-tight transition-colors ${
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted hover:text-foreground"
                  }`}
                >
                  {t.label}
                  {t.count != null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                      active ? "bg-primary/10 text-primary" : "bg-surface-inset text-muted"
                    }`}
                  >
                    {t.count}
                  </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
        </div>

        {tab === "plays" && (
        /* Slim top bar: type tabs, search, filters, print, new */
        <div className="flex flex-wrap items-end gap-3">
          {/* Type filter lives in the Filters panel on mobile to save a
              row of vertical space; shown inline on desktop for fast
              switching. */}
          <div className="hidden sm:block">
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
          </div>          <div className="min-w-0 flex-1">
            <Input
              leftIcon={Search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search plays…"
            />
          </div>

          <div ref={filtersPanelRef} className="relative">
            {/* Filters button: text on desktop, icon-only on mobile to free
                room for the Game mode button. The "•" badge remains
                regardless to signal active filters. */}
            <Button
              variant="secondary"
              leftIcon={SlidersHorizontal}
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              aria-label="Filters"
              title="Filters"
              className="px-2.5 sm:px-3"
            >
              <span className="hidden sm:inline">
                {groupBy === "type" && typeFilter === "all" && view === "active"
                  ? "Filters"
                  : "Filters •"}
              </span>
              {!(groupBy === "type" && typeFilter === "all" && view === "active") && (
                <span className="sm:hidden" aria-hidden="true">•</span>
              )}
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
                      { value: "type", label: "Type" },
                      { value: "formation", label: "Formation" },
                      { value: "group", label: "Group" },
                    ]}
                  />
                  <p
                    className="mt-1.5 text-[11px] leading-snug text-muted"
                    title="Type groups plays by Offense, Defense, and Special Teams (in that order)."
                  >
                    Type groups plays by Offense, Defense, then Special Teams.
                  </p>
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
                  <label className="flex cursor-pointer items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      <Hash className="size-3" /> Show play numbers
                    </span>
                    <input
                      type="checkbox"
                      checked={showPlayNumbers}
                      onChange={(e) => setShowPlayNumbers(e.target.checked)}
                      className="size-4 accent-primary"
                    />
                  </label>
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

          {/* Mobile-only Game mode button. Sits next to the filter icon so
              coaches can flip into in-game flow without leaving the plays
              tab. Hidden when the beta feature is off for this user. */}
          {gameModeAvailable && (
            canUseGameMode ? (
              <Link
                href={`/playbooks/${playbookId}/game`}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-brand-green bg-brand-green px-3 text-sm font-semibold text-white hover:bg-brand-green-hover sm:hidden"
                aria-label="Game mode"
              >
                <Gamepad2 className="size-4" />
                <span>Game</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setGameModeUpgradeOpen(true)}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-brand-green bg-brand-green px-3 text-sm font-semibold text-white hover:bg-brand-green-hover sm:hidden"
                aria-label="Game mode"
              >
                <Gamepad2 className="size-4" />
                <span>Game</span>
              </button>
            )
          )}

          {/* Desktop: Select / Reorder / Print / New play as dedicated buttons.
              Mobile: all of these live in the team-banner kebab menu so the
              toolbar stays focused on viewing and filtering plays. Reorder
              isn't exposed on mobile — drag-to-reorder is a desktop gesture. */}
          <Button
            variant={selectionMode ? "primary" : "secondary"}
            leftIcon={CheckSquare}
            onClick={() => {
              if (selectionMode) {
                setSelectionMode(false);
                setSelectedPlayIds(new Set());
              } else {
                setReorderMode(false);
                setSelectionMode(true);
              }
            }}
            aria-label={selectionMode ? "Cancel selection" : "Select plays"}
            title={selectionMode ? "Cancel selection" : "Select plays"}
            className="hidden px-2.5 sm:inline-flex"
          >
            <span className="sr-only">{selectionMode ? "Cancel" : "Select"}</span>
          </Button>
          <Button
            variant={reorderMode ? "primary" : "secondary"}
            leftIcon={ArrowUpDown}
            onClick={() => {
              if (reorderMode) {
                setReorderMode(false);
              } else {
                setSelectionMode(false);
                setSelectedPlayIds(new Set());
                setReorderMode(true);
              }
            }}
            aria-label={reorderMode ? "Done reordering" : "Reorder plays"}
            title={reorderMode ? "Done reordering" : "Reorder plays"}
            className="hidden sm:inline-flex"
          >
            {reorderMode ? "Done" : "Reorder"}
          </Button>
          <Link href={`/playbooks/${playbookId}/print`} className="hidden sm:inline-flex">
            <Button variant="secondary" leftIcon={Printer}>
              Print playbook
            </Button>
          </Link>
          <Button
            variant="primary"
            leftIcon={Plus}
            loading={creating}
            onClick={openFormationPicker}
            title={isViewer ? "Viewers can't create plays" : undefined}
            className={`hidden sm:inline-flex${isViewer ? " opacity-60" : ""}`}
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
          claims={initialRosterClaims}
          invites={initialInvites}
          viewerIsCoach={headerProps.viewerIsCoach}
          teamName={headerProps.name}
          senderName={headerProps.senderName}
        />
      )}

      {tab === "formations" && (
        <PlaybookFormationsTab
          playbookId={playbookId}
          playbookName={headerProps.name}
          variant={variant}
          initial={initialFormations}
          isAdmin={isAdmin}
        />
      )}

      {tab === "staff" && (
        <StaffPanel
          playbookId={playbookId}
          members={initialRoster}
          invites={initialInvites}
          viewerIsCoach={headerProps.viewerIsCoach}
          teamName={headerProps.name}
          senderName={headerProps.senderName}
        />
      )}

      {tab === "games" && gameResultsAvailable && (
        <GameResultsPanel playbookId={playbookId} />
      )}

      {tab === "plays" && (
      <div>
        {truncated && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
            Showing the 2000 most-recent plays. Archive or delete older plays to see more.
          </p>
        )}
        {/* Main area */}
        <div className="min-w-0">
      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          heading="No plays yet"
          description={
            isViewer
              ? "This playbook doesn't have any plays yet. Your coach will add them here."
              : "Create your first play to start designing routes and formations."
          }
          action={
            isViewer ? undefined : (
              <Button variant="primary" leftIcon={Plus} onClick={openFormationPicker} loading={creating}>
                New play
              </Button>
            )
          }
        />
      ) : (
        <div className="relative space-y-6">
          {isReordering && (
            <div className="pointer-events-auto absolute inset-0 z-30 flex items-start justify-center bg-surface/40 pt-6 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-foreground shadow-elevated">
                <Loader2 className="size-3.5 animate-spin text-primary" />
                Reordering plays…
              </div>
            </div>
          )}
          <DndContext
            sensors={dragSensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              dragStartGroupRef.current = undefined;
              setActiveDragId(null);
            }}
          >
          {sections.map((section) => {
            const buildItems = (p: PlaybookDetailPlayRow): ActionMenuItem[] => [
              {
                label: "Rename",
                icon: Pencil,
                onSelect: () => onRenamePlay(p.id, p.name),
              },
              {
                label: "Copy",
                icon: Copy,
                onSelect: () => {
                  setCopyTarget({
                    kind: "play",
                    playId: p.id,
                    playName: p.name,
                    hasFormation: !!p.formation_name,
                    sourceFormationName: p.formation_name,
                  });
                },
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
            const playIds = section.plays.map((p) => p.id);
            return (
              <DroppableContainer
                key={section.key}
                id={section.key}
                disabled={!reorderMode || !isDropTarget}
              >
                {({ setNodeRef: setDroppableRef, isOver }) => (
              <section
                data-section-key={section.key}
                ref={(el) => {
                  setDroppableRef(el);
                  if (el) sectionRefs.current.set(section.key, el);
                  else sectionRefs.current.delete(section.key);
                }}
                className={`scroll-mt-20 space-y-3 rounded-lg transition-colors ${
                  isDropTarget ? "p-2 -m-2" : ""
                } ${reorderMode && isOver && isDropTarget ? "bg-primary/10 outline outline-2 outline-primary/50" : ""}`}
              >
                <div className="flex items-center gap-2 border-b border-border pb-1.5">
                  <h2 className="truncate text-sm font-semibold text-foreground">{section.label}</h2>
                  <Badge variant="default">{section.plays.length}</Badge>
                </div>
                {viewMode === "cards" && (
                  <SortableContext items={playIds} strategy={rectSortingStrategy}>
                  <div className={`grid gap-3 ${SIZE_COL_CLASS[thumbSize]}`}>

                    {section.plays.map((p) => {
                      const isSelected = selectedPlayIds.has(p.id);
                      const position = positionByPlayId.get(p.id);
                      const isHighlighted = highlightPlayId === p.id;
                      return (
                      <SortableItem
                        key={`${section.key}:${p.id}`}
                        id={p.id}
                        disabled={!reorderMode}
                      >
                        {({ setNodeRef, style, attributes, listeners, isDragging }) => (
                      <Card
                        ref={setNodeRef}
                        style={style}
                        {...(reorderMode ? attributes : {})}
                        {...(reorderMode && listeners ? listeners : {})}
                        hover
                        className={`relative flex flex-col p-0 ${reorderMode ? "cursor-grab touch-none select-none active:cursor-grabbing" : selectionMode ? "cursor-pointer" : ""} ${isSelected ? "ring-2 ring-primary" : ""} ${isDragging ? "opacity-40" : ""} ${isHighlighted ? "ring-2 ring-primary ring-offset-2 ring-offset-surface transition-shadow" : ""}`}
                        onClick={
                          selectionMode
                            ? (e) => {
                                e.preventDefault();
                                setSelectedPlayIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(p.id)) next.delete(p.id);
                                  else next.add(p.id);
                                  return next;
                                });
                              }
                            : undefined
                        }
                      >
                        {selectionMode && (
                          <div className="pointer-events-none absolute left-2 top-2 z-10 flex size-5 items-center justify-center rounded border-2 border-primary bg-surface-raised">
                            {isSelected && <Check className="size-3.5 text-primary" />}
                          </div>
                        )}
                        {showPlayNumbers && position != null && !selectionMode && (
                          <div className="absolute left-2 bottom-2 z-10">
                            <EditablePlayNumberBadge
                              value={position}
                              max={localPlays.length}
                              onChange={(n) => renumberPlay(p.id, n)}
                            />
                          </div>
                        )}
                        <Link
                          href={`/plays/${p.id}/edit`}
                          className={`flex flex-1 flex-col px-4 pt-2 pb-4 ${selectionMode || reorderMode ? "pointer-events-none" : ""}`}
                          aria-label={`Open ${p.name}`}
                          tabIndex={selectionMode || reorderMode ? -1 : 0}
                        >
                          <div>
                            <div className="mb-0.5 flex items-center gap-1.5 pr-7">
                              <p className="min-w-0 max-w-[60%] truncate text-[11px] text-muted">
                                {p.formation_name || p.shorthand || "\u00A0"}
                              </p>
                              {p.tags.length > 0 && (
                                <PlayTagChips tags={p.tags} />
                              )}
                              {p.hasNotes && (
                                <span
                                  title="This play has notes"
                                  aria-label="This play has notes"
                                  className="inline-flex shrink-0 items-center text-muted"
                                >
                                  <StickyNote className="size-3.5" />
                                </span>
                              )}
                            </div>
                            <EditablePlayTitle
                              name={p.name}
                              onRename={(next) => onRenamePlayInline(p.id, next)}
                              className="font-semibold"
                            />
                          </div>
                          {p.preview && (
                            <div className="mt-1">
                              <PlayThumbnail preview={p.preview} />
                            </div>
                          )}
                        </Link>
                        {!reorderMode && (
                          <div className="absolute right-2 top-2 flex items-center gap-1">
                            <ActionMenu items={buildItems(p)} />
                          </div>
                        )}
                        {p.play_type !== "offense" && (
                          <div className="pointer-events-none absolute bottom-2 right-2">
                            <PlayTypeBadge type={p.play_type} />
                          </div>
                        )}
                      </Card>
                        )}
                      </SortableItem>
                      );
                    })}
                  </div>
                  </SortableContext>
                )}
                {viewMode === "list" && (
                  <SortableContext items={playIds} strategy={verticalListSortingStrategy}>
                  <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
                    {section.plays.map((p) => {
                      const isSelected = selectedPlayIds.has(p.id);
                      const canReorder = reorderMode;
                      const position = positionByPlayId.get(p.id);
                      const isHighlighted = highlightPlayId === p.id;
                      return (
                      <SortableItem
                        key={`${section.key}:${p.id}`}
                        id={p.id}
                        disabled={!reorderMode}
                      >
                        {({ setNodeRef, style, attributes, listeners, isDragging }) => (
                      <li
                        ref={setNodeRef as unknown as React.Ref<HTMLLIElement>}
                        style={style}
                        className={`flex items-center gap-2 pl-2 pr-2 ${isSelected ? "bg-primary/5" : ""} ${isDragging ? "opacity-40" : ""} ${isHighlighted ? "rounded-md ring-2 ring-primary ring-offset-2 ring-offset-surface transition-shadow" : ""}`}
                      >
                        {canReorder && (
                          <span
                            {...(attributes as HTMLAttributes<HTMLSpanElement>)}
                            {...(listeners ?? {})}
                            className="flex size-5 shrink-0 cursor-grab touch-none items-center justify-center text-muted hover:text-foreground active:cursor-grabbing"
                            aria-label="Drag to reorder"
                            title="Drag to reorder"
                          >
                            <GripVertical className="size-4" />
                          </span>
                        )}
                        {showPlayNumbers && position != null && (
                          <EditablePlayNumberBadge
                            value={position}
                            max={localPlays.length}
                            onChange={(n) => renumberPlay(p.id, n)}
                            className="shrink-0"
                          />
                        )}
                        {selectionMode && (
                          <button
                            type="button"
                            className="flex size-5 items-center justify-center rounded border-2 border-primary bg-surface-raised"
                            onClick={() =>
                              setSelectedPlayIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(p.id)) next.delete(p.id);
                                else next.add(p.id);
                                return next;
                              })
                            }
                            aria-label={isSelected ? "Deselect" : "Select"}
                          >
                            {isSelected && <Check className="size-3.5 text-primary" />}
                          </button>
                        )}
                        <Link
                          href={`/plays/${p.id}/edit`}
                          className={`flex min-w-0 flex-1 items-center gap-2 py-2 hover:opacity-80 ${selectionMode || reorderMode ? "pointer-events-none" : ""}`}
                          tabIndex={selectionMode || reorderMode ? -1 : 0}
                        >
                          {(p.formation_name || p.shorthand) && (
                            <span className="max-w-[140px] shrink-0 truncate text-xs text-muted">
                              {p.formation_name || p.shorthand}
                            </span>
                          )}
                          <EditablePlayTitle
                            name={p.name}
                            onRename={(next) => onRenamePlayInline(p.id, next)}
                            className="shrink-0 text-sm font-medium"
                          />
                          {p.hasNotes && (
                            <span
                              title="This play has notes"
                              aria-label="This play has notes"
                              className="inline-flex shrink-0 items-center text-muted"
                            >
                              <StickyNote className="size-3.5" />
                            </span>
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
                        {!reorderMode && <ActionMenu items={buildItems(p)} />}
                      </li>
                        )}
                      </SortableItem>
                      );
                    })}
                  </ul>
                  </SortableContext>
                )}
              </section>
                )}
              </DroppableContainer>
            );
          })}
          <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
            {activeDragId
              ? (() => {
                  const p = localPlays.find((pl) => pl.id === activeDragId);
                  if (!p) return null;
                  if (viewMode === "cards") {
                    return (
                      <Card className="relative flex cursor-grabbing flex-col p-0 shadow-elevated ring-2 ring-primary">
                        <div className="flex flex-1 flex-col px-4 pt-2 pb-4">
                          <div className="mb-0.5 flex items-center gap-1.5 pr-7">
                            <p className="min-w-0 max-w-[60%] truncate text-[11px] text-muted">
                              {p.formation_name || p.shorthand || "\u00A0"}
                            </p>
                            {p.tags.length > 0 && <PlayTagChips tags={p.tags} />}
                          </div>
                          <span className="font-semibold">{p.name}</span>
                          {p.preview && (
                            <div className="mt-1">
                              <PlayThumbnail preview={p.preview} />
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  }
                  return (
                    <div className="flex items-center gap-2 rounded-md bg-surface-raised pl-2 pr-2 shadow-elevated ring-2 ring-primary">
                      <span className="flex size-5 shrink-0 items-center justify-center text-muted">
                        <GripVertical className="size-4" />
                      </span>
                      <div className="flex min-w-0 flex-1 items-center gap-2 py-2">
                        {(p.formation_name || p.shorthand) && (
                          <span className="max-w-[140px] shrink-0 truncate text-xs text-muted">
                            {p.formation_name || p.shorthand}
                          </span>
                        )}
                        <span className="shrink-0 text-sm font-medium">{p.name}</span>
                      </div>
                    </div>
                  );
                })()
              : null}
          </DragOverlay>
          </DndContext>
        </div>
      )}
        </div>
      </div>

      )}

      {reorderMode && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-surface-raised px-4 py-2 shadow-elevated">
            <ArrowUpDown className="size-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Drag plays to reorder
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setReorderMode(false)}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {selectionMode && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-surface-raised px-4 py-2 shadow-elevated sm:gap-3 sm:rounded-full">
            <span className="text-sm font-medium text-foreground">
              {selectedPlayIds.size} selected
            </span>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => {
                const allVisible = new Set(filtered.map((p) => p.id));
                const allOn = filtered.every((p) => selectedPlayIds.has(p.id));
                setSelectedPlayIds((prev) => {
                  const next = new Set(prev);
                  if (allOn) {
                    for (const id of allVisible) next.delete(id);
                  } else {
                    for (const id of allVisible) next.add(id);
                  }
                  return next;
                });
              }}
            >
              {filtered.every((p) => selectedPlayIds.has(p.id)) && filtered.length > 0
                ? "Clear visible"
                : "Select all visible"}
            </button>
            <button
              type="button"
              className="text-xs font-medium text-muted hover:text-foreground"
              onClick={() => {
                setSelectionMode(false);
                setSelectedPlayIds(new Set());
              }}
            >
              Cancel
            </button>
            {!isViewer && (
              <Button
                variant="ghost"
                leftIcon={view === "archived" ? ArchiveRestore : Archive}
                disabled={selectedPlayIds.size === 0}
                onClick={() => {
                  const ids = Array.from(selectedPlayIds);
                  const archiving = view !== "archived";
                  handle(
                    async () => {
                      for (const id of ids) {
                        const res = await archivePlayAction(id, archiving);
                        if (!res.ok) return res;
                      }
                      return { ok: true as const };
                    },
                    () => {
                      toast(
                        `${ids.length} ${ids.length === 1 ? "play" : "plays"} ${archiving ? "archived" : "restored"}.`,
                        "success",
                      );
                      setSelectionMode(false);
                      setSelectedPlayIds(new Set());
                    },
                  );
                }}
              >
                {view === "archived" ? "Restore" : "Archive"}
              </Button>
            )}
            {!isViewer && (
              <Button
                variant="ghost"
                leftIcon={Trash2}
                disabled={selectedPlayIds.size === 0}
                onClick={() => {
                  const ids = Array.from(selectedPlayIds);
                  const n = ids.length;
                  if (
                    !window.confirm(
                      `Delete ${n} ${n === 1 ? "play" : "plays"}? This can't be undone.`,
                    )
                  )
                    return;
                  handle(
                    async () => {
                      for (const id of ids) {
                        const res = await deletePlayAction(id);
                        if (!res.ok) return res;
                      }
                      return { ok: true as const };
                    },
                    () => {
                      toast(
                        `${n} ${n === 1 ? "play" : "plays"} deleted.`,
                        "success",
                      );
                      setSelectionMode(false);
                      setSelectedPlayIds(new Set());
                    },
                  );
                }}
                className="text-danger hover:text-danger"
              >
                Delete
              </Button>
            )}
            <Button
              variant="primary"
              leftIcon={Printer}
              disabled={selectedPlayIds.size === 0}
              onClick={() => {
                const ids = Array.from(selectedPlayIds).join(",");
                router.push(`/playbooks/${playbookId}/print?plays=${ids}`);
              }}
            >
              Print {selectedPlayIds.size} {selectedPlayIds.size === 1 ? "play" : "plays"}
            </Button>
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
      <GameModeUpgradeDialog
        open={gameModeUpgradeOpen}
        onClose={() => setGameModeUpgradeOpen(false)}
      />
      {copyTarget && (
        <CopyToPlaybookDialog
          open={!!copyTarget}
          onClose={() => setCopyTarget(null)}
          currentPlaybookId={playbookId}
          currentPlaybookName={headerProps.name}
          currentSportVariant={sportVariant}
          target={copyTarget}
          toast={toast}
          onCopied={(result) => {
            if (result.playbookId === playbookId && result.playId) {
              // Local copy — jump to edit, matching old duplicate behavior.
              router.push(`/plays/${result.playId}/edit`);
            } else if (result.playbookId !== playbookId) {
              // Cross-playbook — send the coach to the destination playbook.
              router.push(`/playbooks/${result.playbookId}`);
            } else {
              // Formation copy within current playbook — refresh the tab.
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}

function RosterPanel({
  playbookId,
  members,
  claims,
  invites,
  viewerIsCoach,
  teamName,
  senderName,
}: {
  playbookId: string;
  members: PlaybookRosterMember[];
  claims: PendingRosterClaim[];
  invites: PlaybookInvite[];
  viewerIsCoach: boolean;
  teamName: string;
  senderName: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [upgradeNotice, setUpgradeNotice] = useState<{ title: string; message: string } | null>(null);
  function openInvite() {
    if (!viewerIsCoach) {
      setUpgradeNotice({
        title: "Sharing a playbook is a Coach feature",
        message: "Upgrade to Coach ($9/mo or $99/yr) to invite players and share playbooks.",
      });
      return;
    }
    setShowInviteModal(true);
  }
  function openAddPlayer() {
    if (!viewerIsCoach) {
      setUpgradeNotice({
        title: "Managing the roster is a Coach feature",
        message: "Upgrade to Coach ($9/mo or $99/yr) to add players to the roster.",
      });
      return;
    }
    setShowAddPlayerModal(true);
  }
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Roster tab is player-only; coaches (owner/editor) live in the Staff tab.
  const players = members.filter((m) => m.role === "viewer");
  // Unclaimed roster entries (user_id = null) are pre-added by a coach
  // and haven't been linked to a user yet. They can only ever be
  // role=viewer, status=active (enforced in the DB), so anything that
  // acts on a specific user — approvals, coach upgrades, staff actions
  // — is guarded by a non-null user_id narrow below.
  const pending = players.filter(
    (m): m is PlaybookRosterMember & { user_id: string } =>
      m.status === "pending" && m.user_id !== null,
  );
  const coachUpgradeRequests = players.filter(
    (m): m is PlaybookRosterMember & { user_id: string } =>
      m.status === "active" &&
      !!m.coach_upgrade_requested_at &&
      m.user_id !== null,
  );
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
  async function approveCoachUpgrade(userId: string) {
    setPendingId(userId);
    const res = await approveCoachUpgradeAction(playbookId, userId);
    setPendingId(null);
    if (!res.ok) toast(`Grant failed: ${res.error}`, "error");
    else router.refresh();
  }
  async function denyCoachUpgrade(userId: string) {
    setPendingId(userId);
    const res = await denyCoachUpgradeAction(playbookId, userId);
    setPendingId(null);
    if (!res.ok) toast(`Deny failed: ${res.error}`, "error");
    else router.refresh();
  }
  async function revoke(inviteId: string) {
    const res = await revokeInviteAction(inviteId, playbookId);
    if (!res.ok) toast(`Revoke failed: ${res.error}`, "error");
    else router.refresh();
  }
  async function unlinkUser(memberId: string, name: string) {
    if (
      !window.confirm(
        `Unlink ${name} from this roster spot? They keep playbook access; the spot returns to unclaimed.`,
      )
    )
      return;
    setPendingId(memberId);
    const res = await unlinkRosterEntryAction(playbookId, memberId);
    setPendingId(null);
    if (!res.ok) toast(`Unlink failed: ${res.error}`, "error");
    else router.refresh();
  }
  async function deleteEntry(memberId: string, name: string) {
    if (!window.confirm(`Remove ${name} from the roster?`)) return;
    setPendingId(memberId);
    const res = await deleteRosterEntryAction(playbookId, memberId);
    setPendingId(null);
    if (!res.ok) toast(`Remove failed: ${res.error}`, "error");
    else router.refresh();
  }
  async function approveClaim(claimId: string) {
    setPendingId(claimId);
    const res = await approveRosterClaimAction(playbookId, claimId);
    setPendingId(null);
    if (!res.ok) toast(`Approve failed: ${res.error}`, "error");
    else router.refresh();
  }
  async function rejectClaim(claimId: string) {
    setPendingId(claimId);
    const res = await rejectRosterClaimAction(playbookId, claimId);
    setPendingId(null);
    if (!res.ok) toast(`Reject failed: ${res.error}`, "error");
    else router.refresh();
  }

  // Group pending claims by the roster entry they target so collisions
  // (two users claiming the same player) show up as a single decision.
  const claimsByMember = new Map<string, PendingRosterClaim[]>();
  for (const c of claims) {
    const list = claimsByMember.get(c.memberId) ?? [];
    list.push(c);
    claimsByMember.set(c.memberId, list);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Roster</h2>
          <p className="text-xs text-muted">Players and coaches with access to this playbook.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {viewerIsCoach && (
            <Button variant="secondary" leftIcon={Plus} onClick={openAddPlayer}>
              Add player
            </Button>
          )}
          <Button variant="primary" leftIcon={Plus} onClick={openInvite}>
            Invite
          </Button>
        </div>
      </div>

      {claimsByMember.size > 0 && (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            Player claims
            <span className="ml-2 rounded-full bg-primary/20 px-2 py-0.5 text-[11px] text-primary">
              {claims.length}
            </span>
          </h3>
          <p className="mb-3 text-xs text-muted">
            A player joined and is asking to be linked to a roster spot.
            Approve only if the right person is claiming.
          </p>
          <ul className="space-y-3">
            {Array.from(claimsByMember.entries()).map(([memberId, group]) => {
              const first = group[0]!;
              const slot = [
                first.memberLabel || "Unnamed player",
                first.memberJerseyNumber ? `#${first.memberJerseyNumber}` : null,
                first.memberPositions.length > 0
                  ? first.memberPositions.join(", ")
                  : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li
                  key={memberId}
                  className="rounded-lg border border-border bg-surface-raised p-3"
                >
                  <p className="mb-2 text-sm font-semibold text-foreground">
                    {slot}
                  </p>
                  {group.length > 1 && (
                    <p className="mb-2 text-[11px] font-semibold text-warning">
                      {group.length} people are claiming this spot —
                      approving one will reject the others.
                    </p>
                  )}
                  <ul className="divide-y divide-border">
                    {group.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-foreground">
                            {c.userDisplayName || c.userId.slice(0, 8)}
                          </p>
                          {c.note && (
                            <p className="truncate text-xs text-muted">
                              &ldquo;{c.note}&rdquo;
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="primary"
                            leftIcon={Check}
                            loading={pendingId === c.id}
                            onClick={() => approveClaim(c.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            leftIcon={X}
                            disabled={pendingId === c.id}
                            onClick={() => rejectClaim(c.id)}
                          >
                            Reject
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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

      {coachUpgradeRequests.length > 0 && (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            Coach access requests
            <span className="ml-2 rounded-full bg-primary/20 px-2 py-0.5 text-[11px] text-primary">
              {coachUpgradeRequests.length}
            </span>
          </h3>
          <p className="mb-2 text-xs text-muted">
            These players asked to be upgraded to coach (edit privileges).
          </p>
          <ul className="divide-y divide-border">
            {coachUpgradeRequests.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {m.label || m.display_name || m.user_id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-muted">
                    Currently a player — requesting coach access
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="primary"
                    leftIcon={Check}
                    loading={pendingId === m.user_id}
                    onClick={() => approveCoachUpgrade(m.user_id)}
                  >
                    Grant
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={X}
                    disabled={pendingId === m.user_id}
                    onClick={() => denyCoachUpgrade(m.user_id)}
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
                  {viewerIsCoach && <th className="w-10 px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {active.map((m) => {
                  const name = m.label || m.display_name || "—";
                  const unclaimed = m.user_id === null;
                  const items: ActionMenuItem[] = unclaimed
                    ? [
                        {
                          label: "Remove from roster",
                          icon: Trash2,
                          danger: true,
                          onSelect: () => deleteEntry(m.id, name),
                        },
                      ]
                    : [
                        {
                          label: "Unlink user",
                          icon: X,
                          onSelect: () => unlinkUser(m.id, name),
                        },
                      ];
                  return (
                    <tr key={m.id}>
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        <span className="inline-flex items-center gap-2">
                          {name}
                          {unclaimed && (
                            <Badge variant="default" className="text-[10px]">
                              Unclaimed
                            </Badge>
                          )}
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
                      <td className="px-4 py-2.5 text-muted">
                        {m.positions && m.positions.length > 0
                          ? m.positions.join(", ")
                          : m.position || "—"}
                      </td>
                      {viewerIsCoach && (
                        <td className="px-4 py-2.5 text-right">
                          <ActionMenu items={items} />
                        </td>
                      )}
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
        <InviteTeamMemberDialog
          playbookId={playbookId}
          teamName={teamName}
          senderName={senderName}
          onClose={() => {
            setShowInviteModal(false);
            router.refresh();
          }}
        />
      )}

      <AddPlayerDialog
        open={showAddPlayerModal}
        playbookId={playbookId}
        onClose={() => setShowAddPlayerModal(false)}
        onAdded={() => {
          setShowAddPlayerModal(false);
          router.refresh();
        }}
      />

      <UpgradeModal
        open={!!upgradeNotice}
        onClose={() => setUpgradeNotice(null)}
        title={upgradeNotice?.title ?? ""}
        message={upgradeNotice?.message ?? ""}
      />
    </div>
  );
}

const ADD_PLAYER_POSITIONS = [
  "QB",
  "RB",
  "WR",
  "TE",
  "OL",
  "DL",
  "LB",
  "DB",
  "K",
] as const;

function AddPlayerDialog({
  open,
  playbookId,
  onClose,
  onAdded,
}: {
  open: boolean;
  playbookId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [jersey, setJersey] = useState("");
  const [positions, setPositions] = useState<Set<string>>(new Set());
  const [isMinor, setIsMinor] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset form whenever the dialog is re-opened.
  useEffect(() => {
    if (open) {
      setLabel("");
      setJersey("");
      setPositions(new Set());
      setIsMinor(false);
    }
  }, [open]);

  function togglePos(p: string) {
    setPositions((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  async function save() {
    const name = label.trim();
    if (!name) {
      toast("Name is required.", "error");
      return;
    }
    setSaving(true);
    const res = await addRosterEntryAction({
      playbookId,
      label: name,
      jerseyNumber: jersey.trim() || null,
      positions: Array.from(positions),
      isMinor,
    });
    setSaving(false);
    if (!res.ok) {
      toast(`Couldn't add player: ${res.error}`, "error");
      return;
    }
    onAdded();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add player"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            Add to roster
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-muted">
          Creates an unclaimed roster spot. When the player joins via an invite
          link, they&apos;ll see this name in the &ldquo;Claim your player&rdquo;
          step and you&apos;ll approve the match.
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Name</label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Jane Doe"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            Jersey number
          </label>
          <Input
            value={jersey}
            onChange={(e) => setJersey(e.target.value)}
            placeholder="12"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            Positions
          </label>
          <div className="flex flex-wrap gap-1.5">
            {ADD_PLAYER_POSITIONS.map((p) => {
              const on = positions.has(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePos(p)}
                  className={`rounded-md px-2 py-1 text-xs font-semibold ring-1 ${
                    on
                      ? "bg-primary/10 text-primary ring-primary/40"
                      : "bg-surface-inset text-muted ring-border hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isMinor}
            onChange={(e) => setIsMinor(e.target.checked)}
          />
          Minor (under 18)
        </label>
      </div>
    </Modal>
  );
}

function InviteRow({ invite, onRevoke }: { invite: PlaybookInvite; onRevoke: () => void }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const url = `${SITE_URL}/invite/${invite.token}`;

  const expiresLabel = new Date(invite.expires_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const usesLabel = invite.max_uses
    ? `${invite.uses_count}/${invite.max_uses} used`
    : `${invite.uses_count} used`;
  const approvalLabel = invite.auto_approve
    ? invite.auto_approve_limit
      ? `auto-join (${Math.max(0, invite.auto_approve_limit - invite.uses_count)} left, then approval)`
      : "auto-join"
    : "approval required";

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
          {approvalLabel} · {usesLabel} · expires {expiresLabel}
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

function PlayTagChips({ tags, max = 2 }: { tags: string[]; max?: number }) {
  const shown = tags.slice(0, max);
  const overflow = tags.slice(max);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
      {shown.map((t) => (
        <span
          key={t}
          className="max-w-[80px] shrink truncate rounded-full border border-border bg-surface-inset px-1.5 py-0.5 text-[10px] font-medium text-muted"
          title={t}
        >
          {t}
        </span>
      ))}
      {overflow.length > 0 && (
        <span
          className="shrink-0 rounded-full border border-border bg-surface-inset px-1.5 py-0.5 text-[10px] font-medium text-muted"
          title={overflow.join(", ")}
        >
          +{overflow.length}
        </span>
      )}
    </div>
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
  viewerIsCoach,
  teamName,
  senderName,
}: {
  playbookId: string;
  members: PlaybookRosterMember[];
  invites: PlaybookInvite[];
  viewerIsCoach: boolean;
  teamName: string;
  senderName: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [upgradeNotice, setUpgradeNotice] = useState<{ title: string; message: string } | null>(null);
  function openInvite() {
    if (!viewerIsCoach) {
      setUpgradeNotice({
        title: "Sharing a playbook is a Coach feature",
        message: "Upgrade to Coach ($9/mo or $99/yr) to invite coaches and share playbooks.",
      });
      return;
    }
    setShowInviteModal(true);
  }
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Coaches = owner/editor; players live in the Roster tab. Unclaimed
  // roster entries are always role=viewer so they can't land here, but
  // the null-narrow keeps TS happy and guards the actions below.
  const coaches = members.filter(
    (m): m is PlaybookRosterMember & { user_id: string } =>
      m.role !== "viewer" && m.user_id !== null,
  );
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
          onClick={openInvite}
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
        <InviteTeamMemberDialog
          playbookId={playbookId}
          teamName={teamName}
          senderName={senderName}
          onClose={() => {
            setShowInviteModal(false);
            router.refresh();
          }}
        />
      )}

      <UpgradeModal
        open={!!upgradeNotice}
        onClose={() => setUpgradeNotice(null)}
        title={upgradeNotice?.title ?? ""}
        message={upgradeNotice?.message ?? ""}
      />
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
  const [pending, setPending] = useState<string | null>(null);
  const savedRef = useRef(false);

  useEffect(() => {
    if (!editing) setValue(name);
  }, [name, editing]);

  // Clear the optimistic pending label once the server round-trip lands
  // (name prop catches up) or after a safety timeout.
  useEffect(() => {
    if (pending == null) return;
    if (name === pending) {
      setPending(null);
      return;
    }
    const t = setTimeout(() => setPending(null), 5000);
    return () => clearTimeout(t);
  }, [name, pending]);

  function stop(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function commit() {
    if (savedRef.current) return;
    savedRef.current = true;
    const next = value.trim();
    if (next && next !== name) {
      setPending(next);
      onRename(next);
    }
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
        className={`min-w-0 w-full rounded-md border border-primary bg-surface px-1.5 py-0.5 text-xs text-foreground focus:outline-none ${className}`}
        aria-label="Rename play"
      />
    );
  }

  const displayName = pending ?? name;
  return (
    <span className="group/title flex min-w-0 flex-1 items-center gap-1">
      <span
        className={`min-w-0 truncate text-foreground ${pending ? "opacity-60" : ""} ${className}`}
      >
        {displayName}
      </span>
      {pending ? (
        <Loader2
          className="size-3.5 shrink-0 animate-spin text-muted"
          aria-label="Saving…"
        />
      ) : (
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
      )}
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

function PendingApprovalsBanner({
  canManage,
  roster,
  onGoTo,
}: {
  canManage: boolean;
  roster: PlaybookRosterMember[];
  onGoTo: (tab: "roster" | "staff") => void;
}) {
  if (!canManage) return null;
  const pending = roster.filter((m) => m.status === "pending");
  const upgradeRequests = roster.filter(
    (m) =>
      m.status === "active" &&
      m.role === "viewer" &&
      m.coach_upgrade_requested_at,
  );
  if (pending.length + upgradeRequests.length === 0) return null;
  const viewerPending =
    pending.filter((m) => m.role === "viewer").length + upgradeRequests.length;
  const staffPending = pending.length - pending.filter((m) => m.role === "viewer").length;
  const primaryTab: "roster" | "staff" =
    viewerPending >= staffPending ? "roster" : "staff";
  const secondaryTab: "roster" | "staff" =
    primaryTab === "roster" ? "staff" : "roster";
  const secondaryCount = primaryTab === "roster" ? staffPending : viewerPending;
  const primaryCount = primaryTab === "roster" ? viewerPending : staffPending;
  const tabLabel = (t: "roster" | "staff") =>
    t === "roster" ? "Roster" : "Staff";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
      <p className="text-sm text-foreground">
        <span className="font-semibold">
          {pending.length + upgradeRequests.length}
        </span>{" "}
        pending request
        {pending.length + upgradeRequests.length === 1 ? "" : "s"} to review.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onGoTo(primaryTab)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
        >
          Review in {tabLabel(primaryTab)} ({primaryCount})
        </button>
        {secondaryCount > 0 && (
          <button
            type="button"
            onClick={() => onGoTo(secondaryTab)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground hover:bg-surface-inset"
          >
            {tabLabel(secondaryTab)} ({secondaryCount})
          </button>
        )}
      </div>
    </div>
  );
}
