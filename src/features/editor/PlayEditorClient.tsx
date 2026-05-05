"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive as ArchiveIcon, ChevronLeft, FlaskConical } from "lucide-react";
import type { EndDecoration, PlayDocument, Player, Point2, Route, SegmentShape, StrokePattern, VsPlaySnapshot } from "@/domain/play/types";
import type { SavedFormation } from "@/app/actions/formations";
import { saveFormationAction } from "@/app/actions/formations";
import { resolveEndDecoration, mkZone, zoneStyleFromColor } from "@/domain/play/factory";
import { fieldAspectFor, NARROW_FIELD_ASPECT } from "@/domain/play/render-config";
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
} from "@/app/actions/plays";
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
import { ShareButton } from "@/components/share/ShareButton";
import { CopyToPlaybookDialog, type CopyTarget } from "@/features/playbooks/CopyToPlaybookDialog";
import {
  MovePlayToGroupDialog,
  type MovePlayToGroupTarget,
} from "@/features/playbooks/MovePlayToGroupDialog";
import { TagsCard } from "./TagsCard";
import { CoachCalCTA } from "@/features/coach-ai/CoachCalCTA";
import { publishLivePlayDoc, clearLivePlayDoc } from "@/lib/coach-ai/live-play-doc";
import { useToast } from "@/components/ui";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { GameModeUpgradeDialog } from "@/features/game-mode/GameModeUpgradeDialog";
import {
  GameModeLockedDialog,
  isGameModeLocked,
} from "@/features/game-mode/GameModeLockedDialog";
import { usePlayAnimation } from "@/features/animation/usePlayAnimation";
import { AnimationOverlay } from "@/features/animation/AnimationOverlay";
import { PlayControlsPanel } from "@/features/animation/PlayControlsPanel";
import { OpponentOverlayCard } from "./OpponentOverlayCard";
import { PlayResultsCard } from "./PlayResultsCard";
import { QuickRoutes } from "./QuickRoutes";
import { VsPlayCard } from "./VsPlayCard";
import { PlayerMentionEditor } from "./PlayerMentionEditor";
import { NotesMarkdown } from "./NotesMarkdown";
import type { PlaybookSettings } from "@/domain/playbook/settings";
import {
  ExamplePreviewProvider,
  useExamplePreview,
} from "@/features/admin/ExamplePreviewContext";

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
  playbookName?: string | null;
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
  /** ID of the hidden custom-opponent play attached to this play, if any.
   *  When present, the opposing-side players in `vs_play_snapshot` are
   *  drag-editable (they back this hidden play). */
  initialCustomOpponentPlayId?: string | null;
  /** When true, the user "cleared" the opponent overlay: the custom data is
   *  preserved but the snapshot is hidden in the canvas. */
  initialOpponentHidden?: boolean;
};

export function PlayEditorClient(props: Props) {
  return (
    <ExamplePreviewProvider
      isPreview={props.isExamplePreview ?? false}
      isArchived={props.isArchived ?? false}
      isPlayArchived={props.isPlayArchived ?? false}
      playbookId={props.playbookId}
      playId={props.playId}
      canUnarchive={Boolean(props.canEdit) && !props.isExamplePreview}
    >
      <PlayEditorClientInner {...props} />
    </ExamplePreviewProvider>
  );
}

function PlayEditorClientInner({
  playId,
  playbookId,
  playbookName,
  initialDocument,
  initialNav,
  initialGroups,
  linkedFormation,
  opponentFormation,
  allFormations = [],
  opponentFormations,
  playbookSettings,
  canEdit: roleCanEdit = true,
  isExamplePreview = false,
  isArchived = false,
  isPlayArchived = false,
  mobileEditingEnabled = false,
  gameModeAvailable = false,
  canUseGameMode = false,
  initialCustomOpponentPlayId = null,
  initialOpponentHidden = false,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const { blockIfPreview } = useExamplePreview();
  const { doc, dispatch, undo, redo, replaceDocument, canUndo, canRedo } = usePlayEditor(initialDocument);

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
  useEffect(() => {
    publishLivePlayDoc(playId, doc);
    return () => clearLivePlayDoc(playId);
  }, [playId, doc]);
  useEffect(() => {
    if (initialDocument === lastSyncedDocRef.current) return;
    // Active local edits — never replace. Even if `initialDocument` is
    // semantically what we just sent, swapping it in would wipe the undo
    // stack (replaceDocument calls createUndoState which clears past/future).
    if (isDirtyRef.current) {
      lastSyncedDocRef.current = initialDocument;
      return;
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
  useEffect(() => {
    function onMutated() {
      router.refresh();
    }
    window.addEventListener("coach-ai-mutated", onMutated);
    return () => window.removeEventListener("coach-ai-mutated", onMutated);
  }, [router]);

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

  // Merge snapshot players/routes into the doc we hand to the animation so
  // playback runs both sides on the same clock. The snapshot is read-only;
  // the editable `doc` still only contains the defensive side.
  const animDoc = useMemo<PlayDocument>(() => {
    if (!vsSnapshot) return doc;
    return {
      ...doc,
      layers: {
        ...doc.layers,
        players: [...doc.layers.players, ...vsSnapshot.players],
        routes: [...doc.layers.routes, ...vsSnapshot.routes],
      },
    };
  }, [doc, vsSnapshot]);
  const anim = usePlayAnimation(animDoc);
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
  // editor — so they all stay in lockstep).
  const naturalAspect = fieldAspectFor(doc);
  const fieldAspect = fullFieldWidth
    ? naturalAspect
    : Math.min(naturalAspect, NARROW_FIELD_ASPECT);
  const canExpandFieldWidth = naturalAspect > NARROW_FIELD_ASPECT + 1e-3;

  // Stable set: changes only on phase transitions (not every RAF frame), so
  // EditorCanvas doesn't receive a new prop reference 60× per second and
  // re-rasterize its SVG text with shimmering subpixel alignment.
  const animatingPlayerIds = useMemo(() => {
    if (anim.phase === "idle") return null;
    return new Set(anim.flats.map((f) => f.carrierPlayerId));
  }, [anim.phase, anim.flats]);

  // Selection state
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
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

  const oppSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (oppSaveTimerRef.current) clearTimeout(oppSaveTimerRef.current);
  }, []);
  const handleOpponentPlayerMove = useCallback(
    (playerId: string, position: Point2) => {
      setEditableOppPlayers((prev) => {
        if (!prev) return prev;
        return prev.map((p) =>
          p.id === playerId ? { ...p, position } : p,
        );
      });
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
          // (animation, vs-play card) see the up-to-date positions.
          dispatch({
            type: "document.setMetadata",
            patch: { vsPlaySnapshot: res.snapshot },
          });
        })();
      }, 350);
    },
    [playId, dispatch, toast],
  );

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

  /* ---------- Auto-save ---------- */
  const [isSaving, setIsSaving] = useState(false);
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

  const runSave = useCallback(async () => {
    if (!canSaveRef.current) return;
    if (!isDirtyRef.current) return;
    setIsSaving(true);
    // Capture the exact doc reference we're about to send. After the save
    // resolves, we compare against the latest local reference to detect
    // whether the user kept editing while the save was in flight.
    const sentDoc = docRef.current;
    const res = await savePlayVersionAction(playId, sentDoc);
    if (isGameModeLocked(res)) {
      setGameLock({
        playbookId: res.gameLock.playbookId,
        callerName: res.gameLock.callerName,
      });
    } else if (res.ok) {
      // Only declare clean if local hasn't moved past what we sent.
      if (docRef.current === sentDoc) {
        isDirtyRef.current = false;
      }
      router.refresh();
    } else {
      toast(res.error, "error");
    }
    setIsSaving(false);
  }, [playId, router, toast]);

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
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      if (isDirtyRef.current && canSaveRef.current) {
        void savePlayVersionAction(playId, docRef.current);
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

  // Show toolbar when a player, route, or zone is selected
  const showToolbar =
    selectedPlayerId != null || selectedRouteId != null || selectedZoneId != null;
  const selectedZone = (doc.layers.zones ?? []).find((z) => z.id === selectedZoneId) ?? null;

  const selectedRoute = doc.layers.routes.find((r) => r.id === selectedRouteId);
  const selectedSeg = selectedRoute?.segments.find((s) => s.id === selectedSegmentId);
  const selectedPlayer = doc.layers.players.find((p) => p.id === selectedPlayerId);

  // Toolbar display values: reflect current selection if one exists, else active defaults
  // If a segment's stored shape is "zigzag" (legacy — the shape option has been
  // removed in favour of the motion stroke pattern), fall back to "straight"
  // so the SegmentedControl has a valid selection.
  const rawShape = selectedSeg?.shape ?? activeShape;
  const displayShape: SegmentShape = rawShape === "zigzag" ? "straight" : rawShape;
  const displayStroke = selectedSeg?.strokePattern ?? activeStrokePattern;
  const displayColor =
    selectedRoute?.style.stroke ??
    (selectedPlayer && !selectedRouteId ? selectedPlayer.style.fill : activeColor);
  const displayWidth = selectedRoute?.style.strokeWidth ?? activeWidth;
  const displayEndDecoration = selectedRoute ? resolveEndDecoration(selectedRoute) : "arrow";

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

  const newPlay = useCallback(async () => {
    if (
      blockIfPreview(
        "Creating a play in an example playbook isn't persisted. Start your own playbook to save plays.",
      )
    ) {
      return;
    }
    const res = await createPlayAction(playbookId, {
      variant: doc.sportProfile.variant,
      playerCount: playbookSettings?.maxPlayers,
    });
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    router.push(`/plays/${res.playId}/edit`);
  }, [blockIfPreview, playbookId, doc.sportProfile.variant, playbookSettings?.maxPlayers, router, toast]);

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
      }
    },
    [dispatch, selectedRouteId, selectedSegmentId, selectedRoute],
  );

  const handleStrokeChange = useCallback(
    (strokePattern: StrokePattern) => {
      setActiveStrokePattern(strokePattern);
      if (!selectedRouteId || !selectedRoute) return;

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
    },
    [dispatch, selectedRouteId, selectedSegmentId, selectedRoute],
  );

  const handleEndDecorationChange = useCallback(
    (endDecoration: EndDecoration) => {
      if (!selectedRouteId) return;
      dispatch({ type: "route.setEndDecoration", routeId: selectedRouteId, endDecoration });
    },
    [dispatch, selectedRouteId],
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
      } else if (selectedRouteId && selectedRoute) {
        dispatch({
          type: "route.setStyle",
          routeId: selectedRouteId,
          style: { ...selectedRoute.style, stroke: color },
        });
      } else if (selectedPlayer) {
        dispatch({
          type: "player.setStyle",
          playerId: selectedPlayer.id,
          style: { ...selectedPlayer.style, fill: color },
        });
      }
    },
    [dispatch, selectedRouteId, selectedRoute, selectedPlayer, selectedZone],
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
      }
    },
    [dispatch, selectedRouteId, selectedRoute],
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
  }, []);

  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedPlayerId == null && selectedRouteId == null && selectedZoneId == null) return;
    function onDocPointer(e: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (root.contains(target)) return;
      handleDone();
      setSelectedZoneId(null);
    }
    document.addEventListener("pointerdown", onDocPointer, true);
    return () => document.removeEventListener("pointerdown", onDocPointer, true);
  }, [selectedPlayerId, selectedRouteId, selectedZoneId, handleDone]);

  /* ---------- Hide site header on mobile when editing ---------- */

  useEffect(() => {
    if (mode !== "edit") return;
    document.body.classList.add("editor-hide-site-header");
    return () => {
      document.body.classList.remove("editor-hide-site-header");
    };
  }, [mode]);

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

  return (
    <div ref={rootRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-2">
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
      {isPlayArchived && (
        <ArchivedPlayEditorBanner
          canUnarchive={roleCanEdit && !isExamplePreview}
          onUnarchive={() => void archive(false)}
        />
      )}
      {/* Hide the full header bar on mobile while actively editing — the
          Done editing button moves to the very top so the field has as much
          vertical room as possible. Desktop always keeps the header. */}
      <div className={isTouchDevice && mode === "edit" ? "hidden sm:block" : ""}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <Link
          href={`/playbooks/${playbookId}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-3.5" />
          <span className="truncate">{playbookName || "Back to playbook"}</span>
        </Link>
        {/* Mobile-only: SiteHeaderShell is hidden by editor-hide-site-header
            on mobile play edit, so the global Share button isn't reachable
            from here. Surface it inline. Desktop already has it in the
            global nav above. */}
        <span className="sm:hidden">
          <ShareButton userId={null} variant="inline" />
        </span>
      </div>
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
        hideMobileNav={isTouchDevice && mode === "edit"}
        mode={isTouchDevice ? mode : undefined}
        onToggleMode={isTouchDevice ? toggleMode : undefined}
      />
      </div>

      {playbookSettings &&
        doc.layers.players.length > playbookSettings.maxPlayers && (
          <p className="-mt-1 text-xs font-medium text-danger">
            {doc.layers.players.length} players on the field — this playbook
            allows only {playbookSettings.maxPlayers}.
          </p>
        )}

      {/* Routes */}
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-[260px] min-w-0 flex-col gap-3 sm:min-h-[420px]">
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
              </div>
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
                hasSelectedRoute={selectedRouteId != null}
                hasSelectedPlayer={selectedPlayerId != null}
                isHotRoute={
                  doc.layers.players.find((p) => p.id === selectedPlayerId)?.isHotRoute ?? false
                }
                onToggleHotRoute={() => {
                  if (!selectedPlayerId) return;
                  const p = doc.layers.players.find((pl) => pl.id === selectedPlayerId);
                  if (!p) return;
                  dispatch({
                    type: "player.setHotRoute",
                    playerId: p.id,
                    isHotRoute: !p.isHotRoute,
                  });
                }}
                playerRouteCount={
                  selectedPlayerId
                    ? doc.layers.routes.filter((r) => r.carrierPlayerId === selectedPlayerId).length
                    : 0
                }
                onClearPlayerRoutes={() => {
                  if (!selectedPlayerId) return;
                  const playerRoutes = doc.layers.routes.filter(
                    (r) => r.carrierPlayerId === selectedPlayerId,
                  );
                  for (const r of playerRoutes) {
                    dispatch({ type: "route.remove", routeId: r.id });
                  }
                }}
                isDefense={doc.metadata.playType === "defense"}
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
              className={`field-viewport relative mx-auto w-full overflow-hidden bg-surface-inset sticky z-10 sm:relative sm:top-auto sm:z-auto ${
                // In edit mode the global site header is hidden (see
                // `editor-hide-site-header` effect), so the field can pin
                // flush at top: 0. In view mode the site header stays
                // sticky on mobile, so the field tucks in just below it.
                mode === "edit" ? "top-0" : "top-[var(--site-header-height,61px)]"
              } ${
                !canEdit || (isTouchDevice && mode === "view")
                  ? "pointer-events-none select-none"
                  : ""
              }`}
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
                  showOpponentRoutes
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
                activeSide={activeSide}
                onActivateSide={setActiveSide}
              />
              <AnimationOverlay doc={animDoc} anim={anim} fieldAspect={fieldAspect} />
            </div>

            {/* Mobile: notes card immediately below the (sticky) field, in
                both view and edit modes. Desktop keeps its sidebar version
                further down — see the `hidden sm:block` block. The card is
                collapsible so coaches can scan a play without the notes
                consuming half the viewport. */}
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
                />
              </div>
            )}

            {/* Mobile playback controls — only in view mode. The Edit toggle
                moved above the field so this section now just surfaces
                play/animate controls. Desktop always uses the sidebar. */}
            {mode === "view" && !isExamplePreview && (
              <div className="rounded-xl border border-border bg-surface-raised p-4 sm:hidden">
                <PlayControlsPanel anim={anim} />
              </div>
            )}

            {/* Mobile opponent card — mirrors the desktop sidebar's opponent
                picker / vs-play card so coaches on phones can preview a
                defense against an offense play. View mode only. */}
            {mode === "view" && !isExamplePreview && opponentCardNode && (
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
                <FieldSizeControls doc={doc} dispatch={dispatch} showFullFieldToggle={canExpandFieldWidth} fullFieldWidth={fullFieldWidth} onFullFieldWidthChange={setFullFieldWidthPersisted} />
              </div>
            )}

            {/* Desktop keeps the classic stacked layout. Mobile renders
                FieldSizeControls in the edit-only block above. */}
            {canEdit && (
              <div className="hidden sm:block">
                <FieldSizeControls doc={doc} dispatch={dispatch} showFullFieldToggle={canExpandFieldWidth} fullFieldWidth={fullFieldWidth} onFullFieldWidthChange={setFullFieldWidthPersisted} />
              </div>
            )}
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
          </div>
          <aside
            className={`${
              mode === "edit" ? "hidden sm:flex" : "hidden sm:flex"
            } min-h-0 flex-col gap-4 rounded-xl border border-border bg-surface-raised p-4`}
          >
            {(!showToolbar || !canEdit) && <PlayControlsPanel anim={anim} />}
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
              />
            )}
          </aside>
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
              message:
                "Upgrade to Team Coach ($9/mo or $99/yr) to copy this play and add unlimited plays per playbook.",
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
  const [open, setOpen] = useState(value.length > 0);
  // Edit / view toggle — coaches see the rendered markdown by default
  // (bold, lists, headings, @-mention chips). Click "Edit" to drop into
  // the raw-markdown editor; "Done" swaps back to the rendered view.
  // Empty notes auto-open in edit mode so the field doesn't render as a
  // blank card with no obvious affordance.
  const [editing, setEditing] = useState(!readOnly && value.trim().length === 0);
  // Read-only viewers with no notes at all have nothing to show — collapse
  // the card entirely so the sidebar stays uncluttered.
  if (readOnly && !value.trim()) return null;
  return (
    <div className="rounded-xl border border-border bg-surface-raised">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="text-sm font-semibold text-foreground">Play notes</span>
          {!open && value.trim() && (
            <span className="truncate text-xs text-muted">
              {value.trim().slice(0, 80)}
              {value.trim().length > 80 ? "…" : ""}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-2">
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
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-muted hover:text-foreground"
          >
            {open ? "Hide" : "Show"}
          </button>
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
