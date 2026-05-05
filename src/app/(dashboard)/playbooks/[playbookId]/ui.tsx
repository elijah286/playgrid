"use client";

import Link from "next/link";
import {
  ExamplePreviewProvider,
  useExamplePreview,
} from "@/features/admin/ExamplePreviewContext";
import type { ReferralConfig } from "@/lib/site/referral-config";
import { PlayThumbnail } from "@/features/editor/PlayThumbnail";
import { track } from "@/lib/analytics/track";
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
  ClipboardCopy,
  Copy,
  Crown,
  FileText,
  FolderInput,
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
  Sparkles,
  StickyNote,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import {
  archivePlayAction,
  createPlayAction,
  createPlaybookGroupAction,
  deletePlayAction,
  deletePlaybookGroupAction,
  getPlayForEditorAction,
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
import {
  MovePlayToGroupDialog,
  type MovePlayToGroupTarget,
} from "@/features/playbooks/MovePlayToGroupDialog";
import { GameModeUpgradeDialog } from "@/features/game-mode/GameModeUpgradeDialog";
import { PlaybookCalendarTab } from "@/features/calendar/PlaybookCalendarTab";
import { PlaybookPracticePlansTab } from "@/features/practice-plans/PlaybookPracticePlansTab";
import { TrashDrawer } from "@/features/versions/TrashDrawer";
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
  bulkAddRosterEntriesAction,
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
  setMemberRoleAction,
  updateRosterEntryAction,
  linkRosterEntryAction,
  unlinkRosterEntryAction,
  claimRosterSlotAction,
} from "@/app/actions/playbook-roster";
import { type PlaybookInvite } from "@/app/actions/invites";
import { setPlaybookViewPrefsAction } from "@/app/actions/playbook-view-prefs";
import type { PlaybookViewPrefs } from "@/domain/playbook/view-prefs";
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
import { PlaybookHeader, type PlaybookHeaderPlayActions } from "./PlaybookHeader";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { PlaybookAnchorPublisher } from "@/features/coach-ai/PlaybookAnchorPublisher";
import { CoachCalCTA } from "@/features/coach-ai/CoachCalCTA";
import { openCoachCal } from "@/features/coach-ai/openCoachCal";
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
  tab?: "plays" | "formations" | "roster" | "games" | "calendar";
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
  // Fire an example_view impression once per (session, playbook) so the
  // admin Engagement tab can compute example_view → example_cta_click →
  // signup conversion. Skipped when the viewer isn't on the example
  // preview path (members of the playbook etc.).
  const isPreview = !!props.isExamplePreview;
  const playbookId = props.playbookId;
  useEffect(() => {
    if (!isPreview) return;
    track({
      event: "example_view",
      target: playbookId,
      metadata: { playbook_id: playbookId },
    });
  }, [isPreview, playbookId]);

  return (
    <ExamplePreviewProvider
      isPreview={props.isExamplePreview ?? false}
      isArchived={props.isArchived ?? false}
      playbookId={props.playbookId}
      canUnarchive={props.headerProps.canManage}
    >
      <PlaybookAnchorPublisher
        playbookId={props.playbookId}
        playbookName={props.headerProps.name}
        playbookColor={props.headerProps.accentColor}
      />
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
  teamCalendarAvailable = false,
  initialCalendarUpcomingTotal = 0,
  versionHistoryAvailable = false,
  practicePlansAvailable = false,
  canUseTeamFeatures = false,
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
  /** When true, show the "Calendar" tab gated by the team_calendar beta. */
  teamCalendarAvailable?: boolean;
  /** When true, expose the Trash + History coach-only UIs (version_history beta). */
  versionHistoryAvailable?: boolean;
  /** When true, show the "Practice Plans" tab (practice_plans beta). */
  practicePlansAvailable?: boolean;
  /** Total upcoming events — drives the neutral Calendar tab count. */
  initialCalendarUpcomingTotal?: number;
  /** When true, Game Mode is unlocked (Coach+ tier). When false, the button
   *  still renders but opens an upgrade prompt instead of navigating. */
  canUseGameMode?: boolean;
  /** When true, the viewer's tier unlocks team features (calendar, practice
   *  plans). When false, those tabs render an upgrade pitch instead. */
  canUseTeamFeatures?: boolean;
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
    suggestedDuplicateName: string;
    exampleAdmin: {
      isExample: boolean;
      isPublished: boolean;
      isHero: boolean;
      authorLabel: string | null;
    } | null;
    exampleStatus: { isPublished: boolean } | null;
    isExamplePreview?: boolean;
    /** True iff this user can actually use Coach Cal (mirrors SiteHeader's
     *  coachAiAvailable). Drives the in-playbook mobile launcher. */
    coachAiAvailable: boolean;
    /** True when Coach Cal is launched globally and this user lacks it —
     *  mobile launcher button shows the marketing flow instead of the chat. */
    showCoachCalPromo: boolean;
    /** Coach AI eval window length in days (admin-configurable). */
    coachAiEvalDays: number;
    /** Surfaces the referral promo on the Share dialog when enabled. */
    referralConfig: ReferralConfig;
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
      t === "games" ||
      t === "calendar"
    )
      return t;
    // Legacy: staff tab merged into roster
    if (t === "staff") return "roster";
    return "plays";
  })();
  const [tab, setTab] = useState<
    "plays" | "formations" | "roster" | "games" | "calendar" | "practice_plans"
  >(initialTab);

  // Re-sync tab when ?tab= changes mid-mount — e.g. clicking an "Open calendar"
  // link Coach Cal emitted while the user is already on this playbook page.
  // Without this, useState's initial value sticks and the tab doesn't move.
  useEffect(() => {
    const t = searchParams?.get("tab");
    if (t === "plays" || t === "formations" || t === "roster" || t === "games" || t === "calendar" || t === "practice_plans") {
      setTab(t);
    } else if (t === "staff") {
      setTab("roster");
    }
  }, [searchParams]);
  const [calendarUpcomingTotal, setCalendarUpcomingTotal] = useState(
    initialCalendarUpcomingTotal,
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
  const { isPreview, isArchived, blockIfPreview } = useExamplePreview();
  const [pending, startTransition] = useTransition();
  const [copyTarget, setCopyTarget] = useState<CopyTarget | null>(null);
  const [moveTarget, setMoveTarget] = useState<MovePlayToGroupTarget | null>(null);
  const [upgradeNotice, setUpgradeNotice] = useState<{ title: string; message: string } | null>(null);
  const [gameModeUpgradeOpen, setGameModeUpgradeOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);

  function showPlayCapUpgrade() {
    setUpgradeNotice({
      title: `Free tier is capped at ${freeMaxPlays} plays per playbook`,
      message:
        "Upgrade to Team Coach ($9/mo or $99/yr) for unlimited plays per playbook.",
    });
  }
  // Per-playbook persisted view prefs. Server preloads the row in page.tsx
  // and passes it in as initialPrefs, so state initializes directly from
  // server state — no pre-hydration flash and no per-device drift. Search
  // query is intentionally ephemeral.
  const [q, setQ] = useState("");
  // Archive-view is intentionally NOT restored from saved prefs. Coaches
  // almost always switch to "Archived" for a one-off "let me find that old
  // play" task; persisting it across reloads creates the easy-to-miss
  // failure mode where they come back later, see a near-empty list, and
  // wonder where their plays went. Always boot in Active; the visible
  // banner that appears when they toggle to Archived (below, near the play
  // list) is the safety net while the filter is on.
  const [view, setView] = useState<"active" | "archived">("active");
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
      practice_plan: 3,
    };
    const typeLabel: Record<PlayType, string> = {
      offense: "Offense",
      defense: "Defense",
      special_teams: "Special Teams",
      practice_plan: "Practice Plan",
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

  // Read-only when the viewer's role on this playbook is "viewer" (or no
  // role at all, for example previews). Owners and editors can always edit
  // their own content regardless of billing tier — the play editor itself
  // is free; only Team Coach features (sharing, duplication, Game Mode)
  // are tier-gated and use viewerIsCoach via dedicated upgrade prompts.
  const isViewer = (!headerProps.canShare && !isPreview) || isArchived;

  function openFormationPicker() {
    if (isViewer) {
      setShowViewerCreateHint(true);
      return;
    }
    // First-play fast path: a brand-new playbook with no plays yet skips the
    // formation picker and drops the user straight into the editor on the
    // default formation. The picker is still shown for every play after the
    // first, where the user has more context for the choice.
    if (initialPlays.length === 0 && !isPreview) {
      void createWithFormation();
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

  // Optimistically remove plays from the visible list so the UI feels instant.
  // The server action still runs inside a transition; on failure we restore
  // the snapshot and surface the error.
  function handleDeletePlays(ids: string[], onOk?: () => void) {
    const idSet = new Set(ids);
    const snapshot = localPlays;
    setLocalPlays((prev) => prev.filter((p) => !idSet.has(p.id)));
    startTransition(async () => {
      for (const id of ids) {
        const res = await deletePlayAction(id);
        if (!res.ok) {
          setLocalPlays(snapshot);
          toast(res.error ?? "Could not delete.", "error");
          return;
        }
      }
      onOk?.();
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
          suggestedDuplicateName={headerProps.suggestedDuplicateName}
          exampleAdmin={headerProps.exampleAdmin}
          exampleStatus={headerProps.exampleStatus}
          isExamplePreview={headerProps.isExamplePreview}
          isArchived={isArchived}
          outstandingInviteCount={
            initialInvites.filter(
              (i) => !i.revoked_at && new Date(i.expires_at) > new Date(),
            ).length
          }
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
            // Suppress "New formation" in the mobile kebab when this is a
            // brand-new empty playbook — same condition that hides the
            // Formations tab. Two new-coach session replays in two days
            // (Anton 04/29, Ralph 04/30) tapped this item, ended up on a
            // blank formation editor, and bounced without creating a play.
            newFormationHref:
              initialPlays.length === 0 && !isViewer && !isPreview
                ? null
                : `/formations/new?variant=${variant}&returnToPlaybook=${playbookId}${isPreview ? "&preview=1" : ""}`,
            isViewer,
          }}
          versionHistoryAvailable={versionHistoryAvailable}
          onOpenTrash={
            headerProps.canManage ? () => setTrashOpen(true) : null
          }
          coachAiAvailable={headerProps.coachAiAvailable}
          showCoachCalPromo={headerProps.showCoachCalPromo}
          coachAiEvalDays={headerProps.coachAiEvalDays}
          isAdmin={isAdmin}
          referralConfig={headerProps.referralConfig}
        />

        <PendingApprovalsBanner
          canManage={headerProps.canManage}
          roster={initialRoster}
          onGoTo={(t) => setTab(t)}
        />

        {(!headerProps.canManage || isPreview) && (
          <BuildYourOwnBanner
            playbookId={playbookId}
            ownerName={headerProps.ownerDisplayName}
            isExample={isPreview || headerProps.exampleStatus !== null}
          />
        )}

        {headerProps.canManage &&
          !isPreview &&
          initialRoster.filter(
            (m) => (m.role === "editor" || m.role === "owner") && !!m.user_id,
          ).length <= 1 &&
          initialInvites.filter(
            (i) => !i.revoked_at && new Date(i.expires_at) > new Date(),
          ).length === 0 && <ShareFirstBanner />}

        {/* Tabs: on mobile, scroll horizontally so all tabs stay reachable
            at narrow widths. Edge-to-edge via -mx-6 + px-6 so the first
            tab aligns with the banner content. */}
        <div className="-mx-6 overflow-x-auto px-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:overflow-visible sm:px-0">
        <div className="border-b border-border min-w-max sm:min-w-0">
          <nav className="-mb-px flex gap-6" aria-label="Playbook sections">
            {(() => {
              // Empty-playbook simplification: a brand-new owner/editor with
              // zero plays sees only the Plays tab. Formations + Roster +
              // Calendar etc. lured at least one user (Anton, 04/29) into
              // an 8-minute side-quest that ended in a frustrated bounce.
              // Re-expand after the first play is created.
              const noPlaysYet = initialPlays.length === 0 && !isViewer && !isPreview;
              const tabs: Array<{
                key: "plays" | "formations" | "roster" | "games" | "calendar" | "practice_plans";
                label: string;
                count: number | null;
                variant: "default";
              }> = [
                {
                  key: "plays",
                  label: "Plays",
                  count: initialPlays.filter((p) => !p.is_archived).length,
                  variant: "default",
                },
              ];
              if (!noPlaysYet) {
                tabs.push({
                  key: "formations",
                  label: "Formations",
                  count: initialFormations.length,
                  variant: "default",
                });
                tabs.push({
                  key: "roster",
                  label: "Roster",
                  count: initialRoster.filter((m) => m.status === "active").length,
                  variant: "default",
                });
                if (teamCalendarAvailable) {
                  tabs.push({
                    key: "calendar",
                    label: "Calendar",
                    count: calendarUpcomingTotal > 0 ? calendarUpcomingTotal : null,
                    variant: "default",
                  });
                }
                if (gameResultsAvailable) {
                  tabs.push({
                    key: "games",
                    label: "Results",
                    count: null,
                    variant: "default",
                  });
                }
                if (practicePlansAvailable) {
                  tabs.push({
                    key: "practice_plans",
                    label: "Practice Plans",
                    count: null,
                    variant: "default",
                  });
                }
              }
              return tabs;
            })().map((t) => {
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
                      active
                        ? "bg-primary/10 text-primary"
                        : "bg-surface-inset text-muted"
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

        {tab === "plays" && !(initialPlays.length === 0 && !isViewer && !isPreview) && (
        /* Slim top bar: type tabs, search, filters, print, new.
           Suppressed for brand-new owners (zero plays) — the FirstPlayHero
           below is the only action that makes sense there, and showing
           Print/Game/Search invites confused taps that go to nothing or
           bounce to /pricing (game mode upgrade dialog). */
        <div className="flex flex-wrap items-end gap-3">
          {/* Type tabs are the primary play filter — visible at all
              breakpoints; flex-wrap on the container handles narrow widths. */}
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
          />          <div className="min-w-0 flex-1">
            <Input
              leftIcon={Search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search plays…"
            />
          </div>

          <div ref={filtersPanelRef} className="relative">
            {/* Filters button: icon-only across breakpoints to keep the
                toolbar compact and let the search input breathe. The "•"
                badge signals active filters. */}
            <Button
              variant="secondary"
              leftIcon={SlidersHorizontal}
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              aria-label="Filters"
              title="Filters"
              className="px-2.5"
            >
              {!(groupBy === "type" && view === "active") && (
                <span aria-hidden="true">•</span>
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

          {/* Desktop: Select / Reorder / Print / Game / New play as dedicated buttons.
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
            className="hidden px-2.5 sm:inline-flex"
          >
            {reorderMode && <span>Done</span>}
          </Button>
          <Link href={`/playbooks/${playbookId}/print`} className="hidden sm:inline-flex">
            <Button
              variant="secondary"
              leftIcon={Printer}
              aria-label="Print playbook"
              title="Print playbook"
              className="px-2.5"
            />
          </Link>
          {/* Game mode button. On every viewport — laptop sideliners on
              desktop, the primary sideline entry on mobile. Hidden when the
              beta feature is off for this user. */}
          {gameModeAvailable && (
            canUseGameMode ? (
              <Link
                href={`/playbooks/${playbookId}/game`}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-brand-green bg-brand-green px-3 text-sm font-semibold text-white hover:bg-brand-green-hover"
                aria-label="Game mode"
              >
                <Gamepad2 className="size-4" />
                <span>Game</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setGameModeUpgradeOpen(true)}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-brand-green bg-brand-green px-3 text-sm font-semibold text-white hover:bg-brand-green-hover"
                aria-label="Game mode"
              >
                <Gamepad2 className="size-4" />
                <span>Game</span>
              </button>
            )
          )}
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
          viewerIsCoach={headerProps.viewerIsCoach}
          canEditRoster={headerProps.canShare}
          canManage={headerProps.canManage}
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

      {tab === "games" && gameResultsAvailable && (
        <GameResultsPanel playbookId={playbookId} canUseGameMode={canUseGameMode} />
      )}

      {tab === "calendar" && teamCalendarAvailable && (
        <PlaybookCalendarTab
          playbookId={playbookId}
          viewerIsCoach={headerProps.viewerIsCoach}
          canUseTeamFeatures={canUseTeamFeatures}
          onCountsChange={(counts) => {
            setCalendarUpcomingTotal(counts.upcomingTotal);
          }}
        />
      )}

      {tab === "practice_plans" && practicePlansAvailable && (
        <PlaybookPracticePlansTab
          playbookId={playbookId}
          canUseTeamFeatures={canUseTeamFeatures}
        />
      )}

      {tab === "plays" && (
      <div>
        {!headerProps.viewerIsCoach && headerProps.canManage && (
          <PlayCapBanner
            count={initialPlays.filter((p) => !p.is_archived).length}
            limit={freeMaxPlays}
          />
        )}
        {truncated && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
            Showing the 2000 most-recent plays. Archive or delete older plays to see more.
          </p>
        )}
        {/* Archived-only filter banner — loud, persistent, with a one-click
            way back. Coaches who toggle to Archived for a one-off lookup
            (the common case) need an obvious cue + reset; without it, the
            archive view is easy to forget you're in. The banner wraps an
            amber strip around the same Archive icon used in the filter
            popover so the visual link to the filter is unmistakable. */}
        {view === "archived" && (() => {
          const activeCount = initialPlays.filter((p) => !p.is_archived).length;
          const archivedCount = initialPlays.length - activeCount;
          return (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
              <Archive className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                Viewing <strong>archived plays only</strong> — {archivedCount}{" "}
                archived, {activeCount} active{" "}
                {activeCount === 1 ? "play" : "plays"} hidden.
              </span>
              <button
                type="button"
                onClick={() => setView("active")}
                className="shrink-0 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-950 ring-1 ring-amber-300 transition-colors hover:bg-amber-200"
              >
                Show active
              </button>
            </div>
          );
        })()}
        {/* Main area */}
        <div className="min-w-0">
      {filtered.length === 0 ? (
        // Brand-new owner/editor: replace the small empty-state with a
        // hero so "Draw your first play" is the dominant element on the
        // page. Viewers and search-empty states keep the small card.
        initialPlays.length === 0 && !isViewer && !isPreview ? (
          <FirstPlayHero onCreate={openFormationPicker} loading={creating} />
        ) : (
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
                <div className="flex flex-col items-center gap-3 sm:flex-row">
                  <Button variant="primary" leftIcon={Plus} onClick={openFormationPicker} loading={creating}>
                    New play
                  </Button>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">or</span>
                  <CoachCalCTA
                    entryPoint="playbook_generate_starter"
                    variant="primary"
                    label="Generate with Coach Cal"
                    className="whitespace-nowrap"
                  />
                </div>
              )
            }
          />
        )
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
                label: "Suggest a counter",
                icon: Sparkles,
                trailing: (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    Cal
                  </span>
                ),
                onSelect: () =>
                  openCoachCal("play_suggest_counter", {
                    values: { playName: p.name },
                  }),
              },
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
              {
                label: "Move to group…",
                icon: FolderInput,
                onSelect: () =>
                  setMoveTarget({
                    playId: p.id,
                    playName: p.name,
                    currentGroupId: p.group_id ?? null,
                  }),
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
              ...(isAdmin
                ? [
                    {
                      label: "Copy play JSON (admin)",
                      icon: ClipboardCopy,
                      onSelect: async () => {
                        const res = await getPlayForEditorAction(p.id);
                        if (!res.ok) {
                          toast(res.error ?? "Could not load play.", "error");
                          return;
                        }
                        const json = JSON.stringify(
                          { play: res.play, document: res.document },
                          null,
                          2,
                        );
                        try {
                          await navigator.clipboard.writeText(json);
                          toast("Play JSON copied to clipboard.", "success");
                        } catch {
                          toast("Clipboard unavailable in this context.", "error");
                        }
                      },
                    } satisfies ActionMenuItem,
                  ]
                : []),
              {
                label: "Delete",
                icon: Trash2,
                danger: true,
                onSelect: () =>
                  confirmAnd(
                    `Delete "${p.name}"? This can't be undone.`,
                    () => handleDeletePlays([p.id]),
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
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <h2 className="truncate text-base font-bold text-foreground">{section.label}</h2>
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
                  handleDeletePlays(ids, () => {
                    toast(
                      `${n} ${n === 1 ? "play" : "plays"} deleted.`,
                      "success",
                    );
                    setSelectionMode(false);
                    setSelectedPlayIds(new Set());
                  });
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
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60"
          onClick={(e) => {
            if (creating) return;
            if (e.target === e.currentTarget) setShowFormationPicker(false);
          }}
        >
          <div
            className="flex min-h-full items-center justify-center p-4"
            onClick={(e) => {
              if (creating) return;
              if (e.target === e.currentTarget) setShowFormationPicker(false);
            }}
          >
          <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface-raised shadow-elevated">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-foreground">
                  Start a new play
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Choose a formation to begin with, or start blank.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <CoachCalCTA
                  entryPoint="playbook_generate_play"
                  afterClick={() => setShowFormationPicker(false)}
                />
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-inset hover:text-foreground disabled:opacity-40"
                  onClick={() => setShowFormationPicker(false)}
                  disabled={creating}
                >
                  <X className="size-5" />
                </button>
              </div>
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
        </div>
      )}
      <GameModeUpgradeDialog
        open={gameModeUpgradeOpen}
        onClose={() => setGameModeUpgradeOpen(false)}
      />
      <TrashDrawer
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        playbookId={playbookId}
      />
      <MovePlayToGroupDialog
        target={moveTarget}
        groups={initialGroups}
        onClose={() => setMoveTarget(null)}
        onMoved={() => {
          // Server is source of truth — refresh so the card shows up in the
          // new section and the play count per group updates.
          router.refresh();
        }}
        onError={(message) => toast(message, "error")}
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
          onPlayCapHit={showPlayCapUpgrade}
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
  viewerIsCoach,
  canEditRoster,
  canManage,
  teamName,
  senderName,
}: {
  playbookId: string;
  members: PlaybookRosterMember[];
  claims: PendingRosterClaim[];
  viewerIsCoach: boolean;
  canEditRoster: boolean;
  canManage: boolean;
  teamName: string;
  senderName: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [renaming, setRenaming] = useState<PlaybookRosterMember | null>(null);
  const [roleEditing, setRoleEditing] = useState<PlaybookRosterMember | null>(null);
  const [positionEditing, setPositionEditing] = useState<PlaybookRosterMember | null>(null);
  function openAddPlayer() {
    if (!canEditRoster) return;
    setShowAddPlayerModal(true);
  }
  const [pendingId, setPendingId] = useState<string | null>(null);

  // A roster slot is identified by `label IS NOT NULL` — it represents a
  // player on the team (claimed or unclaimed). Coach/parent access rows
  // have label=null. A user can hold both: an access row (label=null)
  // AND manage/own one or more slots.
  const players = members.filter((m) => m.label !== null);
  const coaches = members.filter(
    (m): m is PlaybookRosterMember & { user_id: string } =>
      m.role !== "viewer" && m.user_id !== null && m.label === null,
  );
  const pending = members.filter(
    (m): m is PlaybookRosterMember & { user_id: string } =>
      m.status === "pending" && m.user_id !== null && m.label === null,
  );
  const coachUpgradeRequests = members.filter(
    (m): m is PlaybookRosterMember & { user_id: string } =>
      m.status === "active" &&
      !!m.coach_upgrade_requested_at &&
      m.user_id !== null &&
      m.label === null,
  );
  const active = players.filter((m) => m.status === "active");
  const activeCoaches = coaches.filter((m) => m.status === "active");
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
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(
    new Set(),
  );
  async function linkUserToEntry(memberId: string, userId: string, name: string) {
    if (
      !window.confirm(
        `Link ${name} to this roster spot? Their existing entry will merge into it.`,
      )
    )
      return;
    setPendingId(memberId);
    const res = await linkRosterEntryAction(playbookId, memberId, userId);
    setPendingId(null);
    if (!res.ok) toast(`Link failed: ${res.error}`, "error");
    else router.refresh();
  }
  async function claimSlot(memberId: string, name: string, asManager: boolean) {
    const verb = asManager
      ? `Claim ${name} as parent or guardian?`
      : `Link ${name} to your account? You'll appear on the roster as this player.`;
    if (!window.confirm(verb)) return;
    setPendingId(memberId);
    const res = await claimRosterSlotAction(playbookId, memberId, asManager);
    setPendingId(null);
    if (!res.ok) {
      toast(`Claim failed: ${res.error}`, "error");
      return;
    }
    toast(
      res.pending
        ? "Claim sent — waiting on coach approval."
        : asManager
        ? `You now manage ${name}.`
        : `Linked to ${name}.`,
      "success",
    );
    router.refresh();
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
  async function demoteToPlayer(memberId: string, name: string) {
    if (
      !window.confirm(
        `Demote ${name} to player? They'll keep view access but lose the ability to edit plays, invite others, or change the roster.`,
      )
    )
      return;
    setPendingId(memberId);
    const res = await setMemberRoleAction({
      playbookId,
      memberId,
      role: "viewer",
    });
    setPendingId(null);
    if (!res.ok) toast(`Demote failed: ${res.error}`, "error");
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
  async function toggleHeadCoach(userId: string, currentlyHead: boolean) {
    const res = await setHeadCoachAction(playbookId, currentlyHead ? null : userId);
    if (!res.ok) toast(`Update failed: ${res.error}`, "error");
    else router.refresh();
  }
  async function saveCoachTitle(userId: string, title: string) {
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

  // Group pending claims by the roster entry they target so collisions
  // (two users claiming the same player) show up as a single decision.
  const claimsByMember = new Map<string, PendingRosterClaim[]>();
  for (const c of claims) {
    const list = claimsByMember.get(c.memberId) ?? [];
    list.push(c);
    claimsByMember.set(c.memberId, list);
  }

  // Self-joined user / unclaimed-entry name collisions. When a player
  // skipped the claim step and joined as themselves but the coach
  // already pre-added someone with the same name, offer a one-click
  // link so the roster doesn't end up with two rows for one person.
  const suggestions = buildMergeSuggestions(players).filter(
    (s) => !dismissedSuggestions.has(`${s.userMemberId}:${s.unclaimedMemberId}`),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Roster</h2>
          <p className="text-xs text-muted">Players and coaches with access to this playbook.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canEditRoster && (
            <Button variant="secondary" leftIcon={Plus} onClick={openAddPlayer}>
              Add player
            </Button>
          )}
          {/* Invite affordance lives in the playbook header so it's reachable
              from every tab. Don't duplicate it here. */}
        </div>
      </div>

      {suggestions.length > 0 && (
        <section className="rounded-xl border border-border bg-surface-inset p-4">
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            Possible matches
            <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-[11px] text-muted ring-1 ring-border">
              {suggestions.length}
            </span>
          </h3>
          <p className="mb-3 text-xs text-muted">
            A player joined without claiming a spot, and their name matches an
            unclaimed roster entry. Link to merge.
          </p>
          <ul className="divide-y divide-border">
            {suggestions.map((s) => {
              const key = `${s.userMemberId}:${s.unclaimedMemberId}`;
              return (
                <li
                  key={key}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-semibold text-foreground">
                      {s.userName}
                    </p>
                    <p className="truncate text-xs text-muted">
                      looks like roster spot &ldquo;{s.unclaimedLabel}&rdquo;
                      {s.unclaimedJersey ? ` · #${s.unclaimedJersey}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="primary"
                      loading={pendingId === s.unclaimedMemberId}
                      onClick={() =>
                        linkUserToEntry(s.unclaimedMemberId, s.userId, s.userName)
                      }
                    >
                      Link
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setDismissedSuggestions((prev) => {
                          const next = new Set(prev);
                          next.add(key);
                          return next;
                        })
                      }
                    >
                      Dismiss
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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

      {activeCoaches.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            Coaches
            <span className="ml-2 rounded-full bg-surface-inset px-2 py-0.5 text-[11px] text-muted ring-1 ring-border">
              {activeCoaches.length}
            </span>
          </h3>
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
                  {activeCoaches.map((m) => {
                    const name = m.label || m.display_name || "—";
                    const isOwner = m.role === "owner";
                    return (
                      <StaffRow
                        key={m.user_id}
                        member={m}
                        name={name}
                        isOwner={isOwner}
                        onToggleHead={() => toggleHeadCoach(m.user_id, m.is_head_coach)}
                        onSaveTitle={(t) => saveCoachTitle(m.user_id, t)}
                        onRename={() => setRenaming(m)}
                        onChangeRole={isOwner ? null : () => setRoleEditing(m)}
                        onRemove={isOwner ? null : () => removeStaff(m.user_id, name)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {active.length === 0 && activeCoaches.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-raised p-8 text-center">
          <p className="text-sm font-semibold text-foreground">No one on the roster yet</p>
          <p className="mt-1 text-xs text-muted">
            {canEditRoster
              ? viewerIsCoach
                ? "Add players below, or use Invite to share this playbook with a player or coach."
                : "Add your players' names, jerseys, and positions below. Inviting them comes with Team Coach."
              : "Your coach will add the roster here."}
          </p>
        </div>
      ) : active.length === 0 ? null : (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            Players
            <span className="ml-2 rounded-full bg-surface-inset px-2 py-0.5 text-[11px] text-muted ring-1 ring-border">
              {active.length}
            </span>
          </h3>
        <div className="rounded-xl border border-border bg-surface-raised">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-4 py-2.5 font-semibold">Role</th>
                  <th className="px-4 py-2.5 font-semibold">Jersey</th>
                  <th className="px-4 py-2.5 font-semibold">Position</th>
                  {canEditRoster && <th className="w-10 px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {active.map((m) => {
                  const name = m.label || m.display_name || "—";
                  const unclaimed = m.user_id === null && m.managed_by === null;
                  const items: ActionMenuItem[] = [
                    {
                      label: "Rename",
                      icon: Pencil,
                      onSelect: () => setRenaming(m),
                    },
                    ...(unclaimed
                      ? []
                      : [
                          {
                            label: "Change role",
                            icon: Crown,
                            onSelect: () => setRoleEditing(m),
                          },
                        ]),
                    ...(!unclaimed && m.role === "editor"
                      ? [
                          {
                            label: "Demote to player",
                            icon: UserMinus,
                            onSelect: () => demoteToPlayer(m.id, name),
                          },
                        ]
                      : []),
                    ...(unclaimed
                      ? [
                          {
                            label: "I'm their parent / guardian",
                            icon: UserPlus,
                            onSelect: () => claimSlot(m.id, name, true),
                          },
                          {
                            label: `I am ${name}`,
                            icon: UserPlus,
                            onSelect: () => claimSlot(m.id, name, false),
                          },
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
                        ]),
                  ];
                  const canEditRole = viewerIsCoach && !unclaimed && m.role !== "owner";
                  return (
                    <tr key={m.id}>
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        <span className="inline-flex items-center gap-2">
                          {canEditRoster ? (
                            <button
                              type="button"
                              onClick={() => setRenaming(m)}
                              className="rounded px-1 -mx-1 text-left hover:bg-surface-inset"
                              title="Rename"
                            >
                              {name}
                            </button>
                          ) : (
                            name
                          )}
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
                        {m.managed_by && m.user_id === null && (
                          <div className="mt-0.5 text-[11px] font-normal text-muted">
                            Managed by {m.manager_display_name ?? "a parent"}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {canEditRole ? (
                          <button
                            type="button"
                            onClick={() => setRoleEditing(m)}
                            className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary/40"
                            title="Change role"
                          >
                            <Badge variant={m.role === "owner" ? "primary" : "default"} className="text-[10px] cursor-pointer hover:opacity-80">
                              {roleLabel(m.role)}
                            </Badge>
                          </button>
                        ) : (
                          <Badge variant={m.role === "owner" ? "primary" : "default"} className="text-[10px]">
                            {roleLabel(m.role)}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {m.jersey_number ? `#${m.jersey_number}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {canEditRoster ? (
                          <button
                            type="button"
                            onClick={() => setPositionEditing(m)}
                            className="rounded px-1 -mx-1 text-left hover:bg-surface-inset"
                            title="Edit positions"
                          >
                            {m.positions && m.positions.length > 0
                              ? m.positions.join(", ")
                              : m.position || "—"}
                          </button>
                        ) : m.positions && m.positions.length > 0 ? (
                          m.positions.join(", ")
                        ) : (
                          m.position || "—"
                        )}
                      </td>
                      {canEditRoster && (
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
        </section>
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

      <PositionPickerDialog
        member={positionEditing}
        playbookId={playbookId}
        onClose={() => setPositionEditing(null)}
        onSaved={() => {
          setPositionEditing(null);
          router.refresh();
        }}
      />

      <RenamePlayerDialog
        member={renaming}
        playbookId={playbookId}
        onClose={() => setRenaming(null)}
        onSaved={() => {
          setRenaming(null);
          router.refresh();
        }}
      />

      <RolePickerDialog
        member={roleEditing}
        playbookId={playbookId}
        onClose={() => setRoleEditing(null)}
        onSaved={() => {
          setRoleEditing(null);
          router.refresh();
        }}
      />

    </div>
  );
}

type MergeSuggestion = {
  userMemberId: string;
  userId: string;
  userName: string;
  unclaimedMemberId: string;
  unclaimedLabel: string;
  unclaimedJersey: string | null;
};

/**
 * Suggest merges between self-joined user rows (no coach-set label) and
 * unclaimed roster entries with a matching name. Heuristic only —
 * coaches confirm via the Link button. Normalization strips whitespace,
 * case, and punctuation so "Jane Doe", "jane doe", and "Jane  Doe" all
 * match.
 */
function buildMergeSuggestions(
  players: PlaybookRosterMember[],
): MergeSuggestion[] {
  const normalize = (s: string | null) =>
    (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

  const selfJoined = players.filter(
    (
      m,
    ): m is PlaybookRosterMember & { user_id: string; display_name: string } =>
      m.user_id !== null &&
      m.status === "active" &&
      !m.label &&
      !!m.display_name,
  );
  const unclaimed = players.filter(
    (m) => m.user_id === null && !!m.label,
  );
  if (selfJoined.length === 0 || unclaimed.length === 0) return [];

  const byName = new Map<string, PlaybookRosterMember[]>();
  for (const u of unclaimed) {
    const key = normalize(u.label);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(u);
    byName.set(key, list);
  }

  const out: MergeSuggestion[] = [];
  for (const s of selfJoined) {
    const key = normalize(s.display_name);
    if (!key) continue;
    const matches = byName.get(key);
    if (!matches) continue;
    // If exactly one unclaimed entry matches, it's a strong suggestion.
    // Multiple matches (rare, e.g. two "John Smith"s) would need jersey
    // info to disambiguate; surface them all and let the coach pick.
    for (const u of matches) {
      out.push({
        userMemberId: s.id,
        userId: s.user_id,
        userName: s.display_name,
        unclaimedMemberId: u.id,
        unclaimedLabel: u.label ?? "",
        unclaimedJersey: u.jersey_number,
      });
    }
  }
  return out;
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
  const [quickOpen, setQuickOpen] = useState(false);

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
    <>
    <Modal
      open={open && !quickOpen}
      onClose={onClose}
      title="Add player"
      footer={
        <>
          <button
            type="button"
            onClick={() => setQuickOpen(true)}
            className="mr-auto text-xs text-primary underline-offset-2 hover:underline disabled:opacity-50"
            disabled={saving}
          >
            Bulk add players
          </button>
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
    <QuickAddDialog
      open={quickOpen}
      playbookId={playbookId}
      onClose={() => setQuickOpen(false)}
      onAdded={() => {
        setQuickOpen(false);
        onAdded();
      }}
    />
    </>
  );
}

function QuickAddDialog({
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
  const MAX = 30;
  const [names, setNames] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (open) {
      setNames([""]);
      setTimeout(() => inputsRef.current[0]?.focus(), 0);
    }
  }, [open]);

  function setName(i: number, v: string) {
    setNames((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key === "Enter") {
      e.preventDefault();
      setNames((prev) => {
        // If this is the last row and has content and we're under the cap,
        // append a new blank row. Otherwise jump to the next row.
        const isLast = i === prev.length - 1;
        const hasContent = (prev[i] ?? "").trim().length > 0;
        if (isLast && hasContent && prev.length < MAX) {
          const next = [...prev, ""];
          setTimeout(() => inputsRef.current[i + 1]?.focus(), 0);
          return next;
        }
        if (i + 1 < prev.length) {
          setTimeout(() => inputsRef.current[i + 1]?.focus(), 0);
        }
        return prev;
      });
    } else if (
      e.key === "Backspace" &&
      (names[i] ?? "").length === 0 &&
      names.length > 1
    ) {
      e.preventDefault();
      setNames((prev) => prev.filter((_, idx) => idx !== i));
      setTimeout(() => inputsRef.current[Math.max(0, i - 1)]?.focus(), 0);
    }
  }

  async function save() {
    const cleaned = names.map((n) => n.trim()).filter((n) => n.length > 0);
    if (cleaned.length === 0) {
      toast("Add at least one name.", "error");
      return;
    }
    setSaving(true);
    const res = await bulkAddRosterEntriesAction({ playbookId, labels: cleaned });
    setSaving(false);
    if (!res.ok) {
      toast(`Couldn't add players: ${res.error}`, "error");
      return;
    }
    toast(`Added ${res.added} player${res.added === 1 ? "" : "s"} to the roster.`);
    onAdded();
  }

  const filledCount = names.filter((n) => n.trim().length > 0).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quick add players"
      footer={
        <>
          <span className="mr-auto text-xs text-muted">
            {filledCount}/{MAX}
          </span>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={filledCount === 0}>
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Type a name and press Enter for the next one. Jersey, position, and
          other details can be added later.
        </p>
        <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
          {names.map((n, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-right text-xs text-muted">
                {i + 1}.
              </span>
              <Input
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                value={n}
                onChange={(e) => setName(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, i)}
                placeholder="Player name"
                className="flex-1"
              />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function PositionPickerDialog({
  member,
  playbookId,
  onClose,
  onSaved,
}: {
  member: PlaybookRosterMember | null;
  playbookId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [positions, setPositions] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) {
      const initial =
        member.positions && member.positions.length > 0
          ? member.positions
          : member.position
            ? [member.position]
            : [];
      setPositions(new Set(initial));
    }
  }, [member]);

  function toggle(p: string) {
    setPositions((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  async function save() {
    if (!member) return;
    setSaving(true);
    const res = await updateRosterEntryAction({
      playbookId,
      memberId: member.id,
      positions: Array.from(positions),
    });
    setSaving(false);
    if (!res.ok) {
      toast(`Couldn't save positions: ${res.error}`, "error");
      return;
    }
    onSaved();
  }

  return (
    <Modal
      open={!!member}
      onClose={onClose}
      title="Edit positions"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Tap positions for{" "}
          <span className="font-semibold text-foreground">
            {member?.label || member?.display_name || "this player"}
          </span>
          .
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ADD_PLAYER_POSITIONS.map((p) => {
            const on = positions.has(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => toggle(p)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
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
    </Modal>
  );
}

function RenamePlayerDialog({
  member,
  playbookId,
  onClose,
  onSaved,
}: {
  member: PlaybookRosterMember | null;
  playbookId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [jersey, setJersey] = useState("");
  const [positions, setPositions] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) {
      setLabel(member.label ?? member.display_name ?? "");
      setJersey(member.jersey_number ?? "");
      setPositions(new Set(member.positions ?? []));
    }
  }, [member]);

  function togglePos(p: string) {
    setPositions((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  async function save() {
    if (!member) return;
    const name = label.trim();
    if (!name) {
      toast("Name is required.", "error");
      return;
    }
    setSaving(true);
    const res = await updateRosterEntryAction({
      playbookId,
      memberId: member.id,
      label: name,
      jerseyNumber: jersey.trim() || null,
      positions: Array.from(positions),
    });
    setSaving(false);
    if (!res.ok) {
      toast(`Couldn't save: ${res.error}`, "error");
      return;
    }
    onSaved();
  }

  return (
    <Modal
      open={!!member}
      onClose={onClose}
      title="Edit player"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Name</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Jersey number</label>
          <Input value={jersey} onChange={(e) => setJersey(e.target.value)} placeholder="12" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Positions</label>
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
      </div>
    </Modal>
  );
}

const ROLE_OPTIONS: { value: "viewer" | "editor"; label: string; hint: string }[] = [
  { value: "viewer", label: "Player", hint: "View only — no edits or invites." },
  { value: "editor", label: "Coach", hint: "Full edit access — same as you, minus removing the owner." },
];

function RolePickerDialog({
  member,
  playbookId,
  onClose,
  onSaved,
}: {
  member: PlaybookRosterMember | null;
  playbookId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [headCoach, setHeadCoach] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) {
      setRole(member.role === "editor" ? "editor" : "viewer");
      setHeadCoach(member.is_head_coach);
    }
  }, [member]);

  async function save() {
    if (!member || !member.user_id) return;
    const prevRole = member.role === "editor" ? "editor" : "viewer";
    const promotingToCoach = role === "editor" && prevRole !== "editor";
    if (promotingToCoach) {
      const name = member.label || member.display_name || "this person";
      if (
        !window.confirm(
          `Make ${name} a coach? They'll be able to edit and delete plays, invite others, and manage your roster. You can demote them back anytime.`,
        )
      ) {
        return;
      }
    }
    setSaving(true);
    if (role !== prevRole) {
      const res = await setMemberRoleAction({
        playbookId,
        memberId: member.id,
        role,
      });
      if (!res.ok) {
        setSaving(false);
        toast(`Couldn't change role: ${res.error}`, "error");
        return;
      }
    }
    if (role === "editor" && headCoach !== member.is_head_coach) {
      const res = await setHeadCoachAction(
        playbookId,
        headCoach ? member.user_id : null,
      );
      if (!res.ok) {
        setSaving(false);
        toast(`Couldn't update head coach: ${res.error}`, "error");
        return;
      }
    }
    setSaving(false);
    onSaved();
  }

  return (
    <Modal
      open={!!member}
      onClose={onClose}
      title="Change role"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-muted">
          Tap to pick a role for{" "}
          <span className="font-semibold text-foreground">
            {member?.label || member?.display_name || "this person"}
          </span>
          .
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ROLE_OPTIONS.map((opt) => {
            const on = role === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                  on
                    ? "bg-primary/10 text-primary ring-primary/40"
                    : "bg-surface-inset text-muted ring-border hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted">
          {ROLE_OPTIONS.find((o) => o.value === role)?.hint}
        </p>
        {role === "editor" && member?.role !== "editor" && (
          <div className="rounded-md bg-warning-light px-3 py-2 text-xs text-warning ring-1 ring-warning/30">
            Coaches can edit and delete plays, invite others, and manage your
            roster. Only promote people you trust — you can demote them back
            to player anytime.
          </div>
        )}
        {role === "editor" && (
          <button
            type="button"
            onClick={() => setHeadCoach((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
              headCoach
                ? "bg-primary/10 text-primary ring-primary/40"
                : "bg-surface-inset text-muted ring-border hover:text-foreground"
            }`}
          >
            <Crown className="size-3.5" />
            Head coach
          </button>
        )}
      </div>
    </Modal>
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
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
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
    practice_plan: { label: "DRILL", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
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


function StaffRow({
  member,
  name,
  isOwner,
  onToggleHead,
  onSaveTitle,
  onRename,
  onChangeRole,
  onRemove,
}: {
  member: PlaybookRosterMember;
  name: string;
  isOwner: boolean;
  onToggleHead: () => void;
  onSaveTitle: (title: string) => void;
  onRename: () => void;
  onChangeRole: (() => void) | null;
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
          <button
            type="button"
            onClick={onRename}
            className="rounded px-1 -mx-1 text-left hover:bg-surface-inset"
            title="Rename"
          >
            {name}
          </button>
          {isOwner ? (
            <Badge variant="primary" className="text-[10px]">
              Owner
            </Badge>
          ) : onChangeRole ? (
            <button
              type="button"
              onClick={onChangeRole}
              className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary/40"
              title="Change role"
            >
              <Badge variant="default" className="text-[10px] cursor-pointer hover:opacity-80">
                Coach
              </Badge>
            </button>
          ) : null}
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

/**
 * Dominant first-play CTA shown on a brand-new playbook with zero plays.
 *
 * Why this exists: a session replay (Anton, 04/29) showed a free-tier coach
 * land on /playbooks/<id>, sit on the page for 7+ minutes, wander into
 * /formations/<id>/edit three times, hit /pricing → /account → back to
 * the playbook three times — never created a play and bounced. The "No
 * plays yet" empty card was buried under tabs, search, filters, Print,
 * and Game buttons; "Draw your first play" was not the visually dominant
 * next step.
 *
 * Replaces the small empty card and pairs with suppression of the slim
 * top bar + non-essential tabs while plays.length === 0.
 */
function FirstPlayHero({
  onCreate,
  loading,
}: {
  onCreate: () => void;
  loading: boolean;
}) {
  return (
    <section
      aria-labelledby="first-play-hero"
      className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-surface-raised to-surface-raised p-8 text-center shadow-sm sm:p-12"
    >
      <div
        className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full opacity-30 blur-3xl"
        style={{ background: "rgba(23,105,255,0.35)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-12 size-72 rounded-full opacity-25 blur-3xl"
        style={{ background: "rgba(149,204,31,0.4)" }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-xl">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          <Plus className="size-3.5" aria-hidden /> Step 1
        </span>
        <h2
          id="first-play-hero"
          className="mt-4 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl"
        >
          Draw your first play.
        </h2>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Pick a formation, draw routes, name it. Once you have a play, the
          rest of the playbook unlocks — formations, roster, sharing, print
          and Game Mode.
        </p>
        <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center">
            <Button
              variant="primary"
              size="lg"
              leftIcon={Plus}
              onClick={onCreate}
              loading={loading}
              className="h-12 w-full min-w-[260px] whitespace-nowrap rounded-full px-6 text-sm font-bold sm:w-auto"
            >
              Draw your first play
            </Button>
            <p className="mt-2 text-xs text-muted">Free — takes about a minute.</p>
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted sm:self-center sm:pb-7">or</span>
          <div className="flex flex-col items-center">
            <CoachCalCTA
              entryPoint="playbook_generate_starter"
              variant="primary"
              label="Generate with Coach Cal"
              className="h-12 w-full min-w-[260px] justify-center whitespace-nowrap rounded-full px-6 text-sm font-bold sm:w-auto"
            />
            <p className="mt-2 text-xs text-muted">Coach Pro — done in seconds.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlayCapBanner({ count, limit }: { count: number; limit: number }) {
  const remaining = limit - count;
  const atCap = count >= limit;
  const approaching = !atCap && remaining <= 3;
  if (!atCap && !approaching) return null;
  return (
    <div
      className={`mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
        atCap
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-primary/30 bg-primary/[0.04] text-foreground"
      }`}
    >
      <p className="min-w-0 flex-1 text-sm">
        {atCap
          ? `You've hit the ${limit}-play limit on Solo Coach. Upgrade to Team Coach for unlimited plays.`
          : `${count} of ${limit} plays used on Solo Coach — ${remaining} left. Upgrade to Team Coach for unlimited.`}
      </p>
      <Link
        href="/pricing?upgrade=play-cap"
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
      >
        See Team Coach
      </Link>
    </div>
  );
}

/**
 * One-time prompt shown to playbook owners who haven't shared with anyone
 * yet — no co-coaches on the roster, no outstanding invites. Routes to the
 * existing share dialog via the ?share=1 query param that PlaybookHeader
 * watches. Disappears as soon as a coach is added or an invite is sent.
 */
function ShareFirstBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-2">
      <p className="min-w-0 flex-1 text-sm text-foreground">
        <span className="font-semibold">Share this playbook.</span>{" "}
        <span className="text-muted">
          Add a co-coach, send a copy to a peer, or invite players.
        </span>
      </p>
      <Link
        href="?share=1"
        scroll={false}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
      >
        <UserPlus className="size-3.5" />
        Share
      </Link>
    </div>
  );
}

function BuildYourOwnBanner({
  playbookId,
  ownerName,
  isExample,
}: {
  playbookId: string;
  ownerName: string | null;
  /** When true, the playbook is a published example. Coaches who landed
   *  here as a non-owner member should be able to claim a copy of the
   *  example as a starting point — not bounce to a blank create flow. */
  isExample: boolean;
}) {
  const dismissKey = `pb-${playbookId}-build-own-dismissed`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(dismissKey)) return;
    } catch {
      // localStorage unavailable — show the banner
    }
    setHidden(false);
  }, [dismissKey]);
  if (hidden) return null;
  function dismiss() {
    try {
      window.localStorage.setItem(dismissKey, "1");
    } catch {
      // ignore
    }
    setHidden(true);
  }
  const ctaHref = isExample ? `/copy/example/${playbookId}` : "/home?create=1";
  const ctaLabel = isExample ? "Make it mine" : "Build my playbook";
  const message = isExample
    ? `Like this example? Claim a copy as your starting point and customize it however you want.`
    : `Like what ${ownerName ?? "this coach"} built? You can build your own playbook for free — keep collaborating here too.`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-2">
      <p className="min-w-0 flex-1 text-sm text-foreground">{message}</p>
      <div className="flex items-center gap-1">
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
        >
          <Plus className="size-3.5" />
          {ctaLabel}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
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
  onGoTo: (tab: "roster") => void;
}) {
  if (!canManage) return null;
  const pending = roster.filter((m) => m.status === "pending");
  const upgradeRequests = roster.filter(
    (m) =>
      m.status === "active" &&
      m.role === "viewer" &&
      m.coach_upgrade_requested_at,
  );
  const total = pending.length + upgradeRequests.length;
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
      <p className="text-sm text-foreground">
        <span className="font-semibold">{total}</span> pending request
        {total === 1 ? "" : "s"} to review.
      </p>
      <button
        type="button"
        onClick={() => onGoTo("roster")}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
      >
        Review in Roster ({total})
      </button>
    </div>
  );
}
