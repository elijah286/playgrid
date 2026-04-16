"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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
} from "lucide-react";
import type { PlayDocument } from "@/domain/play/types";
import {
  duplicatePlayAction,
  savePlayVersionAction,
} from "@/app/actions/plays";
import { createShareLinkForPlayAction } from "@/app/actions/share";
import { usePlayEditor } from "./usePlayEditor";
import { EditorCanvas, type EditorCanvasHandle, type Tool } from "./EditorCanvas";
import { ToolPalette } from "./ToolPalette";
import { Inspector } from "./Inspector";
import { PrintPreview } from "@/features/print/PrintPreview";
import { exportSvgToPdf } from "@/features/print/exportPdf";
import { compilePlayToSvg } from "@/domain/print/templates";
import { RouteAnimation } from "@/features/viewer/RouteAnimation";
import { Button, IconButton, SegmentedControl, Kbd, useToast } from "@/components/ui";
import { Tooltip } from "@/components/ui/Tooltip";

type Props = {
  playId: string;
  playbookId: string;
  initialDocument: PlayDocument;
};

export function PlayEditorClient({ playId, playbookId, initialDocument }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const { doc, dispatch, undo, redo, canUndo, canRedo } = usePlayEditor(initialDocument);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [polyDraft, setPolyDraft] = useState(0);
  const [tab, setTab] = useState<"editor" | "print">("editor");
  const [pending, startTransition] = useTransition();
  const canvasRef = useRef<EditorCanvasHandle>(null);

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

  // Keyboard shortcuts
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

      // Single-key shortcuts only when not in an input
      if (isInput) return;

      if (e.key === "1") setTool("select");
      if (e.key === "2") setTool("sketch");
      if (e.key === "3") setTool("polyline");
      if (e.key === "Escape") {
        setSelectedPlayerId(null);
        setSelectedRouteId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [save, undo, redo]);

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
          {/* Edit group */}
          <div className="flex items-center gap-1 rounded-lg bg-surface-inset p-1">
            <Tooltip content={<span className="flex items-center gap-2">Undo <Kbd keys="Ctrl+Z" /></span>}>
              <IconButton icon={Undo2} variant="ghost" disabled={!canUndo} onClick={undo} />
            </Tooltip>
            <Tooltip content={<span className="flex items-center gap-2">Redo <Kbd keys="Ctrl+Shift+Z" /></span>}>
              <IconButton icon={Redo2} variant="ghost" disabled={!canRedo} onClick={redo} />
            </Tooltip>
          </div>

          <div className="mx-1 h-6 w-px bg-border" />

          {/* Document actions */}
          <IconButton
            icon={FlipHorizontal}
            tooltip="Flip horizontal"
            onClick={() => dispatch({ type: "document.flip", axis: "horizontal" })}
          />
          <IconButton
            icon={Copy}
            tooltip="Duplicate play"
            onClick={duplicate}
          />
          <IconButton
            icon={Share2}
            tooltip="Copy share link"
            onClick={share}
          />

          <div className="mx-1 h-6 w-px bg-border" />

          {/* Primary */}
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
            { value: "editor" as const, label: "Field" },
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

      {/* Editor content */}
      {tab === "editor" && (
        <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[1fr_320px]">
          <div className="flex min-h-[420px] flex-col gap-3">
            <ToolPalette
              tool={tool}
              onToolChange={setTool}
              polylineActive={polyDraft > 0}
              onFinishPolyline={() => canvasRef.current?.commitPolyline()}
            />
            <div className="relative min-h-[360px] flex-1">
              <EditorCanvas
                ref={canvasRef}
                doc={doc}
                dispatch={dispatch}
                tool={tool}
                selectedPlayerId={selectedPlayerId}
                selectedRouteId={selectedRouteId}
                onSelectPlayer={setSelectedPlayerId}
                onSelectRoute={setSelectedRouteId}
                onPolylineDraftChange={setPolyDraft}
              />
              <div className="pointer-events-none absolute bottom-3 right-3 opacity-40">
                <RouteAnimation doc={doc} />
              </div>
            </div>
          </div>
          <aside className="rounded-xl border border-border bg-surface-raised p-4">
            <Inspector
              doc={doc}
              dispatch={dispatch}
              selectedPlayerId={selectedPlayerId}
              selectedRouteId={selectedRouteId}
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
