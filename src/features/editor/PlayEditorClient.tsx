"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  FlipHorizontal,
  Share2,
  Save,
  Smartphone,
  UserPlus,
  BookmarkPlus,
} from "lucide-react";
import type { EndDecoration, PlayDocument, Player, Point2, SegmentShape, StrokePattern } from "@/domain/play/types";
import { resolveEndDecoration } from "@/domain/play/factory";
import {
  duplicatePlayAction,
  savePlayVersionAction,
} from "@/app/actions/plays";
import { saveFormationAction } from "@/app/actions/formations";
import { createShareLinkForPlayAction } from "@/app/actions/share";
import { usePlayEditor } from "./usePlayEditor";
import { EditorCanvas } from "./EditorCanvas";
import { RouteToolbar } from "./RouteToolbar";
import { FieldSizeControls } from "./FieldSizeControls";
import { Inspector } from "./Inspector";
import { FormationInspector } from "./FormationInspector";
import type {
  PlaybookGroupRow,
  PlaybookPlayNavItem,
} from "@/domain/print/playbookPrint";
import { EditorPlayContextBar } from "./EditorPlayContextBar";
import { Button, IconButton, Input, SegmentedControl, Kbd, useToast } from "@/components/ui";
import { Tooltip } from "@/components/ui/Tooltip";
import { uid } from "@/domain/play/factory";

type Props = {
  playId: string;
  playbookId: string;
  initialDocument: PlayDocument;
  initialNav: PlaybookPlayNavItem[];
  initialGroups: PlaybookGroupRow[];
};

export function PlayEditorClient({
  playId,
  playbookId,
  initialDocument,
  initialNav,
  initialGroups,
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

  const [tab, setTab] = useState<"routes" | "formation">("routes");
  const [pending, startTransition] = useTransition();

  // Formation mode state
  const [showSaveFormation, setShowSaveFormation] = useState(false);
  const [formationName, setFormationName] = useState("");
  const [savingFormation, startSavingFormation] = useTransition();

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

  const save = useCallback(() => {
    startTransition(async () => {
      const res = await savePlayVersionAction(playId, doc);
      if (!res.ok) toast(res.error, "error");
      else {
        toast("Saved", "success");
        router.refresh();
      }
    });
  }, [doc, playId, router, toast]);

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

  /* ---------- Formation mode handlers ---------- */

  const handleAddPlayer = useCallback(
    (position: Point2) => {
      const newPlayer: Player = {
        id: uid("player"),
        role: "WR",
        label: "?",
        position,
        eligible: true,
        style: { fill: "#FFFFFF", stroke: "#1C1C1E", labelColor: "#1C1C1E" },
      };
      dispatch({ type: "player.add", player: newPlayer });
      setSelectedPlayerId(newPlayer.id);
    },
    [dispatch],
  );

  const handleSaveFormation = useCallback(() => {
    const name = formationName.trim();
    if (!name) {
      toast("Enter a formation name", "error");
      return;
    }
    startSavingFormation(async () => {
      const res = await saveFormationAction(name, doc.layers.players, doc.sportProfile);
      if (!res.ok) {
        toast(res.error, "error");
      } else {
        toast("Formation saved", "success");
        setShowSaveFormation(false);
        setFormationName("");
      }
    });
  }, [formationName, doc.layers.players, doc.sportProfile, toast]);

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

      // "Motion" is a whole-route concept: only the first segment from the
      // player gets the zig-zag motion mark; everything else becomes solid.
      if (strokePattern === "motion") {
        if (selectedRoute.segments.length === 0) return;
        const [first, ...rest] = selectedRoute.segments;
        dispatch({
          type: "route.setSegmentStroke",
          routeId: selectedRouteId,
          segmentId: first.id,
          strokePattern: "motion",
        });
        for (const s of rest) {
          if (s.strokePattern === "motion") {
            dispatch({
              type: "route.setSegmentStroke",
              routeId: selectedRouteId,
              segmentId: s.id,
              strokePattern: "solid",
            });
          }
        }
        return;
      }

      if (selectedSegmentId) {
        dispatch({ type: "route.setSegmentStroke", routeId: selectedRouteId, segmentId: selectedSegmentId, strokePattern });
      } else {
        for (const s of selectedRoute.segments) {
          dispatch({ type: "route.setSegmentStroke", routeId: selectedRouteId, segmentId: s.id, strokePattern });
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

      if (mod && e.key === "s") {
        e.preventDefault();
        save();
        return;
      }
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
          dispatch({ type: "route.removeNode", routeId: selectedRouteId, nodeId: selectedNodeId });
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
  }, [save, undo, redo, selectedRouteId, selectedNodeId, dispatch]);

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
            {(["green","white","black","gray"] as const).map((bg) => {
              const colors = { green:"#2D8B4E", white:"#F8FAFC", black:"#0A0A0A", gray:"#374151" };
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

          <div className="mx-1 h-6 w-px bg-border" />

          <Tooltip content={<span className="flex items-center gap-2">Save <Kbd keys="Ctrl+S" /></span>}>
            <Button variant="primary" size="sm" leftIcon={Save} loading={pending} onClick={save}>
              Save
            </Button>
          </Tooltip>
        </div>
      </header>

      {/* Tab bar + play context */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <SegmentedControl
            options={[
              { value: "routes" as const, label: "Routes" },
              { value: "formation" as const, label: "Formation" },
            ]}
            value={tab}
            onChange={setTab}
          />
          <Link href={`/m/play/${playId}?playbookId=${playbookId}`} className="ml-auto">
            <Button variant="ghost" size="sm" leftIcon={Smartphone}>
              Mobile view
            </Button>
          </Link>
        </div>
        <EditorPlayContextBar
          playId={playId}
          playbookId={playbookId}
          doc={doc}
          dispatch={dispatch}
          initialNav={initialNav}
          initialGroups={initialGroups}
          onDuplicate={duplicate}
        />
      </div>

      {/* Routes tab */}
      {tab === "routes" && (
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
                onDone={handleDone}
                endDecoration={displayEndDecoration}
                onEndDecorationChange={handleEndDecorationChange}
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
            <FieldSizeControls profile={doc.sportProfile} dispatch={dispatch} doc={doc} />
          </div>
          <aside className="rounded-xl border border-border bg-surface-raised p-4">
            <Inspector
              doc={doc}
              dispatch={dispatch}
              selectedPlayerId={selectedPlayerId}
              selectedRouteId={selectedRouteId}
              selectedSegmentId={selectedSegmentId}
              activeStyle={{ stroke: activeColor, strokeWidth: activeWidth }}
            />
          </aside>
        </div>
      )}

      {/* Formation tab */}
      {tab === "formation" && (
        <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[1fr_320px]">
          <div className="flex min-h-[420px] flex-col gap-3">
            {/* Formation toolbar row */}
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Formation
              </span>
              <Button
                size="sm"
                variant="ghost"
                leftIcon={UserPlus}
                onClick={() => {
                  // Center of field
                  handleAddPlayer({ x: 0.5, y: 0.5 });
                }}
              >
                Add player
              </Button>
              <div className="ml-auto" />
              <Button
                size="sm"
                variant="primary"
                leftIcon={BookmarkPlus}
                onClick={() => setShowSaveFormation(true)}
              >
                Save formation
              </Button>
            </div>

            {/* Save formation panel */}
            {showSaveFormation && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-surface-raised px-3 py-2">
                <Input
                  placeholder="Formation name…"
                  value={formationName}
                  onChange={(e) => setFormationName(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  variant="primary"
                  loading={savingFormation}
                  onClick={handleSaveFormation}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowSaveFormation(false);
                    setFormationName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}

            <div
              className="relative w-full overflow-hidden"
              style={{ aspectRatio: `${doc.sportProfile.fieldWidthYds / (doc.sportProfile.fieldLengthYds * 0.75)} / 1` }}
            >
              <EditorCanvas
                doc={doc}
                dispatch={dispatch}
                mode="formation"
                selectedPlayerId={selectedPlayerId}
                selectedRouteId={null}
                selectedNodeId={null}
                selectedSegmentId={null}
                onSelectPlayer={setSelectedPlayerId}
                onSelectRoute={() => {}}
                onSelectNode={() => {}}
                onSelectSegment={() => {}}
                onAddPlayer={handleAddPlayer}
                activeShape={activeShape}
                activeStrokePattern={activeStrokePattern}
                activeColor={activeColor}
                activeWidth={activeWidth}
                fieldAspect={doc.sportProfile.fieldWidthYds / (doc.sportProfile.fieldLengthYds * 0.75)}
                fieldBackground={doc.fieldBackground}
              />
            </div>

            <FieldSizeControls profile={doc.sportProfile} dispatch={dispatch} doc={doc} />
          </div>
          <aside className="rounded-xl border border-border bg-surface-raised p-4">
            <FormationInspector
              doc={doc}
              dispatch={dispatch}
              selectedPlayerId={selectedPlayerId}
              onSelectPlayer={setSelectedPlayerId}
            />
          </aside>
        </div>
      )}

    </div>
  );
}
