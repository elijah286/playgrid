"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import type { EndDecoration, PlayDocument, Player, SegmentShape, StrokePattern, VsPlaySnapshot } from "@/domain/play/types";
import type { SavedFormation } from "@/app/actions/formations";
import { saveFormationAction } from "@/app/actions/formations";
import { resolveEndDecoration, mkZone } from "@/domain/play/factory";
import {
  installDefenseVsPlayAction,
  savePlayVersionAction,
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
import { CopyToPlaybookDialog, type CopyTarget } from "@/features/playbooks/CopyToPlaybookDialog";
import { TagsCard } from "./TagsCard";
import { useToast } from "@/components/ui";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { GameModeUpgradeDialog } from "@/features/game-mode/GameModeUpgradeDialog";
import { usePlayAnimation } from "@/features/animation/usePlayAnimation";
import { AnimationOverlay } from "@/features/animation/AnimationOverlay";
import { PlayControlsPanel } from "@/features/animation/PlayControlsPanel";
import { OpponentOverlayCard } from "./OpponentOverlayCard";
import { QuickRoutes } from "./QuickRoutes";
import { VsPlayCard } from "./VsPlayCard";
import { PlayerMentionEditor } from "./PlayerMentionEditor";
import type { PlaybookSettings } from "@/domain/playbook/settings";
import {
  ExamplePreviewProvider,
  useExamplePreview,
} from "@/features/admin/ExamplePreviewContext";

type Props = {
  playId: string;
  playbookId: string;
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
};

export function PlayEditorClient(props: Props) {
  return (
    <ExamplePreviewProvider
      isPreview={props.isExamplePreview ?? false}
      isArchived={props.isArchived ?? false}
      playbookId={props.playbookId}
      canUnarchive={Boolean(props.canEdit) && !props.isExamplePreview}
    >
      <PlayEditorClientInner {...props} />
    </ExamplePreviewProvider>
  );
}

function PlayEditorClientInner({
  playId,
  playbookId,
  initialDocument,
  initialNav,
  initialGroups,
  linkedFormation,
  opponentFormation,
  allFormations = [],
  opponentFormations,
  playbookSettings,
  canEdit = true,
  isExamplePreview = false,
  isArchived = false,
  mobileEditingEnabled = false,
  gameModeAvailable = false,
  canUseGameMode = false,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const { blockIfPreview } = useExamplePreview();
  const { doc, dispatch, undo, redo, canUndo, canRedo } = usePlayEditor(initialDocument);

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
  const VIEWPORT_LENGTH_YDS = 25;
  const fieldAspect =
    doc.sportProfile.fieldWidthYds / (VIEWPORT_LENGTH_YDS * 0.75);

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

  // Transient opponent overlay (never saved, resets on navigation)
  const [opponentPlayers, setOpponentPlayers] = useState<Player[] | null>(null);

  // Active drawing style (defaults for new routes)
  const [activeShape, setActiveShape] = useState<SegmentShape>("straight");
  const [activeStrokePattern, setActiveStrokePattern] = useState<StrokePattern>("solid");
  const [activeColor, setActiveColor] = useState("#FFFFFF");
  const [activeWidth, setActiveWidth] = useState(2.5);

  // Explicit "draw route" gesture gate. Off by default so taps/drags on the
  // canvas never silently create routes — the user must opt in via the pill.
  // Resets whenever the player selection clears so the gate doesn't linger
  // across unrelated edits.
  // Mobile edit mode: the bottom area toggles between the field-size
  // controls and the notes editor so the two compact surfaces never fight
  // for the same limited vertical space. Desktop shows both side-by-side.
  const [notesOpen, setNotesOpen] = useState(false);

  const [isNavPending, startNavTransition] = useTransition();
  const [upgradeNotice, setUpgradeNotice] = useState<{ title: string; message: string } | null>(null);

  // Mobile defaults to view-only so a coach can just watch the play on a
  // phone without tripping over edit controls. Desktop always renders the
  // full editor regardless of this state (see `editOnlyCls` below).
  const [mode, setMode] = useState<"view" | "edit">("view");
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 640px)").matches) {
      setMode("edit");
    }
  }, []);

  /* ---------- Auto-save ---------- */
  const [isSaving, setIsSaving] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstDocRender = useRef(true);

  useEffect(() => {
    if (!canEdit) return;
    if (isFirstDocRender.current) {
      isFirstDocRender.current = false;
      return;
    }
    if (isExamplePreview) return;
    if (isArchived) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      setIsSaving(true);
      const res = await savePlayVersionAction(playId, doc);
      if (res.ok) {
        router.refresh();
      } else {
        toast(res.error, "error");
      }
      setIsSaving(false);
    }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, canEdit, isExamplePreview, isArchived]);

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
      {/* Hide the full header bar on mobile while actively editing — the
          Done editing button moves to the very top so the field has as much
          vertical room as possible. Desktop always keeps the header. */}
      <div className={mode === "edit" ? "hidden sm:block" : ""}>
      <EditorHeaderBar
        playId={playId}
        playbookId={playbookId}
        doc={doc}
        dispatch={dispatch}
        initialNav={initialNav}
        initialGroups={initialGroups}
        onDuplicate={duplicate}
        onNavigateToPlay={navigateToPlay}
        onSaveAsNewFormation={saveAsNewFormation}
        allFormations={allFormations}
        canEdit={canEdit}
        hideMobileNav={mode === "edit"}
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
            {/* Mobile-only Edit/Done toggle. Sits directly above the field
                (and above the edit toolbar) so coaches can flip between
                viewing and editing without hunting through the UI. Desktop
                doesn't need this because it always renders in edit mode. */}
            {canEdit && (mobileEditingEnabled || gameModeAvailable) && (
              <div className="flex w-full gap-2 sm:hidden">
                {mobileEditingEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = mode === "edit" ? "view" : "edit";
                      if (next === "view") {
                        setSelectedPlayerId(null);
                        setSelectedRouteId(null);
                        setSelectedNodeId(null);
                        setSelectedSegmentId(null);
                        setSelectedZoneId(null);
                      }
                      setMode(next);
                    }}
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
                mode === "edit" ? "" : "hidden sm:block"
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
                onAddRectZone={() =>
                  dispatch({ type: "zone.add", zone: mkZone("rectangle", "") })
                }
                onAddEllipseZone={() =>
                  dispatch({ type: "zone.add", zone: mkZone("ellipse", "") })
                }
              />
            </div>
            )}

            <div
              className={`field-viewport relative mx-auto w-full overflow-hidden ${
                !canEdit || mode === "view"
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
                activeShape={activeShape}
                activeStrokePattern={activeStrokePattern}
                onActiveStrokePatternChange={setActiveStrokePattern}
                activeColor={activeColor}
                activeWidth={activeWidth}
                fieldAspect={fieldAspect}
                fieldBackground={doc.fieldBackground}
                animatingPlayerIds={animatingPlayerIds}
                opponentFormation={opponentFormation ?? null}
                opponentPlayers={opponentPlayers ?? vsSnapshot?.players ?? null}
              />
              <AnimationOverlay doc={animDoc} anim={anim} fieldAspect={fieldAspect} />
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
            {mode === "view" && (
              <div className="rounded-xl border border-border bg-surface-raised p-4 sm:hidden">
                <PlayControlsPanel anim={anim} />
              </div>
            )}

            {/* Mobile edit mode: swap field-size controls ⇄ notes editor.
                Desktop renders both stacked. */}
            {canEdit && mode === "edit" && !notesOpen && (
              <div className="flex flex-col gap-2 sm:hidden">
                <FieldSizeControls doc={doc} dispatch={dispatch} />
                <button
                  type="button"
                  onClick={() => setNotesOpen(true)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised text-sm font-medium text-foreground hover:bg-surface"
                >
                  {(doc.metadata.notes ?? "").trim() ? "Edit notes" : "Add notes"}
                </button>
              </div>
            )}

            {canEdit && mode === "edit" && notesOpen && (
              <div className="flex flex-col gap-2 sm:hidden">
                <div className="rounded-xl border border-border bg-surface-raised p-3">
                  <PlayerMentionEditor
                    value={doc.metadata.notes ?? ""}
                    onChange={(notes) =>
                      dispatch({
                        type: "document.setMetadata",
                        patch: { notes },
                      })
                    }
                    players={doc.layers.players}
                    placeholder={'Type notes here. Use "@F" or "@Q" to link to a player.'}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setNotesOpen(false)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-primary bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Done with notes
                </button>
              </div>
            )}

            {/* Desktop keeps the classic stacked layout with both cards
                always visible. Mobile uses the toggle above. */}
            {canEdit && (
              <div className="hidden sm:block">
                <FieldSizeControls doc={doc} dispatch={dispatch} />
              </div>
            )}
            <div className="hidden sm:block">
              <PlayNotesCard
                value={doc.metadata.notes ?? ""}
                players={doc.layers.players}
                readOnly={!canEdit}
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
            {!showToolbar && isDefense && vsSnapshot ? (
              <VsPlayCard
                playId={playId}
                snapshot={vsSnapshot}
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
            ) : !showToolbar ? (
              <OpponentOverlayCard
                currentPlayId={playId}
                currentPlaybookId={playbookId}
                playType={doc.metadata.playType ?? "offense"}
                nav={initialNav}
                allFormations={opponentFormations ?? allFormations}
                hasSelection={opponentPlayers != null}
                onChange={setOpponentPlayers}
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
                        const res = await installDefenseVsPlayAction(
                          playId,
                          offId,
                        );
                        if (!res.ok) {
                          toast(res.error, "error");
                          return;
                        }
                        router.push(`/plays/${res.playId}/edit`);
                      }
                    : undefined
                }
              />
            ) : null}
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

      {copyTarget && (
        <CopyToPlaybookDialog
          open={!!copyTarget}
          onClose={() => setCopyTarget(null)}
          currentPlaybookId={playbookId}
          target={copyTarget}
          toast={toast}
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

    </div>
  );
}

function PlayNotesCard({
  value,
  players,
  onChange,
  readOnly = false,
}: {
  value: string;
  players: Player[];
  onChange: (next: string) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(value.length > 0);
  // Read-only viewers with no notes at all have nothing to show — collapse
  // the card entirely so the sidebar stays uncluttered.
  if (readOnly && !value.trim()) return null;
  return (
    <div className="mt-3 rounded-xl border border-border bg-surface-raised">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Play notes</span>
          {!open && value.trim() && (
            <span className="truncate text-xs text-muted">
              {value.trim().slice(0, 80)}
              {value.trim().length > 80 ? "…" : ""}
            </span>
          )}
        </div>
        <span className="text-xs text-muted">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3">
          {readOnly ? (
            <p className="whitespace-pre-wrap text-sm text-foreground">{value}</p>
          ) : (
            <PlayerMentionEditor
              value={value}
              onChange={onChange}
              players={players}
              placeholder={'Type notes for players here. Try typing "@F" or "@Q" to link notes to specific players.'}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ExamplePreviewEditorBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
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
