"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EndDecoration, PlayDocument, Player, SegmentShape, StrokePattern, VsPlaySnapshot } from "@/domain/play/types";
import type { SavedFormation } from "@/app/actions/formations";
import { saveFormationAction } from "@/app/actions/formations";
import { resolveEndDecoration, mkZone } from "@/domain/play/factory";
import {
  duplicatePlayAction,
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
import { useToast, Modal, Button } from "@/components/ui";
import { usePlayAnimation } from "@/features/animation/usePlayAnimation";
import { AnimationOverlay } from "@/features/animation/AnimationOverlay";
import { PlayControlsPanel } from "@/features/animation/PlayControlsPanel";
import { OpponentOverlayCard } from "./OpponentOverlayCard";
import { VsPlayCard } from "./VsPlayCard";
import { PlayerMentionEditor } from "./PlayerMentionEditor";
import type { PlaybookSettings } from "@/domain/playbook/settings";

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
};

export function PlayEditorClient({
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
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const { doc, dispatch, undo, redo, canUndo, canRedo } = usePlayEditor(initialDocument);

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
  const fieldAspect =
    doc.sportProfile.fieldWidthYds / (doc.sportProfile.fieldLengthYds * 0.75);

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

  const [isNavPending, startNavTransition] = useTransition();
  const [, startTransition] = useTransition();

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
    if (isFirstDocRender.current) {
      isFirstDocRender.current = false;
      return;
    }
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
  }, [doc]);

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
      const res = await saveFormationAction(
        name,
        doc.layers.players,
        doc.sportProfile,
        typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4,
        "offense",
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
    [doc, dispatch, router, toast],
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

  const [duplicatePrompt, setDuplicatePrompt] = useState(false);

  const runDuplicate = useCallback(
    (clearNotes: boolean) => {
      setDuplicatePrompt(false);
      startTransition(async () => {
        const res = await duplicatePlayAction(playId, { clearNotes });
        if (!res.ok) toast(res.error, "error");
        else {
          toast("Play duplicated", "success");
          router.push(`/plays/${res.playId}/edit`);
        }
      });
    },
    [playId, router, toast],
  );

  const duplicate = useCallback(() => {
    if ((doc.metadata.notes ?? "").trim()) {
      setDuplicatePrompt(true);
    } else {
      runDuplicate(false);
    }
  }, [doc.metadata.notes, runDuplicate]);

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
    <div className="relative flex min-h-0 flex-1 flex-col gap-3">
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
        linkedFormation={linkedFormation}
        opponentFormation={opponentFormation ?? null}
        allFormations={allFormations}
      />

      {playbookSettings &&
        doc.layers.players.length > playbookSettings.maxPlayers && (
          <p className="-mt-1 text-xs font-medium text-danger">
            {doc.layers.players.length} players on the field — this playbook
            allows only {playbookSettings.maxPlayers}.
          </p>
        )}

      {/* Routes */}
      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[1fr_320px]">
          <div className="flex min-h-[420px] flex-col gap-3">
            {/* The route toolbar is ALWAYS rendered — even with nothing
                selected — so the canvas never shifts when a player or
                route is selected. When no selection exists, the buttons
                still configure the "active" defaults used by the next
                route drawn, so the toolbar is never dead UI. Opacity
                signals that the selection-specific actions (Done, Smooth)
                don't apply yet. */}
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
                onDone={handleDone}
                endDecoration={displayEndDecoration}
                onEndDecorationChange={handleEndDecorationChange}
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
                totalRouteCount={doc.layers.routes.length}
                onClearAllRoutes={() => {
                  if (doc.layers.routes.length === 0) return;
                  if (
                    !window.confirm(
                      `Clear all ${doc.layers.routes.length} route${
                        doc.layers.routes.length !== 1 ? "s" : ""
                      } from this play?`,
                    )
                  )
                    return;
                  for (const r of doc.layers.routes) {
                    dispatch({ type: "route.remove", routeId: r.id });
                  }
                }}
              />
            </div>

            <div
              className="relative w-full overflow-hidden"
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
                activeShape={activeShape}
                activeStrokePattern={activeStrokePattern}
                activeColor={activeColor}
                activeWidth={activeWidth}
                fieldAspect={fieldAspect}
                fieldBackground={doc.fieldBackground}
                hideRoutesAndPlayers={anim.phase !== "idle"}
                opponentFormation={opponentFormation ?? null}
                opponentPlayers={opponentPlayers ?? vsSnapshot?.players ?? null}
              />
              <AnimationOverlay doc={animDoc} anim={anim} fieldAspect={fieldAspect} />
            </div>

            {/* Mobile view-mode controls: play/animate + Edit toggle. Shown
                only on mobile when the user hasn't switched to edit mode.
                Desktop always renders the full editor instead. */}
            {mode === "view" && (
              <div className="flex flex-col gap-3 sm:hidden">
                <div className="rounded-xl border border-border bg-surface-raised p-4">
                  <PlayControlsPanel anim={anim} />
                </div>
                <button
                  type="button"
                  onClick={() => setMode("edit")}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised text-sm font-semibold text-foreground hover:bg-surface"
                >
                  Edit play
                </button>
              </div>
            )}
            {mode === "edit" && (
              <button
                type="button"
                onClick={() => setMode("view")}
                className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg border border-border bg-surface-raised px-3 text-xs font-semibold text-muted hover:text-foreground sm:hidden"
              >
                Done editing
              </button>
            )}

            {/* Field size controls (below canvas) */}
            <div className={mode === "edit" ? "" : "hidden sm:block"}>
              <FieldSizeControls doc={doc} dispatch={dispatch} />
            </div>

            {/* Play notes */}
            <div className={mode === "edit" ? "" : "hidden sm:block"}>
              <PlayNotesCard
                value={doc.metadata.notes ?? ""}
                players={doc.layers.players}
                onChange={(notes) =>
                  dispatch({ type: "document.setMetadata", patch: { notes } })
                }
              />
            </div>
          </div>
          <aside
            className={`${
              mode === "edit" ? "flex" : "hidden sm:flex"
            } min-h-0 flex-col gap-4 rounded-xl border border-border bg-surface-raised p-4`}
          >
            {!showToolbar && <PlayControlsPanel anim={anim} />}
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
                playType={doc.metadata.playType ?? "offense"}
                nav={initialNav}
                allFormations={opponentFormations ?? allFormations}
                hasSelection={opponentPlayers != null}
                onChange={setOpponentPlayers}
                onInstallVsPlay={
                  isDefense
                    ? async (offId: string) => {
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
            <Inspector
              doc={doc}
              dispatch={dispatch}
              selectedPlayerId={selectedPlayerId}
              selectedRouteId={selectedRouteId}
              selectedSegmentId={selectedSegmentId}
              activeStyle={{ stroke: activeColor, strokeWidth: activeWidth }}
              linkedFormation={linkedFormation}
            />
          </aside>
      </div>

      <Modal
        open={duplicatePrompt}
        onClose={() => setDuplicatePrompt(false)}
        title="Duplicate play"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDuplicatePrompt(false)}>
              Cancel
            </Button>
            <Button variant="ghost" onClick={() => runDuplicate(true)}>
              Clear notes
            </Button>
            <Button onClick={() => runDuplicate(false)}>Keep notes</Button>
          </>
        }
      >
        <p className="text-sm text-foreground">
          This play has notes. Do you want to keep them on the duplicate, or start fresh?
        </p>
        <p className="mt-2 text-xs text-muted">
          The notes on the original play will not be modified either way.
        </p>
      </Modal>
    </div>
  );
}

function PlayNotesCard({
  value,
  players,
  onChange,
}: {
  value: string;
  players: Player[];
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(value.length > 0);
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
          <PlayerMentionEditor
            value={value}
            onChange={onChange}
            players={players}
            placeholder={'Type notes for players here. Try typing "@F" or "@Q" to link notes to specific players.'}
          />
        </div>
      )}
    </div>
  );
}
