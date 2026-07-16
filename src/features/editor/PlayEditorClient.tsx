"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive as ArchiveIcon, ChevronDown, ChevronLeft, ChevronRight, FlaskConical, GraduationCap, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { registerReloadGuard } from "@/lib/native/reloadGuard";
import { isNativeApp } from "@/lib/native/isNativeApp";
import type { EndDecoration, PlayDocument, Player, Point2, Route, SegmentShape, StrokePattern, VsPlaySnapshot } from "@/domain/play/types";
import type { SavedFormation } from "@/app/actions/formations";
import { saveFormationAction } from "@/app/actions/formations";
import { resolveEndDecoration, mkZone, zoneStyleFromColor } from "@/domain/play/factory";
import { fieldAspectFor, fieldAspectForWidth, NARROW_FIELD_ASPECT } from "@/domain/play/render-config";
import {
  archivePlayAction,
  createCustomOpponentAction,
  createPlayAction,
  deletePlayAction,
  installDefenseVsPlayAction,
  promoteCustomOpponentAction,
  savePlayVersionAction,
  setOpponentHiddenAction,
  updateCustomOpponentPlayersAction,
  updateCustomOpponentRoutesAction,
} from "@/app/actions/plays";
import { putPlayDraft, removePlayDraft } from "@/lib/offline/db";
import { isSaveConflict, SaveStatePill, type SaveState } from "./SaveStatePill";
import { usePlayEditor } from "./usePlayEditor";
import { EditorCanvas } from "./EditorCanvas";
import { RouteToolbar } from "./RouteToolbar";
import { FieldSizeControls } from "./FieldSizeControls";
import { Inspector } from "./Inspector";
import type {
  PlaybookGroupRow,
  PlaybookPlayNavItem,
} from "@/domain/print/playbookPrint";
import { EditorHeaderBar } from "./EditorHeaderBar";
import { EditorPlaybookChrome } from "./EditorPlaybookChrome";
import { EditorBottomNav } from "./EditorBottomNav";
import { CopyToPlaybookDialog, type CopyTarget } from "@/features/playbooks/CopyToPlaybookDialog";
import {
  MovePlayToGroupDialog,
  type MovePlayToGroupTarget,
} from "@/features/playbooks/MovePlayToGroupDialog";
import { TagsCard } from "./TagsCard";
import { CoachCalCTA } from "@/features/coach-ai/CoachCalCTA";
import { EditorCalNudge } from "./EditorCalNudge";

// Show the empty-editor "build with Cal" nudge only while a coach's first
// playbook is this small — a proxy for "new coach on their first plays." Past
// this they've established a workflow (with or without Cal) and don't need it.
const NEW_COACH_PLAY_LIMIT = 3;
import { publishLivePlayDoc, clearLivePlayDoc } from "@/lib/coach-ai/live-play-doc";
import { useToast } from "@/components/ui";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { GameModeUpgradeDialog } from "@/features/game-mode/GameModeUpgradeDialog";
import {
  GameModeLockedDialog,
  isGameModeLocked,
} from "@/features/game-mode/GameModeLockedDialog";
import { usePlayAnimation, type PlayAnimation } from "@/features/animation/usePlayAnimation";
import { AnimationOverlay } from "@/features/animation/AnimationOverlay";
import { PlayControlsPanel } from "@/features/animation/PlayControlsPanel";
import { OpponentOverlayCard } from "./OpponentOverlayCard";
import { PlayResultsCard } from "./PlayResultsCard";
import { QuickRoutes } from "./QuickRoutes";
import { useUserRouteTemplates } from "./useUserRouteTemplates";
import { VsPlayCard } from "./VsPlayCard";
import { PlayerMentionEditor } from "./PlayerMentionEditor";
import { NotesMarkdown, copyNotesToClipboard } from "./NotesMarkdown";
import {
  resolvePlaybookFieldStructure,
  type PlaybookSettings,
} from "@/domain/playbook/settings";
import {
  ExamplePreviewProvider,
  useExamplePreview,
} from "@/features/admin/ExamplePreviewContext";
import { notifyTutorialAction } from "@/features/tutorials/engine/notify";
import { PlayAuthoringAutoLauncher } from "@/features/tutorials/PlayAuthoringAutoLauncher";
import { ROUTE_TEMPLATES, instantiateTemplate } from "@/domain/play/routeTemplates";
import type { SportVariant } from "@/domain/play/types";

function coerceVariant(v: string | null | undefined): SportVariant | null {
  if (v === "flag_5v5" || v === "flag_6v6" || v === "flag_7v7" || v === "tackle_11") {
    return v;
  }
  return null;
}

/**
 * Order-insensitive JSON serialization. Used to compare a locally-edited
 * `PlayDocument` against an incoming server doc that has been through
 * `sanitizedDoc` (write-side) and `normalizePlayDocument` (read-side).
 * Both rebuild the doc with `{...spread, override}`, which preserves
 * value-equality but can shuffle key order — which `JSON.stringify`
 * faithfully encodes, so naive string compare reports false negatives.
 * The only effect of those rebuilds we *care* about is value drift
 * (sanitized FK to null), and stableStringify catches that.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") +
    "}"
  );
}

type Props = {
  playId: string;
  playbookId: string;
  /**
   * The play_versions id this editing session started from — the coach's
   * "base". Recorded onto any local draft, because this is the only moment we
   * know it, and a later upload needs it to tell "I changed nothing" from "we
   * both changed it" without guessing. Guessing means false-positive conflict
   * prompts for coaches who merely opened a play, which is worse than the bug.
   * Null when unknown (e.g. library mode) — callers must tolerate that.
   */
  baseVersionId?: string | null;
  playbookName?: string | null;
  /** Hex accent color of the parent playbook. Drives the slim mobile
   *  chrome banner so coaches keep visual continuity with the playbook
   *  page they came from. Falls back to brand orange when missing. */
  playbookColor?: string | null;
  /** Team / playbook logo URL — shown as the avatar in the slim chrome.
   *  Falls back to the first letter of the playbook name when null. */
  playbookLogoUrl?: string | null;
  /** Season label ("Spring 2026", etc.) shown as the first segment of the
   *  banner subtitle — mirrors the playbook grid view's banner. */
  playbookSeason?: string | null;
  /** Sport variant id (flag_5v5 / tackle_11 / …). Resolved to its label
   *  for the banner subtitle. */
  playbookVariant?: string | null;
  /** Display name of the playbook owner. Shown in the banner subtitle so
   *  the editor banner reads identically to the playbook page banner. */
  playbookOwnerName?: string | null;
  initialDocument: PlayDocument;
  initialNav: PlaybookPlayNavItem[];
  initialGroups: PlaybookGroupRow[];
  linkedFormation?: SavedFormation | null;
  opponentFormation?: SavedFormation | null;
  /** Formations offered in the title-bar picker. Scoped to this playbook. */
  allFormations?: SavedFormation[];
  /** Full cross-variant, cross-playbook list. Used only by the opponent overlay. */
  opponentFormations?: SavedFormation[];
  playbookSettings?: PlaybookSettings;
  /** When false, the viewer only has read + playback + opponent-overlay
   *  access. Toolbars, inspectors, tag inputs, rename, copy, and auto-save
   *  are all suppressed. */
  canEdit?: boolean;
  /** Example preview: the user can interact with the editor as if it's
   *  theirs, but nothing persists — autosave is skipped, and explicit
   *  save attempts surface a "create your own playbook" CTA. */
  isExamplePreview?: boolean;
  /** Archived playbook: same treatment as example preview for edits, with a
   *  distinct CTA that offers to restore the playbook. */
  isArchived?: boolean;
  /** Archived play (the playbook is active but THIS play is archived). The
   *  editor stays mounted so the coach can review the play, but every edit
   *  affordance is disabled and a banner surfaces a one-click Unarchive. */
  isPlayArchived?: boolean;
  /** Site-admin kill switch. When false, mobile surfaces that enter edit
   *  mode (the "Edit play" button, the formation picker dropdown) are
   *  suppressed on small screens. Desktop is unaffected. */
  mobileEditingEnabled?: boolean;
  /** When true, show the mobile "Game mode" button next to Edit play.
   *  Computed server-side from the beta-features site setting + viewer role. */
  gameModeAvailable?: boolean;
  /** When true, Game Mode is unlocked (Coach+ tier). When false, the button
   *  still renders but opens an upgrade prompt instead of navigating. */
  canUseGameMode?: boolean;
  /** Drives the slim chrome's Cal launcher visibility. Same logic as
   *  SiteHeader: entitled = available, otherwise show the promo. */
  coachAiAvailable?: boolean;
  showCoachCalPromo?: boolean;
  /** Remaining free Cal prompts for a non-entitled coach; null when entitled
   *  (unlimited) or unknown. Drives the empty-editor "build with Cal" nudge. */
  coachCalFreePromptsRemaining?: number | null;
  /** Drives which links appear in the editor footer's "More" sheet —
   *  same beta-feature flags the playbook page uses to decide which
   *  tabs render. The editor doesn't host these tabs itself; the sheet
   *  links the user back to the playbook with the right tab. */
  teamCalendarAvailable?: boolean;
  teamMessagingAvailable?: boolean;
  gameResultsAvailable?: boolean;
  practicePlansAvailable?: boolean;
  /** ID of the hidden custom-opponent play attached to this play, if any.
   *  When present, the opposing-side players in `vs_play_snapshot` are
   *  drag-editable (they back this hidden play). */
  initialCustomOpponentPlayId?: string | null;
  /** When true, the user "cleared" the opponent overlay: the custom data is
   *  preserved but the snapshot is hidden in the canvas. */
  initialOpponentHidden?: boolean;
  /** Site-admin flag. Adds a "Site Admin" item to the editor footer's
   *  More sheet so admins can jump to /admin from any play. */
  isAdmin?: boolean;
  /** When true, this play was created by the in-app tutorial flow and
   *  lives in the playbook as disposable scratch space. Surfaces a
   *  persistent banner offering Keep / Discard so the coach can promote
   *  it to a normal play or remove it. */
  isTutorialPlay?: boolean;
  /** When true, the editor is rendering in the public Learning Center
   *  for an unauthenticated reader (or any auth state with no edit
   *  context). Implies `canEdit=false` and disables Cal observation
   *  hooks (`publishLivePlayDoc`, `coach-ai-mutated` listener) so we
   *  don't push library-render docs into Cal's live-doc store. Other
   *  read-only modes (archived play, example preview) leave Cal hooks
   *  active because the coach is still authed in those flows — library
   *  is the only mode with truly no authenticated context. */
  libraryMode?: boolean;
  /** Optional save override. When provided, the editor's autosave path
   *  routes through this callback instead of `savePlayVersionAction`.
   *  Used by the library-override admin page: the editor still drives
   *  edits, but the persisted target is `library_concept_overrides`
   *  (keyed by slug+variant) rather than `play_versions` (keyed by
   *  playId). The callback contract mirrors the action's return shape
   *  so `runSave`'s gameLock / error handling doesn't need to fork.
   *  Library mode is unaffected — that path skips edits entirely. */
  saveAdapter?: (
    doc: PlayDocument,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export function PlayEditorClient(props: Props) {
  const tutorialVariant = coerceVariant(props.playbookVariant);
  // Library mode forces canEdit=false regardless of the caller's prop.
  // The public Learning Center never has an authenticated edit context;
  // even if the page rendered for a logged-in admin, the in-page editor
  // is for browsing, not editing — the "Add to my playbook" CTA is the
  // edit path.
  const canEditEffective = props.libraryMode ? false : props.canEdit;
  // Only run the tutorial system in real editing contexts. Example previews
  // and archived playbooks are read-only or pseudo-real surfaces — auto-
  // launching a tour there would be confusing and most data-tutor anchors
  // (formation picker, route toolbar) are hidden. Library mode also skips
  // the tutorial — it's a reference surface, not an onboarding one.
  const tutorialEligible =
    !props.isExamplePreview &&
    !props.isArchived &&
    !props.isPlayArchived &&
    !props.libraryMode &&
    Boolean(canEditEffective);
  return (
    <>
      <ExamplePreviewProvider
        isPreview={props.isExamplePreview ?? false}
        isArchived={props.isArchived ?? false}
        isPlayArchived={props.isPlayArchived ?? false}
        playbookId={props.playbookId}
        playId={props.playId}
        canUnarchive={Boolean(canEditEffective) && !props.isExamplePreview}
      >
        <PlayEditorClientInner {...props} canEdit={canEditEffective} />
      </ExamplePreviewProvider>
      {tutorialEligible && (
        <PlayAuthoringAutoLauncher
          variant={tutorialVariant}
          playbookId={props.playbookId}
        />
      )}
    </>
  );
}

function PlayEditorClientInner({
  playId,
  playbookId,
  playbookName,
  playbookColor = null,
  playbookLogoUrl = null,
  playbookSeason = null,
  playbookVariant = null,
  playbookOwnerName = null,
  initialDocument,
  initialNav,
  initialGroups,
  linkedFormation,
  opponentFormation,
  allFormations = [],
  opponentFormations,
  playbookSettings: initialPlaybookSettings,
  canEdit: roleCanEdit = true,
  isExamplePreview = false,
  isArchived = false,
  isPlayArchived = false,
  mobileEditingEnabled = false,
  gameModeAvailable = false,
  canUseGameMode = false,
  coachAiAvailable = false,
  showCoachCalPromo = false,
  coachCalFreePromptsRemaining = null,
  teamCalendarAvailable = false,
  teamMessagingAvailable = false,
  gameResultsAvailable = false,
  practicePlansAvailable = false,
  initialCustomOpponentPlayId = null,
  initialOpponentHidden = false,
  isAdmin = false,
  isTutorialPlay = false,
  libraryMode = false,
  baseVersionId = null,
  saveAdapter,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const { blockIfPreview } = useExamplePreview();
  const {
    doc,
    dispatch: primaryDispatch,
    undo: primaryUndo,
    redo: primaryRedo,
    replaceDocument: primaryReplaceDocument,
    canUndo: primaryCanUndo,
    canRedo: primaryCanRedo,
  } = usePlayEditor(initialDocument);

  // Unified edit timeline so undo/redo unwinds the most recent change across
  // BOTH the primary doc (offense) AND the custom-opponent overlay
  // (defenders + their movement). Each entry tags which side was edited;
  // the actual snapshots live in `usePlayEditor` (primary) and the
  // oppPast/oppFuture stacks below (opponent).
  type OppSnapshot = { players: Player[] | null; routes: Route[] | null };
  const [editTimeline, setEditTimeline] = useState<("primary" | "opponent")[]>([]);
  const [oppPast, setOppPast] = useState<OppSnapshot[]>([]);
  const [oppFuture, setOppFuture] = useState<OppSnapshot[]>([]);

  const dispatch = useCallback(
    (cmd: Parameters<typeof primaryDispatch>[0]) => {
      setEditTimeline((t) => [...t, "primary"]);
      // Doc dispatch clears its own redo stack on a new edit; clear ours too
      // so a fresh primary edit doesn't leave a stale opponent redo branch.
      setOppFuture([]);
      primaryDispatch(cmd);
    },
    [primaryDispatch],
  );

  const replaceDocument = useCallback(
    (next: PlayDocument) => {
      // Hard reset: clear the unified timeline AND opponent stacks so the
      // freshly-loaded doc starts with no undo history.
      setEditTimeline([]);
      setOppPast([]);
      setOppFuture([]);
      primaryReplaceDocument(next);
    },
    [primaryReplaceDocument],
  );

  // Local state for playbook settings so width/length spinners (in the
  // Display popover's Field-size section) can update the canvas live
  // instead of waiting for a refresh. The server action persists in the
  // background; this state mirrors the persisted value optimistically.
  const [playbookSettings, setPlaybookSettings] = useState(
    initialPlaybookSettings,
  );

  // Resolved league field structure from the playbook's fieldDisplay config.
  // Drives the canvas's league markings (endzones, no-run zones, first-down
  // lines, down markers) and the footer's position picker chips.
  const fieldStructure = playbookSettings
    ? resolvePlaybookFieldStructure(playbookSettings.fieldDisplay)
    : null;

  // `canEdit` gates every body-level edit affordance (canvas, toolbars,
  // notes, tags, inspector, quick routes). When the play is archived, these
  // surfaces go read-only — the coach must explicitly unarchive (banner CTA
  // or ⋮ menu → Restore) before editing. The role-based original is kept on
  // `roleCanEdit` and passed to the header bar so the action menu / Copy /
  // New play remain reachable while archived; the header has its own
  // gating for the rename + formation picker, see below.
  const canEdit = roleCanEdit && !isPlayArchived;

  // When Coach Cal mutates this play (update_play, update_play_notes, etc.),
  // the chat triggers `router.refresh()` and the parent server component
  // re-runs and passes a fresh `initialDocument` prop. usePlayEditor's local
  // state is initialized once and ignores subsequent prop changes by default,
  // so without this effect the editor would keep showing the stale doc until
  // a manual page reload.
  //
  // Reconciliation: serialize incoming vs local doc. If they're equal, the
  // server has caught up to our local state (typical autosave roundtrip) —
  // record it as the latest synced snapshot and do nothing. If they differ,
  // an external mutation came in (Cal's edit) — replace local state with the
  // new server doc, which also clears the undo stack (the previous edits
  // were superseded).
  const lastSyncedDocRef = useRef<PlayDocument>(initialDocument);
  // True whenever local edits exist that haven't been confirmed-saved.
  // Flipped on by the autosave effect on every real `doc` change; flipped
  // off only when a save lands AND no edit landed during the save round-trip
  // (see autosave effect below). Drives reconciliation: while dirty, we
  // never accept an incoming `initialDocument`, since either it's our own
  // save echoing back (after key-order drift through normalize/sanitize) or
  // it's stale relative to local — both cases would visibly clobber edits
  // and wipe the undo stack via `replaceDocument`.
  const isDirtyRef = useRef(false);
  // When Coach Cal mutates this play, the chat dispatches a `coach-ai-mutated`
  // window event and we need the next incoming `initialDocument` to win even
  // if the editor has pending local edits — the coach explicitly confirmed
  // Cal's change in chat, so it should not get silently dropped by the
  // dirty-guard. Set to true on the event, consumed (and cleared) by the
  // first reconciliation that follows. Keeping it tightly scoped to one
  // sync avoids accidentally re-clobbering future legitimate local edits.
  const forceNextSyncRef = useRef(false);
  // Latest local doc reference, kept on a ref so the autosave timer can
  // tell whether local has moved on while a save was in flight without
  // depending on stale closure scope.
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  // Publish the live doc to a window-level store so Coach Cal can see in-
  // progress edits before autosave persists them. The selection-active safety
  // net defers saves up to 30s; without this, Cal queries play_versions and
  // sees pre-rename labels / pre-recolor fills, then "corrects" the coach
  // based on stale data. Cleared on unmount or playId change.
  // Library mode skips this entirely — the library renders synthetic playIds
  // (e.g. "library:mesh:flag-5v5") that don't exist in play_versions, and we
  // don't want Cal observing a public concept page as if it were the coach's
  // own draft.
  useEffect(() => {
    if (libraryMode) return;
    publishLivePlayDoc(playId, doc);
    return () => clearLivePlayDoc(playId);
  }, [playId, doc, libraryMode]);
  useEffect(() => {
    if (initialDocument === lastSyncedDocRef.current) return;
    // Active local edits — never replace. Even if `initialDocument` is
    // semantically what we just sent, swapping it in would wipe the undo
    // stack (replaceDocument calls createUndoState which clears past/future).
    if (isDirtyRef.current && !forceNextSyncRef.current) {
      lastSyncedDocRef.current = initialDocument;
      return;
    }
    // Force-sync from a Coach Cal mutation — clear the dirty flag too so the
    // upcoming replaceDocument doesn't get autosave-clobbered with the stale
    // local copy (the autosave effect compares against `lastSyncedDocRef`).
    if (forceNextSyncRef.current) {
      forceNextSyncRef.current = false;
      isDirtyRef.current = false;
    }
    // Idle. Use an order-insensitive deep compare so that `sanitizedDoc`
    // and `normalizePlayDocument` rebuilding with `{...spread, override}`
    // don't trick us into a no-op-but-destructive replace.
    if (stableStringify(initialDocument) === stableStringify(doc)) {
      lastSyncedDocRef.current = initialDocument;
      return;
    }
    // Truly different from local while we're idle — treat as external
    // mutation (Coach Cal in another tab, etc.).
    replaceDocument(initialDocument);
    lastSyncedDocRef.current = initialDocument;
    isFirstDocRender.current = true; // skip the upcoming autosave from this replace
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDocument]);

  // Defense-in-depth refresh: when Coach Cal mutates a play, the chat
  // already calls `router.refresh()` AND broadcasts a `coach-ai-mutated`
  // window event. Listening here gives the editor a second hook so a
  // missed refresh on the chat side (route-tree edge cases, mount
  // mismatches) doesn't leave the diagram showing stale geometry.
  // Library mode skips — public concept pages aren't reactive to Cal.
  useEffect(() => {
    if (libraryMode) return;
    function onMutated() {
      // Mark the next reconciliation as "force apply" so the dirty-guard
      // doesn't drop Cal's update when the coach has unsaved local edits.
      // The coach said "yes" to Cal in chat — that's the consent signal.
      forceNextSyncRef.current = true;
      router.refresh();
    }
    window.addEventListener("coach-ai-mutated", onMutated);
    return () => window.removeEventListener("coach-ai-mutated", onMutated);
  }, [router, libraryMode]);

  // Bump a localStorage counter of distinct plays this user has opened. The
  // feedback widget gates itself on this to avoid showing for brand-new users.
  useEffect(() => {
    try {
      const KEY = "playgrid:plays-viewed-count";
      const SEEN_KEY = "playgrid:plays-viewed-ids";
      const raw = localStorage.getItem(SEEN_KEY);
      const seen: string[] = raw ? JSON.parse(raw) : [];
      if (Array.isArray(seen) && !seen.includes(playId)) {
        const next = [...seen, playId].slice(-50);
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
        localStorage.setItem(KEY, String(next.length));
      }
    } catch {
      /* ignore */
    }
  }, [playId]);

  const vsSnapshot = doc.metadata.vsPlaySnapshot ?? null;
  const isDefense = (doc.metadata.playType ?? "offense") === "defense";

  // animDoc + anim are declared lower — they merge in editable opponent state
  // that hasn't been declared at this point yet. See the block right after
  // `editableOppRoutes` below.
  // Phone-in-landscape detector. The max-height filter keeps tablets and
  // desktop landscape windows on the regular editor — only a real phone
  // held sideways (≤500px short edge) flips into the immersive view.
  const [isLandscapePhone, setIsLandscapePhone] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(orientation: landscape) and (max-height: 500px)");
    const update = () => setIsLandscapePhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  // Viewport aspect is fixed — the on-screen box doesn't change size when
  // the user edits field yardage. Adding yards compresses the distance
  // between yard lines (more yards in the same pixels); removing yards
  // expands it. The reducer already rescales player/LOS positions to
  // preserve yards-from-LOS so the LOS stays on the same yard marker.
  // Per-user preference: when off (default), wide-field variants (tackle 11,
  // six-man) clamp to roughly the 7v7 aspect so the canvas stays at a usable
  // size on a typical screen. Toggle on to see the full sideline-to-sideline
  // field. Persisted in localStorage.
  const [fullFieldWidth, setFullFieldWidth] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setFullFieldWidth(window.localStorage.getItem("playEditor.fullFieldWidth") === "1");
    } catch {
      // ignore storage failures (private mode etc.)
    }
  }, []);
  const setFullFieldWidthPersisted = useCallback((next: boolean) => {
    setFullFieldWidth(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("playEditor.fullFieldWidth", next ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);
  // Aspect comes from the shared render-config helper (matches every other
  // surface that draws a play field — chat embed, game mode, formation
  // editor — so they all stay in lockstep). When the playbook's
  // fieldStructure has a custom width, that wins so the Display popover's
  // width spinner immediately re-shapes the canvas.
  const naturalAspect = fieldStructure
    ? fieldAspectForWidth(fieldStructure.fieldWidthYds)
    : fieldAspectFor(doc);
  const fieldAspect = fullFieldWidth
    ? naturalAspect
    : Math.min(naturalAspect, NARROW_FIELD_ASPECT);
  const canExpandFieldWidth = naturalAspect > NARROW_FIELD_ASPECT + 1e-3;

  // Stable set: changes only on phase transitions (not every RAF frame), so
  // EditorCanvas doesn't receive a new prop reference 60× per second and
  // re-rasterize its SVG text with shimmering subpixel alignment.
  // (animatingPlayerIds is now computed below, alongside animDoc + anim,
  // since it depends on `anim`.)

  // Selection state
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  // Per-user custom route templates (Quick Routes "Your routes" section +
  // right-click "Save as template"). Single source of truth threaded into
  // both editor canvases and the Inspector / mobile QuickRoutes.
  const userTemplates = useUserRouteTemplates();

  // Tutorial state-shepherd. When the in-app tour transitions into a
  // step with an `onEnter` action, the engine dispatches a
  // `tutorial:on-enter` window event with the action descriptor. We
  // handle it here by nudging the selection state into the shape the
  // step's UI expects (player vs route selected, or no selection at
  // all). The user keeps full freedom mid-step — actions only fire on
  // entry.
  //
  // The listener is intentionally registered with an empty dep array so
  // it stays attached for the lifetime of the component. Earlier, the
  // listener's deps included `selectedPlayerId` and `selectedRouteId`,
  // which meant it detached and reattached every time the coach
  // selected something. Step transitions race against that detach
  // window: clicking Next on a step where you had a player selected
  // could land the dispatch in the gap between cleanup and reattach,
  // and the next step's `clear-selection` would silently miss. Stable
  // refs below feed the handler the current state without rebinding
  // the listener.
  const tutorialShepherdRefs = useRef({
    selectedPlayerId,
    selectedRouteId,
    routes: doc.layers.routes,
    players: doc.layers.players,
  });
  useEffect(() => {
    tutorialShepherdRefs.current = {
      selectedPlayerId,
      selectedRouteId,
      routes: doc.layers.routes,
      players: doc.layers.players,
    };
  }, [selectedPlayerId, selectedRouteId, doc.layers.routes, doc.layers.players]);
  useEffect(() => {
    function onTutorialEnter(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { kind: "ensure-player-selected" }
        | { kind: "ensure-route-selected" }
        | { kind: "ensure-route-exists" }
        | { kind: "clear-selection" }
        | undefined;
      if (!detail) return;
      const { selectedPlayerId, selectedRouteId, routes, players } =
        tutorialShepherdRefs.current;
      if (detail.kind === "ensure-player-selected") {
        // Already in the right shape — bail.
        if (selectedPlayerId && !selectedRouteId) return;
        // A route is selected — switch to its carrier player so the
        // QuickRoutes panel re-mounts.
        if (selectedRouteId) {
          const route = routes.find((r) => r.id === selectedRouteId);
          if (route?.carrierPlayerId) {
            setSelectedPlayerId(route.carrierPlayerId);
            setSelectedRouteId(null);
            return;
          }
        }
        // Nothing selected — pick the first player on the field.
        const first = players[0];
        if (first) setSelectedPlayerId(first.id);
      } else if (detail.kind === "ensure-route-selected") {
        if (selectedRouteId) return;
        const first = routes[0];
        if (!first) return;
        setSelectedRouteId(first.id);
        if (first.carrierPlayerId) setSelectedPlayerId(first.carrierPlayerId);
      } else if (detail.kind === "ensure-route-exists") {
        // If the play already has a route, treat this like
        // ensure-route-selected and bail.
        if (routes.length > 0) {
          if (!selectedRouteId) {
            setSelectedRouteId(routes[0].id);
            if (routes[0].carrierPlayerId) {
              setSelectedPlayerId(routes[0].carrierPlayerId);
            }
          }
          return;
        }
        // No routes — draw a default Curl on a sensible eligible
        // receiver so the "Reshape a route" step has anchors to drag.
        // Prefer a wide receiver (eligible, not the QB) over the QB.
        const carrier =
          players.find((p) => p.eligible && p.role !== "QB") ??
          players.find((p) => p.eligible) ??
          players[0];
        if (!carrier) return;
        const curl = ROUTE_TEMPLATES.find((t) => t.name === "Curl");
        if (!curl) return;
        const route = instantiateTemplate(curl, carrier.position, carrier.id);
        dispatch({ type: "route.add", route });
        setSelectedRouteId(route.id);
        setSelectedPlayerId(carrier.id);
      } else if (detail.kind === "clear-selection") {
        // Drop every selection so the editor flips back into "view" mode
        // and panels like the opponent overlay card re-render.
        setSelectedPlayerId(null);
        setSelectedOpponentPlayerId(null);
        setSelectedRouteId(null);
        setSelectedSegmentId(null);
        setSelectedNodeId(null);
        setSelectedZoneId(null);
      }
    }
    window.addEventListener("tutorial:on-enter", onTutorialEnter);
    return () => window.removeEventListener("tutorial:on-enter", onTutorialEnter);
  }, []);
  /** Zone the user is about to place — preview follows the cursor until a click
   *  on the field commits, or a click outside the field cancels. */
  const [pendingZone, setPendingZone] = useState<{
    kind: "rectangle" | "ellipse";
    style: { fill: string; stroke: string };
  } | null>(null);

  // Transient opponent overlay (never saved, resets on navigation)
  const [opponentPlayers, setOpponentPlayers] = useState<Player[] | null>(null);
  // Routes from a transient picked-opponent play. Rendered as ghost arrows
  // when the user enables "Show offense routes" in the picker. Reset whenever
  // the player list resets so a stale route set never lingers behind a new
  // selection.
  const [opponentPickedRoutes, setOpponentPickedRoutes] = useState<Route[] | null>(null);

  // Custom opponent state — backed by a hidden play attached to this play.
  // `customOpponentPlayId` is null when no custom is attached. `opponentHidden`
  // toggles whether the snapshot renders without deleting the data.
  const [customOpponentPlayId, setCustomOpponentPlayId] = useState<string | null>(
    initialCustomOpponentPlayId,
  );
  const [opponentHidden, setOpponentHidden] = useState(initialOpponentHidden);
  // Reconcile the custom-opponent ATTACHMENT from the server when these props
  // change on a refresh — e.g. the coach clicked "Add to this play" in Coach Cal,
  // which attaches a defense out-of-band and broadcasts `coach-ai-mutated` →
  // router.refresh(). Without this, customOpponentPlayId/opponentHidden stay at
  // their mount-time values (useState ignores prop changes), so the render gate
  // `customOpponentPlayId != null` keeps the freshly-attached overlay hidden
  // until a full page reload. The snapshot data itself already rides in on
  // doc.metadata.vsPlaySnapshot (reconciled via the initialDocument effect);
  // this closes the remaining gap. Safe against local edits: a local attach/
  // clear already persists to the server, so the reconciled prop matches state.
  // Uses React's "adjust state during render" pattern (a prev-props tracker)
  // rather than an effect, so the overlay appears in the same commit.
  const [syncedOppProps, setSyncedOppProps] = useState({
    id: initialCustomOpponentPlayId,
    hidden: initialOpponentHidden,
  });
  if (
    syncedOppProps.id !== initialCustomOpponentPlayId ||
    syncedOppProps.hidden !== initialOpponentHidden
  ) {
    setSyncedOppProps({ id: initialCustomOpponentPlayId, hidden: initialOpponentHidden });
    setCustomOpponentPlayId(initialCustomOpponentPlayId);
    setOpponentHidden(initialOpponentHidden);
  }

  // Defense-side toggle: show the installed offense's route arrows behind the
  // play. Off by default so the canvas stays clean; coaches turn it on while
  // drawing how the defense should react to the offensive routes.
  const [showOpponentRoutes, setShowOpponentRoutes] = useState(false);

  // Editable copy of the custom-opponent's players. When a custom opponent is
  // attached + visible, these tokens render on top of the canvas as draggable
  // shapes. Mutations stream into local state for instant feedback and a
  // debounced server save persists via `updateCustomOpponentPlayersAction`.
  // We seed the local state from the snapshot only when the custom id /
  // hidden flag flips — never on every snapshot update — so the server
  // round-trip after a save doesn't clobber an in-flight drag.
  const [editableOppPlayers, setEditableOppPlayers] = useState<Player[] | null>(
    null,
  );
  const editableOppRef = useRef<Player[] | null>(null);
  useEffect(() => {
    editableOppRef.current = editableOppPlayers;
  }, [editableOppPlayers]);
  // Re-seed local state from the snapshot only when the *underlying* hidden
  // play version changes (initial load, custom create, restore from cleared).
  // After-save round-trips reuse the same `sourceVersionId` so they don't
  // trigger a re-seed and therefore can't clobber an in-flight drag.
  const seededVersionRef = useRef<string | null>(null);
  useEffect(() => {
    if (customOpponentPlayId == null || opponentHidden) {
      setEditableOppPlayers(null);
      seededVersionRef.current = null;
      return;
    }
    const ver = vsSnapshot?.sourceVersionId ?? null;
    if (ver === seededVersionRef.current) return;
    seededVersionRef.current = ver;
    setEditableOppPlayers(vsSnapshot?.players ?? null);
  }, [customOpponentPlayId, opponentHidden, vsSnapshot]);

  // Active "side" of the canvas. When a custom opponent is in play, dragging
  // an opponent token flips this to "opponent" (offense dims out); touching a
  // primary player flips it back. Reset to primary whenever the custom is
  // removed or hidden so the offense never stays dimmed.
  const [activeSide, setActiveSide] = useState<"primary" | "opponent">("primary");
  useEffect(() => {
    if (customOpponentPlayId == null || opponentHidden) setActiveSide("primary");
  }, [customOpponentPlayId, opponentHidden]);

  // Editable copy of the custom-opponent's routes — defender movement that
  // a coach drew on this offensive play. Same per-play override semantics
  // as `editableOppPlayers`: the data lives on the hidden play, surfaces
  // through `vsSnapshot.routes`, and changes here NEVER touch any source
  // defense play (saved coverages stay pristine).
  const [editableOppRoutes, setEditableOppRoutes] = useState<Route[] | null>(null);
  const editableOppRoutesRef = useRef<Route[] | null>(null);
  useEffect(() => {
    editableOppRoutesRef.current = editableOppRoutes;
  }, [editableOppRoutes]);
  // Re-seed from the snapshot's routes only when the underlying hidden
  // version changes — same load-once-per-version rule as players, so an
  // in-flight draw isn't clobbered by the post-save round-trip.
  const seededRoutesVersionRef = useRef<string | null>(null);
  useEffect(() => {
    if (customOpponentPlayId == null || opponentHidden) {
      setEditableOppRoutes(null);
      seededRoutesVersionRef.current = null;
      return;
    }
    const ver = vsSnapshot?.sourceVersionId ?? null;
    if (ver === seededRoutesVersionRef.current) return;
    seededRoutesVersionRef.current = ver;
    setEditableOppRoutes(vsSnapshot?.routes ?? []);
  }, [customOpponentPlayId, opponentHidden, vsSnapshot]);

  // ── Animation: merge primary + opponent into a single doc so playback
  // runs both sides on the same clock. For a custom opponent under live
  // edit we read from the in-flight `editableOppPlayers` / `editableOppRoutes`
  // (so a defender movement just drawn animates immediately, not after the
  // 350ms persistence debounce). Falls back to `vsSnapshot` for the read-
  // only saved-defense overlay case.
  const animDoc = useMemo<PlayDocument>(() => {
    if (!vsSnapshot) return doc;
    const oppPlayers = editableOppPlayers ?? vsSnapshot.players;
    const oppRoutes = editableOppRoutes ?? vsSnapshot.routes;
    return {
      ...doc,
      layers: {
        ...doc.layers,
        players: [...doc.layers.players, ...oppPlayers],
        routes: [...doc.layers.routes, ...oppRoutes],
      },
    };
  }, [doc, vsSnapshot, editableOppPlayers, editableOppRoutes]);
  const anim = usePlayAnimation(animDoc);
  const animatingPlayerIds = useMemo(() => {
    if (anim.phase === "idle") return null;
    return new Set(anim.flats.map((f) => f.carrierPlayerId));
  }, [anim.phase, anim.flats]);

  // Currently-selected opponent player. Held separately from `selectedPlayerId`
  // (which targets `doc.layers.players`) because opponent players live in a
  // parallel state slot. The two selections are mutually exclusive — touching
  // either side clears the other — so the canvas always knows which carrier
  // a draw-from-canvas gesture should attach to.
  const [selectedOpponentPlayerId, setSelectedOpponentPlayerId] = useState<string | null>(null);
  // Reset the opponent selection if the opponent disappears (custom removed,
  // hidden toggled off) so a stale id can never anchor a future draw.
  useEffect(() => {
    if (customOpponentPlayId == null || opponentHidden) {
      setSelectedOpponentPlayerId(null);
    }
  }, [customOpponentPlayId, opponentHidden]);

  // Coalesce rapid-fire opponent edits (every pixel of a drag, repeated
  // discrete clicks within ~500ms) into a single undo entry. Without this
  // a one-second drag would push 60+ stack entries and undo would unwind
  // one pixel at a time. The first call captures a pre-mutation snapshot;
  // subsequent calls within the window just extend the silence timer. The
  // next mutation after the window expires starts a fresh undo entry.
  const oppEditCoalesceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const COALESCE_MS = 500;
  const recordOppEdit = useCallback(() => {
    if (oppEditCoalesceTimerRef.current) {
      clearTimeout(oppEditCoalesceTimerRef.current);
      oppEditCoalesceTimerRef.current = setTimeout(() => {
        oppEditCoalesceTimerRef.current = null;
      }, COALESCE_MS);
      return;
    }
    const snapshot: OppSnapshot = {
      players: editableOppRef.current,
      routes: editableOppRoutesRef.current,
    };
    setOppPast((p) => [...p, snapshot]);
    setOppFuture([]);
    setEditTimeline((t) => [...t, "opponent"]);
    oppEditCoalesceTimerRef.current = setTimeout(() => {
      oppEditCoalesceTimerRef.current = null;
    }, COALESCE_MS);
  }, []);

  const oppSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oppRouteSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (oppSaveTimerRef.current) clearTimeout(oppSaveTimerRef.current);
    if (oppRouteSaveTimerRef.current) clearTimeout(oppRouteSaveTimerRef.current);
  }, []);

  const persistOpponentRoutes = useCallback(() => {
    if (oppRouteSaveTimerRef.current) clearTimeout(oppRouteSaveTimerRef.current);
    oppRouteSaveTimerRef.current = setTimeout(() => {
      const latest = editableOppRoutesRef.current;
      if (!latest) return;
      void (async () => {
        const res = await updateCustomOpponentRoutesAction(playId, latest);
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
        // Mirror snapshot via primaryDispatch — this is an internal sync
        // after persistence, NOT a user edit, so it shouldn't enter the
        // unified undo timeline.
        primaryDispatch({
          type: "document.setMetadata",
          patch: { vsPlaySnapshot: res.snapshot },
        });
      })();
    }, 350);
  }, [playId, primaryDispatch, toast]);

  const handleOpponentRouteCommit = useCallback(
    (route: Route) => {
      recordOppEdit();
      // Wipe any prior route on the same defender first — overlay defenders
      // get one movement path at a time. Drawing a new one replaces the
      // previous (matches how a single hand-drawn arrow per defender reads
      // on a whiteboard).
      setEditableOppRoutes((prev) => {
        const base = (prev ?? []).filter((r) => r.carrierPlayerId !== route.carrierPlayerId);
        return [...base, route];
      });
      persistOpponentRoutes();
    },
    [persistOpponentRoutes, recordOppEdit],
  );

  const handleClearOpponentRoutes = useCallback(
    (playerId: string) => {
      const had = (editableOppRoutesRef.current ?? []).some((r) => r.carrierPlayerId === playerId);
      if (!had) return;
      recordOppEdit();
      setEditableOppRoutes((prev) => {
        if (!prev) return prev;
        return prev.filter((r) => r.carrierPlayerId !== playerId);
      });
      persistOpponentRoutes();
    },
    [persistOpponentRoutes, recordOppEdit],
  );

  // Handler the canvas calls when the user touches an opponent token. If the
  // overlay is just a preview (saved defense picked, no custom yet), auto-
  // promote to a custom opponent BEFORE setting the selection — otherwise
  // drawing won't work because the preview is non-editable. The promotion
  // seeds the custom from the previewed players + routes so the visible
  // formation doesn't jump when it flips from preview → editable.
  const handleSelectOpponentPlayer = useCallback(
    (playerId: string | null) => {
      // Deselect always passes through unchanged.
      if (playerId == null) {
        setSelectedOpponentPlayerId(null);
        return;
      }
      // Already a custom opponent attached → just select.
      if (customOpponentPlayId != null) {
        setSelectedOpponentPlayerId(playerId);
        return;
      }
      // Preview overlay (transient `opponentPlayers`) and no custom yet →
      // create a custom seeded from the preview, then select.
      if (opponentPlayers != null) {
        if (
          blockIfPreview(
            "Custom opponents aren't saved on example plays. Start your own playbook to keep changes.",
          )
        ) {
          return;
        }
        const seedPlayers = opponentPlayers;
        const seedRoutes = opponentPickedRoutes ?? [];
        setSelectedOpponentPlayerId(playerId);
        void (async () => {
          // Offline the action REJECTS ("Load failed") instead of returning
          // ok:false, so the branch below is unreachable. Unlike the transition
          // sites, this is a voided IIFE — the rejection reaches no error
          // boundary and disappears, leaving the defender rendered as selected
          // with nothing created behind it. Silence here reads as success.
          let res: Awaited<ReturnType<typeof createCustomOpponentAction>>;
          try {
            res = await createCustomOpponentAction(playId, {
              players: seedPlayers,
              routes: seedRoutes,
            });
          } catch {
            toast("Couldn't add that opponent — you may be offline.", "error");
            setSelectedOpponentPlayerId(null);
            return;
          }
          if (!res.ok) {
            toast(res.error, "error");
            setSelectedOpponentPlayerId(null);
            return;
          }
          setCustomOpponentPlayId(res.hiddenPlayId);
          setOpponentHidden(false);
          // Drop the transient preview now that the custom is the source of
          // truth — the canvas will switch to reading from editableOppPlayers.
          setOpponentPlayers(null);
          setOpponentPickedRoutes(null);
          router.refresh();
        })();
        return;
      }
      // Defenders showing without preview AND without custom (e.g. defense
      // play viewing offense). Selection still flips for symmetry, but
      // drawing remains non-functional in this read-only context.
      setSelectedOpponentPlayerId(playerId);
    },
    [customOpponentPlayId, opponentPlayers, opponentPickedRoutes, playId, blockIfPreview, toast, router],
  );

  const handleOpponentPlayerMove = useCallback(
    (playerId: string, position: Point2) => {
      // Compute the delta BEFORE we update positions so we can translate any
      // movement routes carried by this defender by the same amount —
      // mirrors the offense `player.move` reducer's behavior so the route
      // stays anchored to the player. Without this the route's start node
      // remains at the original location and the defender visibly detaches
      // from their movement line.
      const prevPlayers = editableOppRef.current;
      const moving = prevPlayers?.find((p) => p.id === playerId);
      const dx = moving ? position.x - moving.position.x : 0;
      const dy = moving ? position.y - moving.position.y : 0;
      // No-op moves (sub-pixel jitter that resolved to identical position)
      // shouldn't pollute the undo stack.
      if (dx === 0 && dy === 0) return;
      recordOppEdit();

      setEditableOppPlayers((prev) => {
        if (!prev) return prev;
        return prev.map((p) =>
          p.id === playerId ? { ...p, position } : p,
        );
      });
      if (dx !== 0 || dy !== 0) {
        setEditableOppRoutes((prev) => {
          if (!prev || prev.length === 0) return prev;
          return prev.map((r) => {
            if (r.carrierPlayerId !== playerId) return r;
            return {
              ...r,
              nodes: r.nodes.map((n) => ({
                ...n,
                position: { x: n.position.x + dx, y: n.position.y + dy },
              })),
              segments: r.segments.map((s) =>
                s.controlOffset
                  ? {
                      ...s,
                      controlOffset: {
                        x: s.controlOffset.x + dx,
                        y: s.controlOffset.y + dy,
                      },
                    }
                  : s,
              ),
            };
          });
        });
      }
      if (oppSaveTimerRef.current) clearTimeout(oppSaveTimerRef.current);
      oppSaveTimerRef.current = setTimeout(() => {
        const latest = editableOppRef.current;
        if (!latest) return;
        void (async () => {
          const res = await updateCustomOpponentPlayersAction(playId, latest);
          if (!res.ok) {
            toast(res.error, "error");
            return;
          }
          // Mirror the persisted snapshot into doc.metadata so other consumers
          // (animation, vs-play card) see the up-to-date positions. Goes
          // through primaryDispatch so it doesn't enter the undo timeline
          // (this is an internal post-save sync, not a user edit).
          primaryDispatch({
            type: "document.setMetadata",
            patch: { vsPlaySnapshot: res.snapshot },
          });
        })();
      }, 350);
      // Persist the routes too — the routes-only action handles its own
      // debounce, so subsequent moves coalesce naturally.
      if (dx !== 0 || dy !== 0) {
        persistOpponentRoutes();
      }
    },
    [playId, primaryDispatch, toast, persistOpponentRoutes, recordOppEdit],
  );

  // Persist a freshly-applied opponent snapshot (used after undo/redo so
  // the server state catches up to the in-memory revert). Players +
  // routes both flow through their individual debounced save paths.
  const persistOpponentPlayers = useCallback(() => {
    if (oppSaveTimerRef.current) clearTimeout(oppSaveTimerRef.current);
    oppSaveTimerRef.current = setTimeout(() => {
      const latest = editableOppRef.current;
      if (!latest) return;
      void (async () => {
        const res = await updateCustomOpponentPlayersAction(playId, latest);
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
        primaryDispatch({
          type: "document.setMetadata",
          patch: { vsPlaySnapshot: res.snapshot },
        });
      })();
    }, 50);
  }, [playId, primaryDispatch, toast]);

  // Apply an opponent snapshot to local state. Used by both undo and redo
  // to swap the live state for a saved one. After applying we kick the
  // persistence handlers so the server catches up.
  const applyOppSnapshot = useCallback(
    (snap: OppSnapshot) => {
      setEditableOppPlayers(snap.players);
      setEditableOppRoutes(snap.routes);
      // Re-arm the seeded-version refs so the snapshot useEffects don't
      // immediately overwrite our applied state. We do NOT touch
      // seededVersionRef here because the underlying hidden-play version
      // hasn't actually changed — only the in-memory state has.
      persistOpponentPlayers();
      persistOpponentRoutes();
    },
    [persistOpponentPlayers, persistOpponentRoutes],
  );

  const undo = useCallback(() => {
    setEditTimeline((t) => {
      if (t.length === 0) return t;
      const last = t[t.length - 1];
      if (last === "primary") {
        primaryUndo();
      } else {
        // Pop opp past, push current to opp future, apply snapshot.
        setOppPast((p) => {
          if (p.length === 0) return p;
          const snap = p[p.length - 1];
          const current: OppSnapshot = {
            players: editableOppRef.current,
            routes: editableOppRoutesRef.current,
          };
          setOppFuture((f) => [current, ...f]);
          applyOppSnapshot(snap);
          return p.slice(0, -1);
        });
      }
      return t.slice(0, -1);
    });
  }, [primaryUndo, applyOppSnapshot]);

  const redo = useCallback(() => {
    // Redo logic mirrors undo: peek the inverse of the most-recent undo.
    // We track the "redo timeline" by inferring from primary + opp future
    // sizes since we don't keep a separate redoTimeline (the primary's
    // own future stack handles its own redo, and the order is preserved
    // because every primary `dispatch` clears the opp future too).
    if (primaryCanRedo && oppFuture.length === 0) {
      primaryRedo();
      setEditTimeline((t) => [...t, "primary"]);
      return;
    }
    if (oppFuture.length > 0 && !primaryCanRedo) {
      const next = oppFuture[0];
      const current: OppSnapshot = {
        players: editableOppRef.current,
        routes: editableOppRoutesRef.current,
      };
      setOppPast((p) => [...p, current]);
      setOppFuture((f) => f.slice(1));
      applyOppSnapshot(next);
      setEditTimeline((t) => [...t, "opponent"]);
      return;
    }
    // Both have redo available — choose primary by default. (The mixed
    // case is rare since we clear oppFuture on primary edits; it only
    // arises if the user undoes opp, then undoes primary, then wants to
    // redo. Primary-first is a sensible default.)
    if (primaryCanRedo) {
      primaryRedo();
      setEditTimeline((t) => [...t, "primary"]);
    }
  }, [primaryCanRedo, primaryRedo, oppFuture, applyOppSnapshot]);

  const canUndo = primaryCanUndo || oppPast.length > 0;
  const canRedo = primaryCanRedo || oppFuture.length > 0;

  // Active drawing style (defaults for new routes)
  const [activeShape, setActiveShape] = useState<SegmentShape>("straight");
  const [activeStrokePattern, setActiveStrokePattern] = useState<StrokePattern>("solid");
  const [activeColor, setActiveColor] = useState("#FFFFFF");
  const [activeWidth, setActiveWidth] = useState(2.5);

  // Explicit "draw route" gesture gate. Off by default so taps/drags on the
  // canvas never silently create routes — the user must opt in via the pill.
  // Resets whenever the player selection clears so the gate doesn't linger
  // across unrelated edits.
  const [isNavPending, startNavTransition] = useTransition();
  const [upgradeNotice, setUpgradeNotice] = useState<{ title: string; message: string } | null>(null);

  // Touch devices (phones, tablets) get an explicit Edit/Done lock to
  // prevent accidental drags from a stray finger. Pointer-and-keyboard
  // devices (desktop, laptop) skip the lock entirely — Done becomes a
  // selection-clearing action instead, since the canvas is interaction-safe
  // with a mouse. We detect via `(hover: none) and (pointer: coarse)` so
  // hybrid laptops with touchscreens but a mouse stay in desktop mode.
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(hover: none) and (pointer: coarse)");
    const apply = () => setIsTouchDevice(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);

  // Fullscreen field. The heavy lifting is CSS (`body.play-field-fullscreen`
  // in globals) — it hides the site chrome and lets the field-viewport fill
  // the screen, the same shape Game Mode already uses. Keeping it a body
  // class rather than re-parenting the field means EditorCanvas never
  // remounts, so selection and undo history survive the toggle.
  const [fieldFullscreen, setFieldFullscreen] = useState(false);
  useEffect(() => {
    if (!fieldFullscreen) return;
    document.body.classList.add("play-field-fullscreen");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFieldFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("play-field-fullscreen");
      window.removeEventListener("keydown", onKey);
    };
  }, [fieldFullscreen]);

  // Touch defaults to view-only so a coach can just watch the play on a
  // phone without tripping over edit controls. Non-touch always renders the
  // full editor: `effectiveMode` short-circuits to "edit" on those devices
  // regardless of what `mode` happens to be set to (it's never user-flippable
  // outside of touch).
  // Example previews open in edit mode on touch so visitors can drag a player
  // and feel the editor immediately — the whole point of the demo. Regular
  // playbooks default to view so a stray finger tap can't move things.
  const [mode, setMode] = useState<"view" | "edit">(isExamplePreview ? "edit" : "view");
  const effectiveMode = isTouchDevice ? mode : "edit";

  // Toggle wired to both the mobile Edit/Done button and the desktop
  // Done/Edit button in EditorHeaderBar. Clears any selection when
  // entering view so the inspector doesn't keep referencing a now-hidden
  // pick.
  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === "edit" ? "view" : "edit";
      if (next === "view") {
        setSelectedPlayerId(null);
        setSelectedRouteId(null);
        setSelectedNodeId(null);
        setSelectedSegmentId(null);
        setSelectedZoneId(null);
      }
      return next;
    });
  }, []);

  // Tutorial → edit mode on touch. On phones / tablets the editor opens
  // in "view" mode by default — coaches have to tap Edit to enter the
  // editing surface, which is intentional (a stray finger can't move
  // players accidentally). When the tour launches we want the coach
  // straight into the edit experience or step 1's spotlight points at
  // a half-disabled field. The TutorialProvider fires a one-shot
  // `tutorial:active` window event on mount; we flip the mode here.
  useEffect(() => {
    function onTutorialActive() {
      if (isTouchDevice) setMode("edit");
    }
    window.addEventListener("tutorial:active", onTutorialActive);
    return () => window.removeEventListener("tutorial:active", onTutorialActive);
  }, [isTouchDevice]);

  /* ---------- Auto-save ---------- */
  const [isSaving, setIsSaving] = useState(false);
  /**
   * What we can HONESTLY tell the coach about their work.
   *  idle    — nothing to say yet
   *  saved   — the server confirmed it
   *  pending — it's safe on this device but NOT yet on the server
   * The editor previously had no indicator at all (`isSaving` was declared and
   * never rendered), so silence read as "saved" — including when the save had
   * thrown offline and the work was going nowhere. Silence is the lie.
   */
  const [saveState, setSaveState] = useState<SaveState>("idle");
  /** The version this session started from; see the prop's docstring. */
  const baseVersionIdRef = useRef<string | null>(baseVersionId);
  useEffect(() => {
    baseVersionIdRef.current = baseVersionId;
  }, [baseVersionId]);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstDocRender = useRef(true);
  const [gameLock, setGameLock] = useState<{
    playbookId: string;
    callerName: string | null;
  } | null>(null);

  // While a player/route/node/segment/zone is selected, we treat the user
  // as actively sketching and DEFER saving until they signal completion
  // (deselect via Done, click-outside, Esc, or switching selection). With
  // nothing selected, doc edits (toolbar, field-size, etc.) save through
  // the same short debounce as before — those are discrete commits, not
  // sketches in progress.
  const SAVE_DEBOUNCE_IDLE_MS = 1_500;
  const SAVE_DEBOUNCE_FLUSH_MS = 200;
  const SAVE_SAFETY_NET_MS = 30_000;
  const anySelected =
    selectedPlayerId != null ||
    selectedRouteId != null ||
    selectedNodeId != null ||
    selectedSegmentId != null ||
    selectedZoneId != null;
  // Refs so async timer callbacks see the latest values without re-running.
  const anySelectedRef = useRef(anySelected);
  useEffect(() => {
    anySelectedRef.current = anySelected;
  }, [anySelected]);
  const canSaveRef = useRef(false);
  useEffect(() => {
    canSaveRef.current =
      canEdit && !isExamplePreview && !isArchived && gameLock == null;
  }, [canEdit, isExamplePreview, isArchived, gameLock]);

  /**
   * Write the coach's current work to the device. Called the moment an edit
   * happens — BEFORE any save is attempted — so the work is durable regardless
   * of whether the network exists, the save succeeds, or this component ever
   * unmounts cleanly. Only ever removed on a CONFIRMED server write.
   *
   * Best-effort by necessity (IndexedDB can refuse right after a cold launch),
   * but never silent: a failure here means the ONLY copy is React state, which
   * is exactly the state we're eliminating, so it's worth a console record.
   */
  const persistDraft = useCallback(async () => {
    if (!canSaveRef.current) return;
    try {
      await putPlayDraft({
        playId,
        playbookId,
        document: docRef.current,
        // The version this edit started from — captured now because this is the
        // only moment we know it. It's what lets a later upload tell "I changed
        // nothing" from "we both changed it" without guessing.
        baseVersionId: baseVersionIdRef.current,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error("[editor] could not persist draft locally", e);
    }
  }, [playId, playbookId]);

  const runSave = useCallback(async () => {
    if (!canSaveRef.current) return;
    if (!isDirtyRef.current) return;
    setIsSaving(true);
    // Capture the exact doc reference we're about to send. After the save
    // resolves, we compare against the latest local reference to detect
    // whether the user kept editing while the save was in flight.
    const sentDoc = docRef.current;
    // Override target (e.g. library admin edit) bypasses the
    // playId-keyed play_versions write — there's no row in plays to
    // update because the library doesn't synthesize one. The
    // adapter's contract matches the default action's success / error
    // shape so the rest of this function doesn't need to fork.
    // A server action does NOT return {ok:false} when the network is gone — it
    // THROWS (TypeError: "Load failed"). Without this try/catch the ok/else
    // branches below were both unreachable offline: no toast, isSaving stuck
    // true forever (which also permanently wedged the reload guard), and an
    // unhandled rejection. The coach got no signal at all while their work went
    // nowhere. The draft is already on the device by now, so a failure here is
    // "not uploaded yet", not "lost".
    // `null` means the call THREW (no network) — distinct from a returned
    // {ok:false}, which is a server saying no.
    const res = await (async () => {
      try {
        return saveAdapter
          ? await saveAdapter(sentDoc)
          : await savePlayVersionAction(playId, sentDoc, undefined, undefined, {
              // Tell the server what we edited FROM. If the head has moved, it
              // refuses rather than reverting whoever moved it — and the version
              // history stops claiming we'd seen an edit we never saw.
              baseVersionId: baseVersionIdRef.current,
            });
      } catch {
        return null;
      }
    })();
    if (res === null) {
      // Offline or a blip. KEEP the draft — it is the only copy — and leave
      // isDirtyRef true so the next tick retries. Say so honestly rather than
      // implying it saved.
      setSaveState("pending");
      setIsSaving(false);
      return;
    }
    if (isGameModeLocked(res)) {
      setGameLock({
        playbookId: res.gameLock.playbookId,
        callerName: res.gameLock.callerName,
      });
    } else if (res.ok) {
      // Advance the base to the version we just created. Without this, the very
      // next save would send a base the server has already moved past and
      // conflict with ITSELF after one edit. (The saveAdapter path — library
      // admin edits — writes no play_versions row and returns no id; it also
      // never sends a base, so it stays on the historical last-writer-wins
      // behaviour and there is nothing to advance.)
      if ("versionId" in res && typeof res.versionId === "string") {
        baseVersionIdRef.current = res.versionId;
      }
      // Only declare clean if local hasn't moved past what we sent.
      if (docRef.current === sentDoc) {
        isDirtyRef.current = false;
        // CONFIRMED server write — the one and only condition under which the
        // local copy may be dropped. If the coach kept editing while this was
        // in flight, the draft still holds newer work: leave it.
        void removePlayDraft(playId).catch(() => {});
      }
      setSaveState("saved");
      router.refresh();
    } else if (isSaveConflict(res)) {
      // Someone else moved the play while this session held it. We did NOT
      // overwrite them, and the draft is still on the device — nothing is lost
      // either way. Park it as a conflict; resolving is a deliberate choice,
      // not something to guess at behind the coach's back.
      isDirtyRef.current = true;
      setSaveState("conflict");
    } else {
      toast(res.error, "error");
      setSaveState("pending");
    }
    setIsSaving(false);
  }, [playId, router, toast, saveAdapter]);

  // Doc-change driven autosave scheduling. Marks dirty and schedules the
  // save: a long safety-net timer while a selection is active, the regular
  // short debounce otherwise. The deselect effect below clears + flushes.
  useEffect(() => {
    if (!canEdit) return;
    if (isFirstDocRender.current) {
      isFirstDocRender.current = false;
      return;
    }
    if (isExamplePreview) return;
    if (isArchived) return;
    if (gameLock) return;
    isDirtyRef.current = true;
    // DURABLE FIRST, transmit second. Write the edit to the device before any
    // network is involved, so it survives unmount, a backgrounded WebView being
    // reclaimed by iOS (a process kill — no unmount, no flush), and a save that
    // never leaves the device. Previously the doc lived ONLY in React state:
    // three plays edited at halftime → likely zero survived the drive home,
    // with no warning at any point. Cheap: one keyed put, fire-and-forget.
    void persistDraft();
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    const delay = anySelected ? SAVE_SAFETY_NET_MS : SAVE_DEBOUNCE_IDLE_MS;
    autoSaveTimer.current = setTimeout(() => void runSave(), delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, canEdit, isExamplePreview, isArchived, gameLock]);

  // Selection-driven autosave flush. When the user deselects (anySelected
  // transitions to false) and there are unsaved edits from the just-ended
  // selection, flush the save promptly instead of waiting out the 30s
  // safety net. A tiny debounce absorbs deselect+reselect ping-pong.
  useEffect(() => {
    if (anySelected) return;
    if (!isDirtyRef.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => void runSave(), SAVE_DEBOUNCE_FLUSH_MS);
  }, [anySelected, runSave]);

  // Best-effort flush on unmount. The server action invocation is fired
  // and not awaited — the network round-trip likely outlives the unmount,
  // and even if the response never reaches the client, the server-side
  // write completes. Without this, navigating mid-selection within the 30s
  // safety net would lose unsaved edits.
  // Saved into a ref so the cleanup closure always sees the latest
  // adapter even if the parent re-renders with a new callback identity.
  const saveAdapterRef = useRef(saveAdapter);
  useEffect(() => {
    saveAdapterRef.current = saveAdapter;
  }, [saveAdapter]);
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      if (isDirtyRef.current && canSaveRef.current) {
        const adapter = saveAdapterRef.current;
        if (adapter) {
          void adapter(docRef.current);
        } else {
          void savePlayVersionAction(playId, docRef.current);
        }
      }
    };
  }, [playId]);

  useEffect(() => {
    if (!isSaving) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isSaving]);

  // Block the native app's pull-to-refresh / reload-on-resume while the coach
  // is editing, has unsaved local edits, or a save is in flight — so a stray
  // pull or a backgrounded-then-reopened resume can't discard route work. The
  // predicate is evaluated at gesture/resume time (not during render), so it
  // reads the live `isDirtyRef`; it re-registers only when mode/saving flips.
  useEffect(() => {
    return registerReloadGuard(
      () => effectiveMode === "edit" || isDirtyRef.current || isSaving,
    );
  }, [effectiveMode, isSaving]);

  const saveAsNewFormation = useCallback(
    async (name: string) => {
      if (
        blockIfPreview(
          "Saving a new formation from an example playbook isn't persisted. Start your own playbook to keep your formations.",
        )
      ) {
        return;
      }
      const res = await saveFormationAction(
        name,
        doc.layers.players,
        doc.sportProfile,
        typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4,
        "offense",
        playbookId,
      );
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      dispatch({
        type: "document.setFormationLink",
        formationId: res.formationId,
        formationName: name,
        players: doc.layers.players,
        formationLosY:
          typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4,
      });
      toast(`Saved "${name}" as a new formation`, "success");
      router.refresh();
    },
    [doc, dispatch, router, toast, blockIfPreview, playbookId],
  );

  const navigateToPlay = useCallback(
    (targetPlayId: string) => {
      startNavTransition(() => {
        router.push(`/plays/${targetPlayId}/edit`);
      });
    },
    [router, startNavTransition],
  );

  // Show toolbar when a player (offense or opponent), route, or zone is selected
  const showToolbar =
    selectedPlayerId != null ||
    selectedOpponentPlayerId != null ||
    selectedRouteId != null ||
    selectedZoneId != null;
  const selectedZone = (doc.layers.zones ?? []).find((z) => z.id === selectedZoneId) ?? null;

  const selectedRoute = doc.layers.routes.find((r) => r.id === selectedRouteId);
  const selectedSeg = selectedRoute?.segments.find((s) => s.id === selectedSegmentId);
  const selectedPlayer = doc.layers.players.find((p) => p.id === selectedPlayerId);
  const selectedOpponentPlayer =
    (editableOppPlayers ?? []).find((p) => p.id === selectedOpponentPlayerId) ?? null;
  // Located here (rather than next to the toolbar handlers below) because
  // both the display-value computations AND the handlers need it.
  const selectedOpponentRoute = useMemo<Route | null>(() => {
    if (!selectedOpponentPlayerId) return null;
    return (
      (editableOppRoutes ?? []).find(
        (r) => r.carrierPlayerId === selectedOpponentPlayerId,
      ) ?? null
    );
  }, [selectedOpponentPlayerId, editableOppRoutes]);

  // Toolbar display values: reflect current selection if one exists, else active defaults.
  // Opponent route values take effect when an opponent player is selected (and
  // they carry a movement route) — the toolbar should show what's currently
  // applied to that route, just like the offense path does for selectedRoute.
  // If a segment's stored shape is "zigzag" (legacy — the shape option has been
  // removed in favour of the motion stroke pattern), fall back to "straight"
  // so the SegmentedControl has a valid selection.
  const oppRouteForDisplay = selectedOpponentRoute;
  const oppFirstSeg = oppRouteForDisplay?.segments[0] ?? null;
  const rawShape = selectedSeg?.shape ?? oppFirstSeg?.shape ?? activeShape;
  const displayShape: SegmentShape = rawShape === "zigzag" ? "straight" : rawShape;
  const displayStroke =
    selectedSeg?.strokePattern ?? oppFirstSeg?.strokePattern ?? activeStrokePattern;
  const displayColor =
    selectedRoute?.style.stroke ??
    oppRouteForDisplay?.style.stroke ??
    (selectedPlayer && !selectedRouteId ? selectedPlayer.style.fill : null) ??
    selectedOpponentPlayer?.style.fill ??
    activeColor;
  const displayWidth =
    selectedRoute?.style.strokeWidth ??
    oppRouteForDisplay?.style.strokeWidth ??
    activeWidth;
  const displayEndDecoration = selectedRoute
    ? resolveEndDecoration(selectedRoute)
    : oppRouteForDisplay
      ? resolveEndDecoration(oppRouteForDisplay)
      : "arrow";

  const [copyTarget, setCopyTarget] = useState<CopyTarget | null>(null);
  const [gameModeUpgradeOpen, setGameModeUpgradeOpen] = useState(false);

  const duplicate = useCallback(() => {
    if (
      blockIfPreview(
        "Copying a play in an example playbook isn't persisted. Start your own playbook to save copies.",
      )
    ) {
      return;
    }
    setCopyTarget({
      kind: "play",
      playId,
      playName: doc.metadata.coachName || "Untitled play",
      hasFormation: !!doc.metadata.formationId,
      sourceFormationName: doc.metadata.formation || null,
    });
  }, [playId, doc.metadata.coachName, doc.metadata.formationId, doc.metadata.formation, blockIfPreview]);

  const newPlay = useCallback(() => {
    if (
      blockIfPreview(
        "Creating a play in an example playbook isn't persisted. Start your own playbook to save plays.",
      )
    ) {
      return;
    }
    // Route back to the playbook with the formation picker auto-opened.
    // Keeps creation consistent with the play grid's "New play" flow —
    // the editor used to short-circuit to an empty play, which lost the
    // formation context coaches expect when starting a new play.
    router.push(`/playbooks/${playbookId}?tab=plays&new=1`);
  }, [blockIfPreview, playbookId, router]);

  const [moveTarget, setMoveTarget] = useState<MovePlayToGroupTarget | null>(null);
  const openMoveToGroup = useCallback(
    (currentGroupId: string | null) => {
      setMoveTarget({
        playId,
        playName: doc.metadata.coachName?.trim() || "Untitled play",
        currentGroupId,
      });
    },
    [playId, doc.metadata.coachName],
  );
  const currentGroupId = useMemo<string | null>(
    () => initialNav.find((p) => p.id === playId)?.group_id ?? null,
    [initialNav, playId],
  );

  const archive = useCallback(
    async (archived: boolean) => {
      // Skip the read-only intercept when going from archived → active. The
      // play-archived modal's whole point is to prompt this exact action, so
      // bouncing the request would create a dead-end loop. The archived →
      // archived (re-archive) and active → archived (initial archive)
      // directions still go through the gate so example previews surface
      // their CTA correctly.
      if (
        archived &&
        blockIfPreview(
          "Archiving a play in an example playbook isn't persisted. Start your own playbook to manage plays.",
        )
      ) {
        return;
      }
      const res = await archivePlayAction(playId, archived);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast(archived ? "Play archived." : "Play restored.", "success");
      // Stay on the play — the editor still works on archived plays;
      // surrounding state (sibling nav, list) refreshes from the server.
      router.refresh();
    },
    [blockIfPreview, playId, router, toast],
  );

  const deletePlay = useCallback(() => {
    if (
      blockIfPreview(
        "Deleting a play in an example playbook isn't persisted. Start your own playbook to manage plays.",
      )
    ) {
      return;
    }
    // Inline confirm matches the playbook detail page's card-menu pattern
    // (window.confirm at ui.tsx:1657). No dedicated ConfirmDialog primitive
    // exists yet; promote later if more destructive actions show up.
    const playName = doc.metadata.coachName?.trim() || "this play";
    const ok = window.confirm(
      `Delete "${playName}"? It will be moved to trash for 30 days, then permanently removed.`,
    );
    if (!ok) return;
    void (async () => {
      const res = await deletePlayAction(playId);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast("Play deleted.", "success");
      router.push(`/playbooks/${playbookId}`);
    })();
  }, [blockIfPreview, playId, doc.metadata.coachName, playbookId, router, toast]);

  /* ---------- Toolbar handlers ---------- */

  // Mutate the opponent route carried by the selected defender, recording
  // the edit for undo + persisting via the routes-only debounced action.
  const updateSelectedOppRoute = useCallback(
    (transform: (r: Route) => Route) => {
      if (!selectedOpponentPlayerId) return;
      const list = editableOppRoutesRef.current ?? [];
      const target = list.find((r) => r.carrierPlayerId === selectedOpponentPlayerId);
      if (!target) return;
      recordOppEdit();
      setEditableOppRoutes((prev) =>
        (prev ?? []).map((r) =>
          r.carrierPlayerId === selectedOpponentPlayerId ? transform(r) : r,
        ),
      );
      persistOpponentRoutes();
    },
    [selectedOpponentPlayerId, persistOpponentRoutes, recordOppEdit],
  );

  // Mutate the opponent player token style (color of the triangle).
  // Preserves the existing labelColor; only fill + stroke move.
  const updateSelectedOppPlayerStyle = useCallback(
    (patch: { fill: string; stroke: string }) => {
      if (!selectedOpponentPlayerId) return;
      recordOppEdit();
      setEditableOppPlayers((prev) =>
        prev == null
          ? prev
          : prev.map((p) =>
              p.id === selectedOpponentPlayerId
                ? { ...p, style: { ...p.style, ...patch } }
                : p,
            ),
      );
      persistOpponentPlayers();
    },
    [selectedOpponentPlayerId, persistOpponentPlayers, recordOppEdit],
  );

  const handleShapeChange = useCallback(
    (shape: SegmentShape) => {
      setActiveShape(shape);
      if (selectedSegmentId && selectedRouteId) {
        dispatch({ type: "route.setSegmentShape", routeId: selectedRouteId, segmentId: selectedSegmentId, shape });
      } else if (selectedRouteId && selectedRoute) {
        // Apply to all segments of the selected route
        for (const s of selectedRoute.segments) {
          dispatch({ type: "route.setSegmentShape", routeId: selectedRouteId, segmentId: s.id, shape });
        }
      } else if (selectedOpponentRoute) {
        updateSelectedOppRoute((r) => ({
          ...r,
          segments: r.segments.map((s) => ({ ...s, shape })),
        }));
      }
    },
    [dispatch, selectedRouteId, selectedSegmentId, selectedRoute, selectedOpponentRoute, updateSelectedOppRoute],
  );

  const handleStrokeChange = useCallback(
    (strokePattern: StrokePattern) => {
      setActiveStrokePattern(strokePattern);
      if (selectedRouteId && selectedRoute) {
        // Apply the stroke pattern ONLY to the explicitly selected segment.
        // If no specific segment is selected, apply to all segments of the
        // route (whole-route edit).
        if (selectedSegmentId) {
          dispatch({
            type: "route.setSegmentStroke",
            routeId: selectedRouteId,
            segmentId: selectedSegmentId,
            strokePattern,
          });
        } else {
          for (const s of selectedRoute.segments) {
            dispatch({
              type: "route.setSegmentStroke",
              routeId: selectedRouteId,
              segmentId: s.id,
              strokePattern,
            });
          }
        }
        return;
      }
      if (selectedOpponentRoute) {
        updateSelectedOppRoute((r) => ({
          ...r,
          segments: r.segments.map((s) => ({ ...s, strokePattern })),
        }));
      }
    },
    [dispatch, selectedRouteId, selectedSegmentId, selectedRoute, selectedOpponentRoute, updateSelectedOppRoute],
  );

  const handleEndDecorationChange = useCallback(
    (endDecoration: EndDecoration) => {
      if (selectedRouteId) {
        dispatch({ type: "route.setEndDecoration", routeId: selectedRouteId, endDecoration });
        return;
      }
      if (selectedOpponentRoute) {
        updateSelectedOppRoute((r) => ({ ...r, endDecoration }));
      }
    },
    [dispatch, selectedRouteId, selectedOpponentRoute, updateSelectedOppRoute],
  );

  const handleColorChange = useCallback(
    (color: string) => {
      setActiveColor(color);
      if (selectedZone) {
        // Convert hex swatch to translucent fill + solid stroke pair.
        const m = color.match(/^#([0-9a-f]{6})$/i);
        let fill = color;
        let stroke = color;
        if (m) {
          const r = parseInt(m[1].slice(0, 2), 16);
          const g = parseInt(m[1].slice(2, 4), 16);
          const b = parseInt(m[1].slice(4, 6), 16);
          fill = `rgba(${r},${g},${b},0.18)`;
          stroke = `rgba(${r},${g},${b},0.75)`;
        }
        dispatch({
          type: "zone.update",
          zoneId: selectedZone.id,
          patch: { style: { fill, stroke } },
        });
        return;
      }
      if (selectedRouteId && selectedRoute) {
        dispatch({
          type: "route.setStyle",
          routeId: selectedRouteId,
          style: { ...selectedRoute.style, stroke: color },
        });
        notifyTutorialAction("route-color-changed");
        return;
      }
      if (selectedPlayer) {
        dispatch({
          type: "player.setStyle",
          playerId: selectedPlayer.id,
          style: { ...selectedPlayer.style, fill: color },
        });
        notifyTutorialAction("player-recolored");
        // A player's fill color cascades to their routes' stroke color
        // (that's how `buildRouteStyle` derives a default). The coach
        // sees the route change too, so the route-color tutorial
        // checkbox should tick from this action — otherwise step 5's
        // "Change the route color" stays unchecked even though the
        // route on screen just turned red.
        notifyTutorialAction("route-color-changed");
        return;
      }
      if (selectedOpponentPlayerId) {
        // Color the defender token AND any movement they carry — same
        // visual coupling offense uses (player color = route color by
        // default). Persist both.
        const opp = (editableOppPlayers ?? []).find((p) => p.id === selectedOpponentPlayerId);
        if (opp) {
          updateSelectedOppPlayerStyle({ ...opp.style, fill: color });
        }
        if (selectedOpponentRoute) {
          updateSelectedOppRoute((r) => ({
            ...r,
            style: { ...r.style, stroke: color },
          }));
        }
      }
    },
    [
      dispatch,
      selectedRouteId,
      selectedRoute,
      selectedPlayer,
      selectedZone,
      selectedOpponentPlayerId,
      selectedOpponentRoute,
      editableOppPlayers,
      updateSelectedOppPlayerStyle,
      updateSelectedOppRoute,
    ],
  );

  const handleWidthChange = useCallback(
    (width: number) => {
      setActiveWidth(width);
      if (selectedRouteId && selectedRoute) {
        dispatch({
          type: "route.setStyle",
          routeId: selectedRouteId,
          style: { ...selectedRoute.style, strokeWidth: width },
        });
        return;
      }
      if (selectedOpponentRoute) {
        updateSelectedOppRoute((r) => ({
          ...r,
          style: { ...r.style, strokeWidth: width },
        }));
      }
    },
    [dispatch, selectedRouteId, selectedRoute, selectedOpponentRoute, updateSelectedOppRoute],
  );

  const handleSmooth = useCallback(() => {
    if (selectedSegmentId && selectedRouteId) {
      dispatch({
        type: "route.setSegmentControl",
        routeId: selectedRouteId,
        segmentId: selectedSegmentId,
        controlOffset: null,
      });
    }
  }, [dispatch, selectedRouteId, selectedSegmentId]);

  const handleDone = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedSegmentId(null);
    setSelectedRouteId(null);
    setSelectedPlayerId(null);
    // "Done" returns the editor to its default offense-mode posture: drop
    // the opponent selection AND flip the active side back to primary so
    // the offense un-dims and subsequent canvas gestures act on the
    // primary play, not the overlay.
    setSelectedOpponentPlayerId(null);
    setActiveSide("primary");
  }, []);

  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      selectedPlayerId == null &&
      selectedOpponentPlayerId == null &&
      selectedRouteId == null &&
      selectedZoneId == null
    ) return;
    function onDocPointer(e: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      const target = e.target as Element | null;
      if (!target) return;
      if (root.contains(target)) return;
      // Portaled editor popovers (color picker, future menus) are tagged with
      // `data-editor-overlay`. They live outside rootRef but logically belong
      // to the editor — clicks inside them must NOT trigger deselect, or a
      // user picking a color sees the in-flight selection wiped mid-pick.
      if (typeof target.closest === "function" && target.closest("[data-editor-overlay]")) return;
      handleDone();
      setSelectedZoneId(null);
    }
    document.addEventListener("pointerdown", onDocPointer, true);
    return () => document.removeEventListener("pointerdown", onDocPointer, true);
  }, [selectedPlayerId, selectedOpponentPlayerId, selectedRouteId, selectedZoneId, handleDone]);

  /* ---------- Hide site header on mobile editor ---------- */

  // Always hidden on mobile editor (not just in edit mode) — the slim
  // EditorPlaybookChrome banner replaces it. CSS gates the rule to
  // `<= 639px` so desktop site header stays visible.
  useEffect(() => {
    document.body.classList.add("editor-hide-site-header");
    return () => {
      document.body.classList.remove("editor-hide-site-header");
    };
  }, []);

  /* ---------- Keyboard shortcuts ---------- */

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const active = document.activeElement;
      const isInput =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);

      if (mod && e.shiftKey && e.key === "z") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && e.key === "y") {
        e.preventDefault();
        redo();
        return;
      }

      if (isInput) return;

      if (e.key === "Escape") {
        setSelectedPlayerId(null);
        setSelectedRouteId(null);
        setSelectedNodeId(null);
        setSelectedSegmentId(null);
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedNodeId && selectedRouteId) {
          dispatch({ type: "route.removeNodeBridging", routeId: selectedRouteId, nodeId: selectedNodeId });
          setSelectedNodeId(null);
        } else if (selectedRouteId) {
          dispatch({ type: "route.remove", routeId: selectedRouteId });
          setSelectedRouteId(null);
          setSelectedSegmentId(null);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, selectedRouteId, selectedNodeId, dispatch]);

  // Defense plays anchor a snapshot of the offense they were drawn against;
  // offense plays use the opponent overlay picker. Same node is rendered on
  // desktop sidebar and (in view mode) on mobile under the playback panel.
  const opponentCardNode = !showToolbar ? (
    isDefense && vsSnapshot ? (
      <VsPlayCard
        playId={playId}
        snapshot={vsSnapshot}
        showRoutes={showOpponentRoutes}
        onShowRoutesChange={setShowOpponentRoutes}
        onSnapshotReplaced={(snap: VsPlaySnapshot) =>
          dispatch({
            type: "document.setMetadata",
            patch: { vsPlaySnapshot: snap },
          })
        }
        onUnlinked={() =>
          dispatch({
            type: "document.setMetadata",
            patch: { vsPlayId: null, vsPlaySnapshot: null },
          })
        }
      />
    ) : (
      <OpponentOverlayCard
        currentPlayId={playId}
        currentPlaybookId={playbookId}
        playType={doc.metadata.playType ?? "offense"}
        nav={initialNav}
        allFormations={opponentFormations ?? allFormations}
        hasSelection={
          opponentPlayers != null ||
          (customOpponentPlayId != null && !opponentHidden)
        }
        onChange={(players) => {
          setOpponentPlayers(players);
          if (players == null) setOpponentPickedRoutes(null);
        }}
        onChangeRoutes={setOpponentPickedRoutes}
        showRoutes={showOpponentRoutes}
        onShowRoutesChange={setShowOpponentRoutes}
        hasCustomOpponent={customOpponentPlayId != null}
        opponentHidden={opponentHidden}
        canEditCustom={canEdit && !isExamplePreview}
        onCreateCustom={
          isDefense
            ? undefined
            : async () => {
                if (
                  blockIfPreview(
                    "Custom opponents aren't saved on example plays. Start your own playbook to keep changes.",
                  )
                ) {
                  return;
                }
                const res = await createCustomOpponentAction(playId);
                if (!res.ok) {
                  toast(res.error, "error");
                  return;
                }
                setCustomOpponentPlayId(res.hiddenPlayId);
                setOpponentHidden(false);
                setOpponentPlayers(null);
                setOpponentPickedRoutes(null);
                router.refresh();
              }
        }
        onSetHidden={async (hidden) => {
          const res = await setOpponentHiddenAction(playId, hidden);
          if (!res.ok) {
            toast(res.error, "error");
            return;
          }
          setOpponentHidden(hidden);
        }}
        onSaveCustomAsPlay={async (name) => {
          const res = await promoteCustomOpponentAction(playId, name);
          if (!res.ok) {
            toast(res.error, "error");
            return;
          }
          toast(`Saved "${name}" as a defensive play.`, "success");
          router.push(`/plays/${res.playId}/edit`);
        }}
        onInstallVsPlay={
          isDefense
            ? async (offId: string) => {
                if (
                  blockIfPreview(
                    "Installing a vs-play against an example play isn't saved. Start your own playbook to keep changes.",
                  )
                ) {
                  return;
                }
                const res = await installDefenseVsPlayAction(playId, offId);
                if (!res.ok) {
                  toast(res.error, "error");
                  return;
                }
                router.push(`/plays/${res.playId}/edit`);
              }
            : undefined
        }
      />
    )
  ) : null;

  // Phone-in-landscape: drop the editor chrome (toolbars, sidebar, opponent
  // picker, etc.) and render a fullscreen, tap-to-step playback view. We
  // reuse the real EditorCanvas (with a transparent click-catcher on top to
  // suppress edits) so the field looks identical to portrait — yard lines,
  // defenders, route arrowheads, run-path squiggle, all of it.
  if (isLandscapePhone) {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black"
        style={{ touchAction: "manipulation", userSelect: "none" }}
      >
        <div
          className="relative h-full max-h-screen overflow-hidden bg-black"
          style={{ aspectRatio: `${fieldAspect} / 1` }}
        >
          <EditorCanvas
            doc={doc}
            dispatch={dispatch}
            selectedPlayerId={selectedPlayerId}
            selectedRouteId={selectedRouteId}
            selectedNodeId={selectedNodeId}
            selectedSegmentId={selectedSegmentId}
            selectedZoneId={selectedZoneId}
            onSelectPlayer={setSelectedPlayerId}
            onSelectRoute={setSelectedRouteId}
            onSelectNode={setSelectedNodeId}
            onSelectSegment={setSelectedSegmentId}
            onSelectZone={setSelectedZoneId}
            pendingZone={pendingZone}
            onCommitPendingZone={(position) => {
              if (!pendingZone) return;
              dispatch({
                type: "zone.add",
                zone: mkZone(pendingZone.kind, "", position, pendingZone.style),
              });
              setPendingZone(null);
            }}
            onCancelPendingZone={() => setPendingZone(null)}
            activeShape={activeShape}
            activeStrokePattern={activeStrokePattern}
            onActiveStrokePatternChange={setActiveStrokePattern}
            activeColor={activeColor}
            activeWidth={activeWidth}
            fieldAspect={fieldAspect}
            fieldBackground={doc.fieldBackground}
            fieldStructure={fieldStructure}
            playbookColor={playbookColor}
            animatingPlayerIds={animatingPlayerIds}
            opponentFormation={opponentFormation ?? null}
            opponentPlayers={
              opponentPlayers ??
              (customOpponentPlayId != null && !opponentHidden
                ? editableOppPlayers
                : opponentHidden
                  ? null
                  : vsSnapshot?.players ?? null)
            }
            opponentRoutes={
              // Custom-opponent routes (defender movement the coach drew) always
              // render so the user can SEE what they just drew, regardless of the
              // showOpponentRoutes ghost-toggle. Other route sources (picked
              // preview / installed defense's offense ghost) stay gated by it.
              customOpponentPlayId != null && !opponentHidden
                ? editableOppRoutes
                : showOpponentRoutes
                  ? (opponentPickedRoutes && opponentPickedRoutes.length > 0
                      ? opponentPickedRoutes
                      : isDefense && vsSnapshot
                        ? vsSnapshot.routes
                        : null)
                  : null
            }
            opponentEditable={false}
            onOpponentPlayerMove={handleOpponentPlayerMove}
            selectedOpponentPlayerId={selectedOpponentPlayerId}
            onSelectOpponentPlayer={handleSelectOpponentPlayer}
            onCommitOpponentRoute={handleOpponentRouteCommit}
            onClearOpponentRoutes={handleClearOpponentRoutes}
            activeSide={activeSide}
            onActivateSide={setActiveSide}
            userTemplates={userTemplates}
          />
          <AnimationOverlay doc={animDoc} anim={anim} fieldAspect={fieldAspect} />
          {/* Transparent click-catcher: sits on top of EditorCanvas so taps
              advance the animation instead of starting a route draw or
              selecting a player. */}
          <button
            type="button"
            onClick={anim.step}
            aria-label="Advance play"
            className="absolute inset-0 cursor-pointer bg-transparent"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      // `play-editor-content` (defined in globals.css) caps this wrapper
      // — and therefore everything inside it: back link, EditorHeaderBar,
      // EditorPlaybookChrome, and the grid below — to a width that
      // matches the field at its natural max size. Lifting the cap to
      // this level (instead of the inner field-column) keeps the header
      // bar and "+ New play" button right-aligned with the field's
      // right edge, and removes the gap that opened up between the
      // column and the right sidebar when the column was capped alone.
      // `--field-aspect` lives here so the CSS calc sees the runtime
      // ratio; the field-viewport child still publishes its own copy
      // for the existing `.field-viewport` @media rules.
      //
      // `pb-20` on mobile reserves room under the editor stack for the
      // global fixed bottom nav (dropped at `sm:` where the nav isn't
      // fixed). Library mode embeds the editor inside a bordered card
      // mid-page — it has none of the editor chrome that hangs below the
      // field, and the page (not this component) owns bottom-nav
      // clearance — so that 80px becomes dead white space below the
      // field SVG. Skip it in library mode so the card hugs the field.
      className={`play-editor-content relative flex min-h-0 min-w-0 flex-1 flex-col gap-2 ${
        libraryMode ? "" : "pb-20 sm:pb-0"
      }`}
      style={{ ["--field-aspect" as string]: String(fieldAspect) }}
    >
      {/* Mobile-only slim playbook banner. Replaces the SiteHeader
          (hidden via editor-hide-site-header on mobile editor) and gives
          coaches a back affordance + Cal access without leaving the
          playbook's visual identity behind. Library mode owns its own
          page-level chrome (concept header, breadcrumbs, variant pill)
          so the playbook banner — which is tied to a real playbook —
          would only confuse coaches reading a library reference. */}
      {!libraryMode && (
        <EditorPlaybookChrome
          playbookId={playbookId}
          playbookName={playbookName ?? null}
          playbookColor={playbookColor}
          playbookLogoUrl={playbookLogoUrl}
          playbookSeason={playbookSeason}
          playbookVariant={playbookVariant}
          playbookOwnerName={playbookOwnerName}
        />
      )}
      {/* Tell the coach the truth about their work. The editor has never had a
          save indicator — `isSaving` was declared and never rendered — so
          silence meant "saved", including when the save had thrown offline and
          the edit was going nowhere. Only shown once there IS something to say. */}
      {canEdit && saveState !== "idle" && (
        <SaveStatePill state={saveState} />
      )}
      {isNavPending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-[1px]"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center gap-2 rounded-lg bg-surface-raised px-4 py-3 shadow-lg ring-1 ring-border">
            <svg
              className="size-5 animate-spin text-primary"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                strokeOpacity="0.25"
              />
              <path
                d="M22 12a10 10 0 0 1-10 10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-sm font-medium text-foreground">Loading play…</span>
          </div>
        </div>
      )}
      {isExamplePreview && <ExamplePreviewEditorBanner />}
      {isTutorialPlay && !isPlayArchived && !isExamplePreview && (
        <TutorialPlayBanner playId={playId} playbookId={playbookId} />
      )}
      {/* Empty-editor Cal discovery nudge. Targeted at NEW coaches: a free coach
          who still has prompts (coachCalFreePromptsRemaining is a positive
          number — null for entitled coaches, who don't need the "free prompts"
          pitch), early in their first playbook (≤ NEW_COACH_PLAY_LIMIT plays so
          we don't nag a veteran who opens the odd blank play), on a genuinely
          blank play (no routes drawn), where they can actually edit. Self-
          dismisses once opened or closed. */}
      {canEdit &&
        !isExamplePreview &&
        !isTutorialPlay &&
        !isPlayArchived &&
        !libraryMode &&
        coachAiAvailable &&
        typeof coachCalFreePromptsRemaining === "number" &&
        coachCalFreePromptsRemaining > 0 &&
        initialNav.length <= NEW_COACH_PLAY_LIMIT &&
        doc.layers.routes.length === 0 && (
          <EditorCalNudge freePromptsRemaining={coachCalFreePromptsRemaining} />
        )}
      {/* Tutorial gate signal: present in the DOM whenever the play has
          at least one route drawn. The "Draw a route" tour step watches
          for this via querySelector to gate its Next button. Visually
          hidden — the gate just checks presence, not geometry. */}
      {doc.layers.routes.length > 0 && (
        <span
          data-tutor="route-drawn"
          aria-hidden
          style={{
            position: "absolute",
            width: 0,
            height: 0,
            overflow: "hidden",
          }}
        />
      )}
      {/* Tutorial gate signal: present whenever a route is the current
          selection. The "Style your routes" tour step gates on this so
          the toolbar's per-selection controls actually have something to
          act on while the user is reading the step. */}
      {selectedRouteId && (
        <span
          data-tutor="route-selected"
          aria-hidden
          style={{
            position: "absolute",
            width: 0,
            height: 0,
            overflow: "hidden",
          }}
        />
      )}
      {isPlayArchived && (
        <ArchivedPlayEditorBanner
          canUnarchive={roleCanEdit && !isExamplePreview}
          onUnarchive={() => void archive(false)}
        />
      )}
      {/* Hide the full header bar on mobile while actively editing — the
          Done editing button moves to the very top so the field has as much
          vertical room as possible. Desktop always keeps the header.
          Library mode skips it entirely: the library page wraps the
          editor with its own concept header (name, variant pill,
          breadcrumbs, edit affordance for admins), so the editor's
          play-title nav would be redundant chrome that competes with
          the page hierarchy. */}
      {!libraryMode && (
        <div className={isTouchDevice && mode === "edit" ? "hidden sm:block" : ""}>
          <EditorHeaderBar
            playId={playId}
            playbookId={playbookId}
            doc={doc}
            dispatch={dispatch}
            initialNav={initialNav}
            initialGroups={initialGroups}
            onDuplicate={duplicate}
            onNewPlay={newPlay}
            onNavigateToPlay={navigateToPlay}
            onSaveAsNewFormation={saveAsNewFormation}
            onArchive={archive}
            onDelete={deletePlay}
            onMoveToGroup={openMoveToGroup}
            currentGroupId={currentGroupId}
            isArchived={isPlayArchived}
            allFormations={allFormations}
            canEdit={roleCanEdit}
            isPlayArchived={isPlayArchived}
            libraryMode={libraryMode}
            hideMobileNav={isTouchDevice && mode === "edit"}
            mode={isTouchDevice ? mode : undefined}
            onToggleMode={isTouchDevice ? toggleMode : undefined}
            tutorialVariant={coerceVariant(playbookVariant)}
          />
        </div>
      )}

      {!libraryMode &&
        playbookSettings &&
        doc.layers.players.length > playbookSettings.maxPlayers && (
          <p className="-mt-1 text-xs font-medium text-danger">
            {doc.layers.players.length} players on the field — this playbook
            allows only {playbookSettings.maxPlayers}.
          </p>
        )}

      {/* Routes */}
      <div
        className={`grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-5 ${
          libraryMode ? "" : "lg:grid-cols-[minmax(0,1fr)_320px]"
        }`}
      >
          <div
            className={`flex min-w-0 flex-col gap-3 ${
              // The min-heights below exist to keep the editor's toolbar /
              // notes / inspector row from collapsing on phones — they
              // reserve vertical room for the chrome that hangs below the
              // field. Library mode hides ALL of that chrome, so the
              // reserved space becomes dead air below the field. Skip the
              // min-height entirely in library mode so the white container
              // hugs the field SVG.
              libraryMode ? "" : "min-h-[260px] sm:min-h-[420px]"
            }`}
          >
            {/* No max-width on this inner column — the parent
                `.play-editor-content` wrapper already caps the entire
                editor stack to match the field's natural width, so the
                column naturally fills its grid cell exactly (column =
                field width on `lg:`, full content on smaller). */}
            {/* Touch-only Edit/Done toggle. Sits directly above the field
                so coaches on phones / tablets can flip between viewing and
                editing without hunting through the UI. Pointer-and-keyboard
                devices skip this entirely — they get a "Done" button in the
                toolbar that simply clears the current selection. */}
            {canEdit && isTouchDevice && (mobileEditingEnabled || gameModeAvailable) && (
              <div className="flex w-full gap-2">
                {mobileEditingEnabled && (
                  <button
                    type="button"
                    onClick={toggleMode}
                    className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border text-sm font-semibold ${
                      mode === "edit"
                        ? "border-border bg-surface-raised text-foreground hover:bg-surface"
                        : "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                  >
                    {mode === "edit" ? "Done editing" : "Edit play"}
                  </button>
                )}
                {gameModeAvailable && (
                  canUseGameMode ? (
                    <Link
                      href={`/playbooks/${playbookId}/game?play=${playId}`}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-brand-green bg-brand-green text-sm font-semibold text-white hover:bg-brand-green-hover"
                    >
                      Game mode
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setGameModeUpgradeOpen(true)}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-brand-green bg-brand-green text-sm font-semibold text-white hover:bg-brand-green-hover"
                    >
                      Game mode
                    </button>
                  )
                )}
                {/* Third slot: fullscreen. Shares the row's `flex-1` so the
                    buttons divide the width evenly (thirds when all three
                    render, halves when only two do). */}
                <button
                  type="button"
                  onClick={() => setFieldFullscreen(true)}
                  aria-label="View play fullscreen"
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised text-sm font-semibold text-foreground hover:bg-surface"
                >
                  <Maximize2 className="size-4" />
                  Fullscreen
                </button>
              </div>
            )}

            {/* Exit control, rendered only while fullscreen. It sits outside
                the field-viewport on purpose: the viewport takes
                `pointer-events-none` in view mode, which would swallow taps
                on a button nested inside it. */}
            {fieldFullscreen && (
              <button
                type="button"
                onClick={() => setFieldFullscreen(false)}
                aria-label="Exit fullscreen"
                className="play-field-fullscreen-exit inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-lg hover:bg-surface"
              >
                <Minimize2 className="size-4" />
                Exit
              </button>
            )}

            {/* The route toolbar is ALWAYS rendered — even with nothing
                selected — so the canvas never shifts when a player or
                route is selected. When no selection exists, the buttons
                still configure the "active" defaults used by the next
                route drawn, so the toolbar is never dead UI. Opacity
                signals that the selection-specific actions (Done, Smooth)
                don't apply yet. */}
            {canEdit && (
            <div
              data-toolbar-slot
              className={`${
                effectiveMode === "edit" ? "" : "hidden"
              } ${
                showToolbar ? "" : "opacity-60 [&_button]:cursor-default"
              }`}
            >
              <RouteToolbar
                shape={displayShape}
                onShapeChange={handleShapeChange}
                strokePattern={displayStroke}
                onStrokePatternChange={handleStrokeChange}
                color={displayColor}
                onColorChange={handleColorChange}
                width={displayWidth}
                onWidthChange={handleWidthChange}
                canSmooth={selectedSeg?.controlOffset != null}
                onSmooth={handleSmooth}
                onUndo={undo}
                canUndo={canUndo}
                onRedo={redo}
                canRedo={canRedo}
                onFlipHorizontal={() =>
                  dispatch({ type: "document.flip", axis: "horizontal" })
                }
                endDecoration={displayEndDecoration}
                onEndDecorationChange={handleEndDecorationChange}
                hasSelectedRoute={selectedRouteId != null || selectedOpponentRoute != null}
                hasSelectedPlayer={selectedPlayerId != null || selectedOpponentPlayerId != null}
                playerShape={
                  selectedPlayerId
                    ? (doc.layers.players.find((p) => p.id === selectedPlayerId)?.shape ?? "circle")
                    : undefined
                }
                onPlayerShapeChange={(shape) => {
                  if (!selectedPlayerId) return;
                  // Reducer keeps `isHotRoute` in sync (star ⇔ hot route),
                  // so this single dispatch is enough.
                  dispatch({ type: "player.setShape", playerId: selectedPlayerId, shape });
                }}
                playerRouteCount={
                  selectedOpponentPlayerId
                    ? (editableOppRoutes ?? []).filter((r) => r.carrierPlayerId === selectedOpponentPlayerId).length
                    : selectedPlayerId
                      ? doc.layers.routes.filter((r) => r.carrierPlayerId === selectedPlayerId).length
                      : 0
                }
                onClearPlayerRoutes={() => {
                  if (selectedOpponentPlayerId) {
                    handleClearOpponentRoutes(selectedOpponentPlayerId);
                    return;
                  }
                  if (!selectedPlayerId) return;
                  const playerRoutes = doc.layers.routes.filter(
                    (r) => r.carrierPlayerId === selectedPlayerId,
                  );
                  for (const r of playerRoutes) {
                    dispatch({ type: "route.remove", routeId: r.id });
                  }
                }}
                isDefense={doc.metadata.playType === "defense" || selectedOpponentPlayerId != null}
                onAddRectZone={() => {
                  const baseColor = selectedPlayer?.style.fill ?? null;
                  setPendingZone({
                    kind: "rectangle",
                    style: zoneStyleFromColor(baseColor),
                  });
                }}
                onAddEllipseZone={() => {
                  const baseColor = selectedPlayer?.style.fill ?? null;
                  setPendingZone({
                    kind: "ellipse",
                    style: zoneStyleFromColor(baseColor),
                  });
                }}
                showDoneButton={!isTouchDevice}
                hasAnySelection={
                  selectedPlayerId != null ||
                  selectedOpponentPlayerId != null ||
                  selectedRouteId != null ||
                  selectedNodeId != null ||
                  selectedSegmentId != null ||
                  selectedZoneId != null
                }
                onDone={() => {
                  handleDone();
                  setSelectedZoneId(null);
                }}
              />
            </div>
            )}

            <div
              // sm:relative (not sm:static) on desktop: keep this div a
              // positioned ancestor so AnimationOverlay's `absolute inset-0`
              // anchors HERE, not to whatever happens to be the next
              // positioned ancestor up the tree. With sm:static, animation
              // dots ended up rendered against the nearest positioned
              // ancestor (often a much larger container), throwing them
              // far outside the field — surfaced 2026-05-04.
              className={
                // Static positioning (relative for AnimationOverlay's
                // absolute anchor). The field scrolls with the page —
                // matching the playbook list's behavior, where only the
                // header is sticky and content flows beneath it.
                `field-viewport relative mx-auto w-full overflow-hidden rounded-xl bg-surface-inset ${
                  !canEdit || (isTouchDevice && mode === "view")
                    ? "pointer-events-none select-none"
                    : ""
                }`
              }
              style={
                {
                  aspectRatio: `${fieldAspect} / 1`,
                  // Used by the mobile cap in globals.css — see
                  // `.field-viewport` @media rule. Desktop ignores it.
                  ["--field-aspect" as string]: String(fieldAspect),
                } as React.CSSProperties
              }
            >
              <EditorCanvas
                doc={doc}
                dispatch={dispatch}
                selectedPlayerId={selectedPlayerId}
                selectedRouteId={selectedRouteId}
                selectedNodeId={selectedNodeId}
                selectedSegmentId={selectedSegmentId}
                selectedZoneId={selectedZoneId}
                onSelectPlayer={setSelectedPlayerId}
                onSelectRoute={setSelectedRouteId}
                onSelectNode={setSelectedNodeId}
                onSelectSegment={setSelectedSegmentId}
                onSelectZone={setSelectedZoneId}
                pendingZone={pendingZone}
                onCommitPendingZone={(position) => {
                  if (!pendingZone) return;
                  dispatch({
                    type: "zone.add",
                    zone: mkZone(pendingZone.kind, "", position, pendingZone.style),
                  });
                  setPendingZone(null);
                }}
                onCancelPendingZone={() => setPendingZone(null)}
                activeShape={activeShape}
                activeStrokePattern={activeStrokePattern}
                onActiveStrokePatternChange={setActiveStrokePattern}
                activeColor={activeColor}
                activeWidth={activeWidth}
                fieldAspect={fieldAspect}
                fieldBackground={doc.fieldBackground}
                fieldStructure={fieldStructure}
                playbookColor={playbookColor}
                animatingPlayerIds={animatingPlayerIds}
                opponentFormation={opponentFormation ?? null}
                opponentPlayers={
                  opponentPlayers ??
                  (customOpponentPlayId != null && !opponentHidden
                    ? editableOppPlayers
                    : opponentHidden
                      ? null
                      : vsSnapshot?.players ?? null)
                }
                opponentRoutes={
                  // Custom-opponent routes (defender movement the coach drew)
                  // always render so the user can SEE what they drew, regardless
                  // of the showOpponentRoutes ghost-toggle. Other route sources
                  // (picked preview / installed defense's offense ghost) stay
                  // gated by it.
                  customOpponentPlayId != null && !opponentHidden
                    ? editableOppRoutes
                    : showOpponentRoutes
                      ? (opponentPickedRoutes && opponentPickedRoutes.length > 0
                          ? opponentPickedRoutes
                          : isDefense && vsSnapshot
                            ? vsSnapshot.routes
                            : null)
                      : null
                }
                opponentEditable={
                  opponentPlayers == null &&
                  customOpponentPlayId != null &&
                  !opponentHidden &&
                  canEdit &&
                  !isExamplePreview
                }
                onOpponentPlayerMove={handleOpponentPlayerMove}
                selectedOpponentPlayerId={selectedOpponentPlayerId}
                onSelectOpponentPlayer={handleSelectOpponentPlayer}
                onCommitOpponentRoute={handleOpponentRouteCommit}
                onClearOpponentRoutes={handleClearOpponentRoutes}
                activeSide={activeSide}
                onActivateSide={setActiveSide}
                userTemplates={userTemplates}
              />
              <AnimationOverlay doc={animDoc} anim={anim} fieldAspect={fieldAspect} />
              {/* Tap-the-field-to-play gesture. Two audiences:
               *   1. Read-only viewers (shared, archived, examples) —
               *      flip through the animation with one finger.
               *   2. Editor-coaches on a touch device in VIEW mode — on
               *      phones/tablets editing is gated behind "Edit play",
               *      so until they opt in the whole field is a play
               *      button (the explicit playback card is hidden on
               *      touch; a thin reset/speed strip lives below the
               *      field instead).
               *  Tap toggles play → pause → resume, and replays once the
               *  play has finished — same single-button logic as the
               *  library overlay and the spacebar shortcut. pointer-
               *  events-auto overrides the wrapper's pointer-events-none;
               *  the rest of the canvas stays inert. Hidden once the
               *  coach enters edit mode (canEdit && mode==="edit") so
               *  taps reach the editing affordances underneath. */}
              {(!canEdit || (isTouchDevice && mode === "view")) && !libraryMode && (
                <button
                  type="button"
                  onClick={() => {
                    if (anim.phase === "motion" || anim.phase === "play") {
                      anim.togglePause();
                    } else if (anim.phase === "done") {
                      anim.reset();
                      // Reset is synchronous — kick the replay off on the
                      // same tap so the coach doesn't need a second one.
                      setTimeout(() => anim.step(), 0);
                    } else {
                      anim.step();
                    }
                  }}
                  aria-label="Play"
                  className="pointer-events-auto absolute inset-0 cursor-pointer bg-transparent"
                />
              )}
              {/* Library mode: minimal playback overlay anchored to the
                  bottom-right corner of the field. Single bar with
                  play/pause and a speed selector — the rest of the
                  editor chrome (toolbar, sidebar, opponent picker) is
                  hidden upstream. Tap-to-advance is also overlaid as a
                  full-field button BELOW this bar so coaches can step
                  through the play by tapping anywhere on grass, but the
                  explicit play button is the discoverable affordance.
                  z-30 keeps it above the AnimationOverlay. */}
              {libraryMode && (
                <>
                  {/* Library-mode static plays (formations, defenses)
                      have nothing to animate — no routes, no motion.
                      The play button + overlay would be dead UI.
                      Render them only when there's actually an
                      animation worth playing back. */}
                  {(doc.layers.routes.length > 0 || anim.hasMotion) && (
                    <>
                      <button
                        type="button"
                        onClick={anim.step}
                        aria-label="Advance play"
                        className="pointer-events-auto absolute inset-0 z-10 cursor-pointer bg-transparent"
                      />
                      <LibraryPlaybackBar anim={anim} />
                    </>
                  )}
                </>
              )}
            </div>

            {/* Touch view-mode: thin reset/speed strip immediately below
                the field. On touch the full PlayControlsPanel is hidden
                (it lived below the notes, off-screen on phones) — the
                field itself is the play/pause button, so this strip only
                needs the two controls a tap can't express: scrub-to-start
                and playback speed. Hidden in edit mode (nothing to play)
                and in library mode (floating overlay handles it). */}
            {isTouchDevice && mode === "view" && !libraryMode && (
              <TouchPlaybackStrip anim={anim} />
            )}

            {/* Mobile: notes card immediately below the field, in
                both view and edit modes. Desktop keeps its sidebar version
                further down — see the `hidden sm:block` block. The card is
                collapsible so coaches can scan a play without the notes
                consuming half the viewport. Library mode hides notes — the
                library page renders concept-level prose (description,
                when-to-use, common mistakes) in its own section, so the
                editor's coach-authored notes field would duplicate or
                conflict with editorial content. */}
            {!libraryMode && (
              <div className="sm:hidden">
                <PlayNotesCard
                  value={doc.metadata.notes ?? ""}
                  players={doc.layers.players}
                  routes={doc.layers.routes}
                  readOnly={!canEdit}
                  playName={doc.metadata.coachName}
                  onChange={(notes) =>
                    dispatch({ type: "document.setMetadata", patch: { notes } })
                  }
                />
              </div>
            )}

            {/* Route templates: surfaced directly under the field on small
                screens when a player is selected. Desktop keeps the copy in
                the sidebar Inspector where it already lives. Tapping a
                template replaces any existing routes on the player so the
                strip is a "pick my assignment" shortcut, not an additive
                stack. */}
            {canEdit && selectedPlayer && doc.metadata.playType !== "defense" && (
              <div className="rounded-xl border border-border bg-surface-raised p-3 sm:hidden">
                <QuickRoutes
                  player={selectedPlayer}
                  dispatch={dispatch}
                  activeStyle={{ stroke: activeColor, strokeWidth: activeWidth }}
                  existingRouteIds={doc.layers.routes
                    .filter((r) => r.carrierPlayerId === selectedPlayer.id)
                    .map((r) => r.id)}
                  userTemplates={userTemplates}
                />
              </div>
            )}

            {/* Mobile playback controls — only in view mode, and only on
                NON-touch narrow viewports (e.g. a resized desktop window).
                Touch devices use the tap-to-play field + the thin
                reset/speed strip above instead, so this full card is
                suppressed there. Desktop always uses the sidebar. Library
                mode uses the floating overlay on the field instead. */}
            {mode === "view" && !isExamplePreview && !libraryMode && !isTouchDevice && (
              <div className="rounded-xl border border-border bg-surface-raised p-4 sm:hidden">
                <PlayControlsPanel anim={anim} />
              </div>
            )}

            {/* Mobile opponent card — mirrors the desktop sidebar's opponent
                picker / vs-play card so coaches on phones can preview a
                defense against an offense play. View mode only. Hidden
                in library mode: library pages show the canonical
                concept, not a coach's vs-defense rehearsal — opponent
                preview belongs in the in-app editor. */}
            {mode === "view" && !isExamplePreview && opponentCardNode && !libraryMode && (
              <div className="flex flex-col gap-2 sm:hidden">
                {opponentCardNode}
                <div className="flex justify-center">
                  <CoachCalCTA
                    entryPoint="play_suggest_counter"
                    context={{ values: { playName: doc.metadata.coachName?.trim() || "this play" } }}
                  />
                </div>
              </div>
            )}

            {/* Mobile edit mode: field-size controls live below the
                playback/opponent stack since notes are now a persistent
                card directly under the field (see PlayNotesCard above). */}
            {canEdit && mode === "edit" && (
              <div className="sm:hidden">
                <FieldSizeControls
                  doc={doc}
                  dispatch={dispatch}
                  showFullFieldToggle={canExpandFieldWidth}
                  fullFieldWidth={fullFieldWidth}
                  onFullFieldWidthChange={setFullFieldWidthPersisted}
                  fieldStructure={fieldStructure}
                  playbookId={playbookId}
                  playbookSettings={playbookSettings}
                  onPlaybookSettingsChange={setPlaybookSettings}
                  playbookColor={playbookColor}
                />
              </div>
            )}

            {/* Desktop keeps the classic stacked layout. Mobile renders
                FieldSizeControls in the edit-only block above. */}
            {canEdit && (
              <div className="hidden sm:block">
                <FieldSizeControls
                  doc={doc}
                  dispatch={dispatch}
                  showFullFieldToggle={canExpandFieldWidth}
                  fullFieldWidth={fullFieldWidth}
                  onFullFieldWidthChange={setFullFieldWidthPersisted}
                  fieldStructure={fieldStructure}
                  playbookId={playbookId}
                  playbookSettings={playbookSettings}
                  onPlaybookSettingsChange={setPlaybookSettings}
                  playbookColor={playbookColor}
                />
              </div>
            )}
            {!libraryMode && (
              <div className="hidden sm:block">
                <PlayNotesCard
                  value={doc.metadata.notes ?? ""}
                  players={doc.layers.players}
                  routes={doc.layers.routes}
                  readOnly={!canEdit}
                  playName={doc.metadata.coachName}
                  onChange={(notes) =>
                    dispatch({ type: "document.setMetadata", patch: { notes } })
                  }
                />
              </div>
            )}
          </div>
          {/* Right-side sidebar: PlayControlsPanel (when nothing
              selected), TagsCard, opponent picker, results, Inspector.
              Library mode strips this entire column — coaches see just
              the field with the floating playback overlay. Opponent
              picker / results / inspector all assume a real playbookId
              and would 400/500 against the synthetic "library-preview"
              id used by library-mode renders. */}
          {!libraryMode && (
            <aside
              className={`${
                mode === "edit" ? "hidden sm:flex" : "hidden sm:flex"
              } min-h-0 flex-col gap-4 rounded-xl border border-border bg-surface-raised p-4`}
            >
              {/* Touch tablets get the tap-to-play field + thin reset/speed
                  strip below the field instead of this sidebar panel. */}
              {(!showToolbar || !canEdit) && !isTouchDevice && <PlayControlsPanel anim={anim} />}
              {canEdit && showToolbar && selectedPlayerId != null && (
                <TagsCard doc={doc} dispatch={dispatch} linkedFormation={linkedFormation} />
              )}
              {canEdit && !showToolbar && (
                <TagsCard doc={doc} dispatch={dispatch} linkedFormation={linkedFormation} />
              )}
              {opponentCardNode && (
                <div className="flex flex-col gap-2">
                  {opponentCardNode}
                  <div className="flex justify-center">
                    <CoachCalCTA
                      entryPoint="play_suggest_counter"
                      context={{ values: { playName: doc.metadata.coachName?.trim() || "this play" } }}
                    />
                  </div>
                </div>
              )}
              {!showToolbar && !isDefense && (
                <PlayResultsCard
                  playbookId={playbookId}
                  playId={playId}
                  canUseGameMode={canUseGameMode}
                />
              )}
              {canEdit && (
                <Inspector
                  doc={doc}
                  dispatch={dispatch}
                  selectedPlayerId={selectedPlayerId}
                  selectedRouteId={selectedRouteId}
                  selectedSegmentId={selectedSegmentId}
                  activeStyle={{ stroke: activeColor, strokeWidth: activeWidth }}
                  userTemplates={userTemplates}
                />
              )}
            </aside>
          )}
      </div>

      <MovePlayToGroupDialog
        target={moveTarget}
        groups={initialNav.length > 0
          ? // Build a unique, sort-ordered group list from the nav rows we
            // already received. Each row has group_id + group_name when the
            // play belongs to a group; aggregate into the canonical list
            // without an extra fetch.
            Array.from(
              initialNav
                .filter((p) => p.group_id && p.group_name)
                .reduce((acc, p) => {
                  if (p.group_id && !acc.has(p.group_id)) {
                    acc.set(p.group_id, {
                      id: p.group_id,
                      name: p.group_name as string,
                      sort_order: p.group_sort_order ?? 0,
                    });
                  }
                  return acc;
                }, new Map<string, { id: string; name: string; sort_order: number }>())
                .values(),
            ).sort((a, b) => a.sort_order - b.sort_order)
          : []}
        onClose={() => setMoveTarget(null)}
        onMoved={() => {
          // Refresh server data so the next list_plays / nav reflects the
          // new group_id, and the editor's surrounding chrome updates.
          router.refresh();
          toast("Play moved.", "success");
        }}
        onError={(message) => toast(message, "error")}
      />

      {copyTarget && (
        <CopyToPlaybookDialog
          open={!!copyTarget}
          onClose={() => setCopyTarget(null)}
          currentPlaybookId={playbookId}
          target={copyTarget}
          toast={toast}
          onPlayCapHit={(serverError) => {
            // The server message embeds the admin-configured cap (e.g. "16
            // plays per playbook"). Pull the number out so the modal
            // headline matches whatever the site is currently set to,
            // falling back to a generic title if the format ever changes.
            const m = /capped at (\d+) plays/i.exec(serverError);
            const cap = m ? m[1] : null;
            setUpgradeNotice({
              title: cap
                ? `Free tier is capped at ${cap} plays per playbook`
                : "You've hit the free-tier play cap",
              // On native (iOS/Android) we must not surface price or an
              // upgrade steer — Apple Guideline 3.1.1 forbids pointing users
              // at an external purchase flow. Web keeps the full upsell.
              message: isNativeApp()
                ? "Copying plays isn’t available on your current plan."
                : "Upgrade to Team Coach ($9/mo or $99/yr) to copy this play and add unlimited plays per playbook.",
            });
          }}
          onCopied={(result) => {
            if (result.playId) router.push(`/plays/${result.playId}/edit`);
          }}
        />
      )}

      <UpgradeModal
        open={!!upgradeNotice}
        onClose={() => setUpgradeNotice(null)}
        title={upgradeNotice?.title ?? ""}
        message={upgradeNotice?.message ?? ""}
      />

      <GameModeUpgradeDialog
        open={gameModeUpgradeOpen}
        onClose={() => setGameModeUpgradeOpen(false)}
      />

      <GameModeLockedDialog
        open={gameLock != null}
        playbookId={gameLock?.playbookId ?? playbookId}
        callerName={gameLock?.callerName ?? null}
        onClose={() => setGameLock(null)}
      />

      {/* Mobile-only footer. Same shape as PlaybookBottomNav. Tabs that
          aren't Cal navigate the page (no overlays) — Plays goes back
          to the playbook's plays tab; Cal slides up over the page.
          Library mode skips it: the "Plays" tab links into the
          synthetic library-preview playbook (which 404s), and library
          pages have their own header navigation. */}
      {!libraryMode && (
        <EditorBottomNav
          playbookId={playbookId}
          showCoachCal={coachAiAvailable || showCoachCalPromo}
          available={{
            calendar: teamCalendarAvailable,
            games: gameResultsAvailable,
            practicePlans: practicePlansAvailable,
            messages: teamMessagingAvailable,
          }}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

/** Library-mode playback overlay. Anchored to the bottom-right corner
 *  of the field-viewport (which is `position: relative`). Renders the
 *  play/pause/replay button, an always-visible reset, and a speed
 *  selector. The full-field tap-to-step button sits underneath, so
 *  coaches can advance the play by tapping anywhere on grass; this bar
 *  is the discoverable click-target.
 *
 *  Reset is always visible (per coach feedback): mid-play scrubbing —
 *  pause, rewind, replay — is the most common debugging pattern, and
 *  hiding reset until the play has fully run meant coaches had to wait
 *  the full animation through before they could go back to frame 0.
 *
 *  Kept inline here (not lifted into PlayControlsPanel) because the
 *  visual treatment is intentionally different — PlayControlsPanel is
 *  a stacked vertical panel that lives in a sidebar; this is a
 *  compact horizontal pill that floats on the field. Mixing the two
 *  shapes inside one component would mean either prop bloat or split
 *  CSS conditions on every line. */
function LibraryPlaybackBar({ anim }: { anim: PlayAnimation }) {
  const { phase, paused, togglePause, step, reset, speed, setSpeed } = anim;
  const isRunning = phase === "motion" || phase === "play";
  const showPause = isRunning && !paused;
  // Reset is dead UI before any frame has advanced — disable rather
  // than hide so the layout stays stable (no horizontal pop when the
  // play starts running). The reset itself is purely synchronous.
  const canReset = phase !== "idle";
  const SPEED_OPTIONS: Array<{ value: number; label: string }> = [
    { value: 0.5, label: "0.5×" },
    { value: 1, label: "1×" },
    { value: 1.5, label: "1.5×" },
    { value: 2, label: "2×" },
  ];
  return (
    <div
      // pointer-events-auto so clicks land here even though the
      // wrapping field-viewport blocks pointer events for view-only
      // renders. z-30 keeps the bar above the AnimationOverlay and
      // the full-field tap-to-step button (z-10).
      className="pointer-events-auto absolute bottom-3 right-3 z-30 flex items-center gap-1.5 rounded-full bg-black/70 px-2 py-1.5 text-white shadow-lg backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={() => {
          // Idle → start the play (or motion, if any). Running → toggle
          // pause. Done → reset and replay. The single button covers
          // all three states so we don't need a separate "replay"
          // affordance.
          if (phase === "idle" || phase === "motion-done") step();
          else if (phase === "done") {
            reset();
            // Reset is sync — kick off immediately so the coach
            // doesn't need a second tap to start the replay.
            setTimeout(() => step(), 0);
          } else togglePause();
        }}
        className="inline-flex size-7 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
        aria-label={showPause ? "Pause" : phase === "done" ? "Replay" : "Play"}
        title={showPause ? "Pause" : phase === "done" ? "Replay" : "Play"}
      >
        {showPause ? (
          <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : phase === "done" ? (
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <path d="M21 3v6h-6" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={reset}
        disabled={!canReset}
        className="inline-flex size-7 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Reset to start"
        title="Reset to start"
      >
        {/* Rewind-to-start glyph — left arrow + bar — chosen over a
            circular-arrow reload icon because reset here means "scrub
            back to frame 0," not "reload the page." Coaches reading
            this read it the same way they read the leftmost button on
            a video player. */}
        <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
          <rect x="5" y="6" width="2" height="12" rx="0.5" />
          <path d="M19 5v14L9 12z" />
        </svg>
      </button>
      <div className="flex items-center rounded-full bg-white/10 p-0.5 text-[10px] font-semibold">
        {SPEED_OPTIONS.map((s) => {
          const active = Math.abs(speed - s.value) < 0.01;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setSpeed(s.value)}
              className={`rounded-full px-2 py-0.5 transition-colors ${
                active ? "bg-white text-black" : "text-white/70 hover:text-white"
              }`}
              aria-pressed={active}
              aria-label={`Speed ${s.label}`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Thin inline playback strip shown directly below the field on touch
 * devices in view mode. The field itself is the play/pause button (see the
 * tap-to-play overlay), so this strip carries only the two controls a tap
 * can't express: reset-to-start and speed. Kept deliberately short so it
 * never pushes the field off-screen the way the full PlayControlsPanel did.
 */
function TouchPlaybackStrip({ anim }: { anim: PlayAnimation }) {
  const { phase, reset, speed, setSpeed } = anim;
  // Reset is dead UI before any frame has advanced — disable rather than
  // hide so the strip's width doesn't pop when the play starts.
  const canReset = phase !== "idle";
  const SPEED_OPTIONS: Array<{ value: number; label: string }> = [
    { value: 0.5, label: "0.5×" },
    { value: 1, label: "1×" },
    { value: 1.5, label: "1.5×" },
    { value: 2, label: "2×" },
  ];
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-1.5">
      <button
        type="button"
        onClick={reset}
        disabled={!canReset}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface-inset hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Reset to start"
      >
        <RotateCcw className="size-4" />
        Reset
      </button>
      <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface-inset p-0.5">
        {SPEED_OPTIONS.map((s) => {
          const active = Math.abs(speed - s.value) < 0.01;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setSpeed(s.value)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                active
                  ? "bg-primary text-white"
                  : "text-muted hover:text-foreground"
              }`}
              aria-pressed={active}
              aria-label={`Speed ${s.label}`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlayNotesCard({
  value,
  players,
  routes,
  onChange,
  readOnly = false,
  playName,
}: {
  value: string;
  players: Player[];
  routes?: Route[];
  onChange: (next: string) => void;
  readOnly?: boolean;
  /** Used by the "Generate notes with Coach Cal" CTA prompt. Falls back
   *  to a placeholder if the play hasn't been named yet. */
  playName?: string | null;
}) {
  const [open, setOpen] = useState(value.trim().length > 0);
  // Edit / view toggle — coaches see the rendered markdown by default
  // (bold, lists, headings, @-mention chips). Click "Edit" to drop into
  // the raw-markdown editor; "Done" swaps back to the rendered view.
  // Empty notes auto-open in edit mode so the field doesn't render as a
  // blank card with no obvious affordance.
  const [editing, setEditing] = useState(!readOnly && value.trim().length === 0);
  const [copied, setCopied] = useState(false);
  const hasNotes = value.trim().length > 0;

  // Tutorial integration. The "Write play notes" step uses `find`
  // links that fire `tutorial:request-open` events; respond by
  // forcing the card open so the coach can see the editor without
  // having to expand it themselves. Also flip into edit mode so the
  // textarea is immediately interactive.
  useEffect(() => {
    function onRequestOpen(e: Event) {
      const detail = (e as CustomEvent).detail as { target?: string } | undefined;
      if (detail?.target !== "play-notes") return;
      setOpen(true);
      if (!readOnly) setEditing(true);
    }
    window.addEventListener("tutorial:request-open", onRequestOpen);
    return () => window.removeEventListener("tutorial:request-open", onRequestOpen);
  }, [readOnly]);

  // Tutorial action notifies for the "Write play notes" step. Parse
  // the notes value for @-mentions and dispatch the matching action
  // kind so the step's reactive checkboxes flip when the coach
  // actually types a color- or letter-style reference.
  //
  // Detection is intentionally simple — a fixed list of known color
  // names vs. anything else (letter / label). The Set in the engine
  // dedupes so multiple fires per render are harmless.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!value) return;
    const colorNames = new Set([
      "white", "black", "gray", "grey",
      "red", "orange", "yellow", "green", "blue", "purple", "pink",
      "gold", "navy", "teal", "cyan", "magenta",
    ]);
    const re = /@([A-Za-z0-9]{1,10})/g;
    let m: RegExpExecArray | null;
    let sawColor = false;
    let sawLetter = false;
    while ((m = re.exec(value)) !== null) {
      const token = m[1];
      if (colorNames.has(token.toLowerCase())) sawColor = true;
      else sawLetter = true;
    }
    if (sawColor) notifyTutorialAction("note-color-ref");
    if (sawLetter) notifyTutorialAction("note-letter-ref");
  }, [value]);
  async function handleCopy() {
    const ok = await copyNotesToClipboard(value);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  // Read-only viewers with no notes at all have nothing to show — collapse
  // the card entirely so the sidebar stays uncluttered.
  if (readOnly && !hasNotes) return null;
  return (
    <div data-tutor="play-notes" className="rounded-xl border border-border bg-surface-raised">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
          )}
          <span className="text-sm font-semibold text-foreground">Notes</span>
          {!open && hasNotes && (
            <span className="truncate text-xs text-muted">
              {value.trim().slice(0, 80)}
              {value.trim().length > 80 ? "…" : ""}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {open && hasNotes && (
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs font-medium text-primary hover:underline"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          )}
          {!readOnly && open && (
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {editing ? "Done" : "Edit"}
            </button>
          )}
          {!readOnly && (
            <CoachCalCTA
              entryPoint="play_notes_regenerate"
              context={{ values: { playName: playName?.trim() || "this play" } }}
            />
          )}
        </div>
      </div>
      {open && (
        <div className="border-t border-border px-4 py-3">
          {readOnly || !editing ? (
            <NotesMarkdown value={value} players={players} />
          ) : (
            <PlayerMentionEditor
              value={value}
              onChange={onChange}
              players={players}
              routes={routes}
              placeholder={'Type notes for players here. Try "@F", "@Q", or "@yellow" to link notes to a player. Markdown like **bold**, *italic*, and "- bullet" formats when you tap Done.'}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ExamplePreviewEditorBanner() {
  return (
    <div
      data-demo-banner=""
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm"
    >
      <div className="inline-flex items-center gap-2 text-foreground">
        <FlaskConical className="size-4 text-primary" />
        <span>
          <span className="font-semibold">Demo mode.</span> You can edit
          this play freely — nothing here will be saved.
        </span>
      </div>
      <Link
        href="/home"
        className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
      >
        Create your own playbook
      </Link>
    </div>
  );
}

function ArchivedPlayEditorBanner({
  canUnarchive,
  onUnarchive,
}: {
  canUnarchive: boolean;
  onUnarchive: () => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
      <ArchiveIcon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <strong>This play is archived.</strong>{" "}
        {canUnarchive
          ? "Editing is disabled — restore it to make changes."
          : "Editing is disabled. Ask the playbook owner to restore it."}
      </span>
      {canUnarchive && (
        <button
          type="button"
          onClick={onUnarchive}
          className="shrink-0 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-950 ring-1 ring-amber-300 transition-colors hover:bg-amber-200"
        >
          Restore play
        </button>
      )}
    </div>
  );
}

function TutorialPlayBanner({
  playId,
  playbookId,
}: {
  playId: string;
  playbookId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const handleKeep = () => {
    startTransition(async () => {
      const { keepTutorialPlayAction } = await import("@/app/actions/tutorials");
      const res = await keepTutorialPlayAction(playId);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast("Play kept in your playbook.", "success");
      router.refresh();
    });
  };

  const handleDiscard = () => {
    startTransition(async () => {
      const { discardTutorialPlayAction } = await import("@/app/actions/tutorials");
      const res = await discardTutorialPlayAction(playId);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      router.push(`/playbooks/${playbookId}`);
    });
  };

  return (
    <div className="mb-2 flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center">
        <GraduationCap className="mt-0.5 size-4 shrink-0 text-primary sm:mt-0" />
        <span className="min-w-0 text-foreground">
          <strong>Tutorial play.</strong>{" "}
          This is practice space. Keep it to save in your playbook, or
          discard when you&apos;re done.
        </span>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={handleDiscard}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-inset hover:text-foreground disabled:opacity-60"
        >
          Discard
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={handleKeep}
          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-60"
        >
          Keep play
        </button>
      </div>
    </div>
  );
}
