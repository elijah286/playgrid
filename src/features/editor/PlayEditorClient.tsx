"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  FlipHorizontal,
  Copy,
  Share2,
  Save,
  Smartphone,
  FileDown,
  UserPlus,
  BookmarkPlus,
} from "lucide-react";
import type { PlayDocument, Player, Point2, SegmentShape, StrokePattern } from "@/domain/play/types";
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
import { PrintPreview } from "@/features/print/PrintPreview";
import { exportSvgToPdf } from "@/features/print/exportPdf";
import { compilePlayToSvg } from "@/domain/print/templates";
import { RouteAnimation } from "@/features/viewer/RouteAnimation";
import { Button, IconButton, Input, SegmentedControl, Kbd, useToast } from "@/components/ui";
import { Tooltip } from "@/components/ui/Tooltip";
import { uid } from "@/domain/play/factory";

type Props = {
  playId: string;
  playbookId: string;
  initialDocument: PlayDocument;
};

export function PlayEditorClient({ playId, playbookId, initialDocument }: Props) {
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

  const [tab, setTab] = useState<"routes" | "formation" | "print">("routes");
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
  const displayShape = selectedSeg?.shape ?? activeShape;
  const displayStroke = selectedSeg?.strokePattern ?? activeStrokePattern;
  const displayColor = selectedRoute?.style.stroke ?? activeColor;
  const displayWidth = selectedRoute?.style.strokeWidth ?? activeWidth;

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

  const exportPdf = useCallback(() => {
    const compiled = compilePlayToSvg(doc, "full_sheet");
    startTransition(async () => {
      await exportSvgToPdf(compiled.svgMarkup, `play-${doc.metadata.wristbandCode}.pdf`);
      toast("PDF exported", "success");
    });
  }, [doc, toast]);

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
      if (selectedSegmentId && selectedRouteId) {
        dispatch({ type: "route.setSegmentStroke", routeId: selectedRouteId, segmentId: selectedSegmentId, strokePattern });
      } else if (selectedRouteId && selectedRoute) {
        for (const s of selectedRoute.segments) {
          dispatch({ type: "route.setSegmentStroke", routeId: selectedRouteId, segmentId: s.id, strokePattern });
        }
      }
    },
    [dispatch, selectedRouteId, selectedSegmentId, selectedRoute],
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
          <IconButton icon={Copy} tooltip="Duplicate play" onClick={duplicate} />
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

      {/* Tab bar */}
      <div className="flex items-center gap-3">
        <SegmentedControl
          options={[
            { value: "routes" as const, label: "Routes" },
            { value: "formation" as const, label: "Formation" },
            { value: "print" as const, label: "Print preview" },
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

      {/* Routes tab */}
      {tab === "routes" && (
        <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[1fr_320px]">
          <div className="flex min-h-[420px] flex-col gap-3">
            {showToolbar && (
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
              />
            )}

            <div className="relative min-h-[360px] flex-1">
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
                fieldAspect={doc.sportProfile.fieldWidthYds / doc.sportProfile.fieldLengthYds}
                fieldBackground={doc.fieldBackground}
              />
              <div className="pointer-events-none absolute bottom-3 right-3 opacity-40">
                <RouteAnimation doc={doc} />
              </div>
            </div>

            {/* Field size controls (below canvas) */}
            <FieldSizeControls profile={doc.sportProfile} dispatch={dispatch} />
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

            <div className="relative min-h-[360px] flex-1">
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
                fieldAspect={doc.sportProfile.fieldWidthYds / doc.sportProfile.fieldLengthYds}
                fieldBackground={doc.fieldBackground}
              />
            </div>

            <FieldSizeControls profile={doc.sportProfile} dispatch={dispatch} />
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

      {tab === "print" && (
        <div className="space-y-4">
          <PrintPreview doc={doc} dispatch={dispatch} />
          <Button variant="primary" leftIcon={FileDown} onClick={exportPdf}>
            Export PDF
          </Button>
        </div>
      )}
    </div>
  );
}
