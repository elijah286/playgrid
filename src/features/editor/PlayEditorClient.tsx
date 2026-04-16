"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

type Props = {
  playId: string;
  playbookId: string;
  initialDocument: PlayDocument;
};

export function PlayEditorClient({ playId, playbookId, initialDocument }: Props) {
  const router = useRouter();
  const { doc, dispatch, undo, redo, canUndo, canRedo } = usePlayEditor(initialDocument);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [polyDraft, setPolyDraft] = useState(0);
  const [tab, setTab] = useState<"editor" | "print">("editor");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canvasRef = useRef<EditorCanvasHandle>(null);

  const save = useCallback(() => {
    startTransition(async () => {
      const res = await savePlayVersionAction(playId, doc);
      if (!res.ok) setMessage(res.error);
      else {
        setMessage("Saved");
        router.refresh();
      }
    });
  }, [doc, playId, router]);

  const duplicate = useCallback(() => {
    startTransition(async () => {
      const res = await duplicatePlayAction(playId);
      if (!res.ok) setMessage(res.error);
      else {
        router.push(`/plays/${res.playId}/edit`);
      }
    });
  }, [playId, router]);

  const share = useCallback(() => {
    startTransition(async () => {
      const res = await createShareLinkForPlayAction(playId);
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      const url = `${window.location.origin}/v/${res.token}`;
      await navigator.clipboard.writeText(url);
      setMessage("Share link copied to clipboard");
    });
  }, [playId]);

  const exportPdf = useCallback(() => {
    const compiled = compilePlayToSvg(doc, "full_sheet");
    startTransition(async () => {
      await exportSvgToPdf(compiled.svgMarkup, `play-${doc.metadata.wristbandCode}.pdf`);
    });
  }, [doc]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Play editor
          </p>
          <h1 className="text-lg font-semibold text-slate-900">{doc.metadata.coachName}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/playbooks/${playbookId}`}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Back
          </Link>
          <button
            type="button"
            onClick={() => dispatch({ type: "document.flip", axis: "horizontal" })}
            className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Flip
          </button>
          <button
            type="button"
            disabled={!canUndo}
            onClick={undo}
            className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={redo}
            className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
          >
            Redo
          </button>
          <button
            type="button"
            onClick={duplicate}
            className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={share}
            className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Share link
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
          >
            Save version
          </button>
        </div>
      </header>

      {message && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p>
      )}

      <div className="flex gap-2 border-b border-slate-200/80 pb-2">
        <button
          type="button"
          onClick={() => setTab("editor")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            tab === "editor" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Field
        </button>
        <button
          type="button"
          onClick={() => setTab("print")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            tab === "print" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Print preview
        </button>
        <Link
          href={`/m/play/${playId}?playbookId=${playbookId}`}
          className="ml-auto rounded-lg px-3 py-1.5 text-sm text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
        >
          Open mobile view
        </Link>
      </div>

      {tab === "editor" && (
        <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[1fr_320px]">
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
          <aside className="rounded-2xl bg-white/90 p-4 ring-1 ring-slate-200/80">
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
          <button
            type="button"
            onClick={exportPdf}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Export PDF
          </button>
        </div>
      )}
    </div>
  );
}
