"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  FlipHorizontal,
  Share2,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import type { EndDecoration, PlayDocument, SegmentShape, StrokePattern } from "@/domain/play/types";
import type { SavedFormation } from "@/app/actions/formations";
import { resolveEndDecoration } from "@/domain/play/factory";
import {
  duplicatePlayAction,
  savePlayVersionAction,
} from "@/app/actions/plays";
import { createShareLinkForPlayAction } from "@/app/actions/share";
import { usePlayEditor } from "./usePlayEditor";
import { EditorCanvas } from "./EditorCanvas";
import { RouteToolbar } from "./RouteToolbar";
import { FieldSizeControls } from "./FieldSizeControls";
import { Inspector } from "./Inspector";
import type {
  PlaybookGroupRow,
  PlaybookPlayNavItem,
} from "@/domain/print/playbookPrint";
import { EditorPlayContextBar } from "./EditorPlayContextBar";
import { IconButton, Kbd, useToast } from "@/components/ui";
import { Tooltip } from "@/components/ui/Tooltip";

type Props = {
  playId: string;
  playbookId: string;
  initialDocument: PlayDocument;
  initialNav: PlaybookPlayNavItem[];
  initialGroups: PlaybookGroupRow[];
  linkedFormation?: SavedFormation | null;
};

export function PlayEditorClient({
  playId,
  playbookId,
  initialDocument,
  initialNav,
  initialGroups,
  linkedFormation,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const { doc, dispatch, undo, redo, canUndo, canRedo } = usePlayEditor(initialDocument);

  // Selection state
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // Active drawing style (defaults for new routes)
  const [activeShape, setActiveShape] = useState<SegmentShape>("straight");
  const [activeStrokePattern, setActiveStrokePattern] = useState<StrokePattern>("solid");
  const [activeColor, setActiveColor] = useState("#FFFFFF");
  const [activeWidth, setActiveWidth] = useState(2.5);

  const [, startTransition] = useTransition();

  /* ---------- Auto-save ---------- */
  type SaveStatus = "idle" | "saving" | "saved";
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstDocRender = useRef(true);

  useEffect(() => {
    // Skip the initial population of the document (nothing has changed yet).
    if (isFirstDocRender.current) {
      isFirstDocRender.current = false;
      return;
    }
    // Debounce: reset the timer on every doc change, fire 1.5 s after the last one.
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      setSaveStatus("saving");
      const res = await savePlayVersionAction(playId, doc);
      if (res.ok) {
        setSaveStatus("saved");
        router.refresh();
        setTimeout(() => setSaveStatus("idle"), 2500);
      } else {
        toast(res.error, "error");
        setSaveStatus("idle");
      }
    }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Warn before unload if a save is in flight
  useEffect(() => {
    if (saveStatus === "idle") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveStatus]);

  // Show toolbar when a player OR route is selected
  const showToolbar = selectedPlayerId != null || selectedRouteId != null;

  const selectedRoute = doc.layers.routes.find((r) => r.id === selectedRouteId);
  const selectedSeg = selectedRoute?.segments.find((s) => s.id === selectedSegmentId);

  // Toolbar display values: reflect current selection if one exists, else active defaults
  // If a segment's stored shape is "zigzag" (legacy — the shape option has been
  // removed in favour of the motion stroke pattern), fall back to "straight"
  // so the SegmentedControl has a valid selection.
  const rawShape = selectedSeg?.shape ?? activeShape;
  const displayShape: SegmentShape = rawShape === "zigzag" ? "straight" : rawShape;
  const displayStroke = selectedSeg?.strokePattern ?? activeStrokePattern;
  const displayColor = selectedRoute?.style.stroke ?? activeColor;
  const displayWidth = selectedRoute?.style.strokeWidth ?? activeWidth;
  const displayEndDecoration = selectedRoute ? resolveEndDecoration(selectedRoute) : "arrow";

  const duplicate = useCallback(() => {
    startTransition(async () => {
      const res = await duplicatePlayAction(playId);
      if (!res.ok) toast(res.error, "error");
      else {
        toast("Play duplicated", "success");
        router.push(`/plays/${res.playId}/edit`);
      }
    });
  }, [playId, router, toast]);

  const share = useCallback(() => {
    startTransition(async () => {
      const res = await createShareLinkForPlayAction(playId);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      const url = `${window.location.origin}/v/${res.token}`;
      await navigator.clipboard.writeText(url);
      toast("Share link copied to clipboard", "success");
    });
  }, [playId, toast]);

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
      if (selectedRouteId && selectedRoute) {
        dispatch({
          type: "route.setStyle",
          routeId: selectedRouteId,
          style: { ...selectedRoute.style, stroke: color },
        });
      }
    },
    [dispatch, selectedRouteId, selectedRoute],
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
      const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;

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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Header toolbar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link href={`/playbooks/${playbookId}`}>
            <IconButton icon={ArrowLeft} tooltip="Back to playbook" />
          </Link>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Play editor
            </p>
            <h1 className="truncate text-base font-bold text-foreground">
              {doc.metadata.coachName || "Untitled play"}
            </h1>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1 rounded-lg bg-surface-inset p-1">
            <Tooltip content={<span className="flex items-center gap-2">Undo <Kbd keys="Ctrl+Z" /></span>}>
              <IconButton icon={Undo2} variant="ghost" disabled={!canUndo} onClick={undo} />
            </Tooltip>
            <Tooltip content={<span className="flex items-center gap-2">Redo <Kbd keys="Ctrl+Shift+Z" /></span>}>
              <IconButton icon={Redo2} variant="ghost" disabled={!canRedo} onClick={redo} />
            </Tooltip>
          </div>

          <div className="mx-1 h-6 w-px bg-border" />

          <IconButton
            icon={FlipHorizontal}
            tooltip="Flip horizontal"
            onClick={() => dispatch({ type: "document.flip", axis: "horizontal" })}
          />
          <IconButton icon={Share2} tooltip="Copy share link" onClick={share} />

          {/* Field background */}
          <div className="flex items-center gap-1 rounded-lg bg-surface-inset p-1">
            {(["green","white","black"] as const).map((bg) => {
              const colors = { green:"#2D8B4E", white:"#FFFFFF", black:"#0A0A0A" };
              const active = (doc.fieldBackground ?? "green") === bg;
              return (
                <button
                  key={bg}
                  type="button"
                  title={bg.charAt(0).toUpperCase() + bg.slice(1)}
                  onClick={() => dispatch({ type: "document.setFieldBackground", background: bg })}
                  className={`size-6 rounded-md border-2 transition-all ${active ? "border-primary scale-110" : "border-transparent hover:scale-105"}`}
                  style={{ backgroundColor: colors[bg] }}
                />
              );
            })}
          </div>

          {/* Auto-save status indicator */}
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" />
              Saving…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <CheckCircle2 className="size-3.5 text-success" />
              Saved
            </span>
          )}
        </div>
      </header>

      {/* Play context */}
      <EditorPlayContextBar
        playId={playId}
        playbookId={playbookId}
        doc={doc}
        dispatch={dispatch}
        initialNav={initialNav}
        initialGroups={initialGroups}
        onDuplicate={duplicate}
      />

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
              className={
                showToolbar
                  ? ""
                  : "opacity-60 [&_button]:cursor-default"
              }
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
              />
            </div>

            <div
              className="relative w-full overflow-hidden"
              style={{ aspectRatio: `${doc.sportProfile.fieldWidthYds / (doc.sportProfile.fieldLengthYds * 0.75)} / 1` }}
            >
              <EditorCanvas
                doc={doc}
                dispatch={dispatch}
                selectedPlayerId={selectedPlayerId}
                selectedRouteId={selectedRouteId}
                selectedNodeId={selectedNodeId}
                selectedSegmentId={selectedSegmentId}
                onSelectPlayer={setSelectedPlayerId}
                onSelectRoute={setSelectedRouteId}
                onSelectNode={setSelectedNodeId}
                onSelectSegment={setSelectedSegmentId}
                activeShape={activeShape}
                activeStrokePattern={activeStrokePattern}
                activeColor={activeColor}
                activeWidth={activeWidth}
                fieldAspect={doc.sportProfile.fieldWidthYds / (doc.sportProfile.fieldLengthYds * 0.75)}
                fieldBackground={doc.fieldBackground}
              />
            </div>

            {/* Field size controls (below canvas) */}
            <FieldSizeControls doc={doc} dispatch={dispatch} />

            {/* Play notes */}
            <PlayNotesCard
              value={doc.metadata.notes ?? ""}
              onChange={(notes) =>
                dispatch({ type: "document.setMetadata", patch: { notes } })
              }
            />
          </div>
          <aside className="rounded-xl border border-border bg-surface-raised p-4">
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

    </div>
  );
}

function PlayNotesCard({
  value,
  onChange,
}: {
  value: string;
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
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Explain how to read this play — progressions, keys, coaching points…"
            className="min-h-[120px] w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
