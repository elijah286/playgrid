"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlayDocument } from "@/domain/play/types";
import {
  duplicatePlayAction,
  savePlayVersionAction,
  type PlayPrintContext,
} from "@/app/actions/plays";
import { createShareLinkForPlayAction } from "@/app/actions/share";
import { usePlayEditor } from "./usePlayEditor";
import { EditorCanvas, type EditorCanvasHandle, type Tool } from "./EditorCanvas";
import { ToolPalette } from "./ToolPalette";
import { Inspector } from "./Inspector";
import { PrintPreview } from "@/features/print/PrintPreview";
import { exportSvgsToMultiPagePdf } from "@/features/print/exportPdf";
import { compilePlayToSvg } from "@/domain/print/templates";
import type { PrintTemplateKind } from "@/domain/print/templates";
import { compileCoverPageSvg } from "@/domain/print/cover";
import { RouteAnimation } from "@/features/viewer/RouteAnimation";
type Props = {
  playId: string;
  playbookId: string;
  initialDocument: PlayDocument;
  printContext: PlayPrintContext;
};

export function PlayEditorClient({
  playId,
  playbookId,
  initialDocument,
  printContext,
}: Props) {
  const router = useRouter();
  const { doc, dispatch, undo, redo, canUndo, canRedo } = usePlayEditor(initialDocument);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [polyDraft, setPolyDraft] = useState(0);
  const [tab, setTab] = useState<"editor" | "print">("editor");
  const [printKind, setPrintKind] = useState<PrintTemplateKind>("full_sheet");
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
    const cover = compileCoverPageSvg({
      playbookName: printContext.playbookName,
      teamName: printContext.teamName,
      playTitle: doc.metadata.coachName,
      roster: printContext.roster,
      theme: printContext.theme,
    });
    const playPage = compilePlayToSvg(doc, printKind, printContext.theme);
    const safeCode = (doc.metadata.wristbandCode || "play").replace(/[^\w.-]+/g, "-");
    startTransition(async () => {
      await exportSvgsToMultiPagePdf(
        [cover.svgMarkup, playPage.svgMarkup],
        `${safeCode}-playbook-sheet.pdf`,
      );
    });
  }, [doc, printContext, printKind]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-pg-line/80 pb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-pg-subtle">
            Play editor
          </p>
          <h1 className="text-lg font-semibold text-pg-ink">{doc.metadata.coachName}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/playbooks/${playbookId}`}
            className="rounded-lg px-3 py-1.5 text-sm text-pg-muted ring-1 ring-pg-line hover:bg-pg-mist"
          >
            Back
          </Link>
          <button
            type="button"
            onClick={() => dispatch({ type: "document.flip", axis: "horizontal" })}
            className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-pg-line hover:bg-pg-mist"
          >
            Flip
          </button>
          <button
            type="button"
            disabled={!canUndo}
            onClick={undo}
            className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-pg-line hover:bg-pg-mist disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={redo}
            className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-pg-line hover:bg-pg-mist disabled:opacity-40"
          >
            Redo
          </button>
          <button
            type="button"
            onClick={duplicate}
            className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-pg-line hover:bg-pg-mist"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={share}
            className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-pg-line hover:bg-pg-mist"
          >
            Share link
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-pg-turf px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-pg-turf-deep disabled:opacity-60"
          >
            Save version
          </button>
        </div>
      </header>

      {message && (
        <p className="rounded-lg bg-pg-surface px-3 py-2 text-sm text-pg-body">{message}</p>
      )}

      <div className="flex gap-2 border-b border-pg-line/80 pb-2">
        <button
          type="button"
          onClick={() => setTab("editor")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            tab === "editor" ? "bg-pg-turf text-white" : "text-pg-muted hover:bg-pg-mist"
          }`}
        >
          Field
        </button>
        <button
          type="button"
          onClick={() => setTab("print")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            tab === "print" ? "bg-pg-turf text-white" : "text-pg-muted hover:bg-pg-mist"
          }`}
        >
          Print preview
        </button>
        <Link
          href={`/m/play/${playId}?playbookId=${playbookId}`}
          className="ml-auto rounded-lg px-3 py-1.5 text-sm text-pg-signal ring-1 ring-pg-signal-ring hover:bg-pg-signal-soft"
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
          <aside className="rounded-2xl bg-pg-chalk/95 p-4 ring-1 ring-pg-line/80 dark:bg-pg-turf-deep/25">
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
          <PrintPreview
            doc={doc}
            dispatch={dispatch}
            kind={printKind}
            onKindChange={setPrintKind}
            teamTheme={printContext.theme}
          />
          <p className="text-xs text-pg-subtle">
            PDF includes a cover page (team colors & roster) plus the layout you selected below.
          </p>
          <button
            type="button"
            onClick={exportPdf}
            className="rounded-lg bg-pg-turf px-4 py-2 text-sm font-medium text-white hover:bg-pg-turf-deep"
          >
            Export PDF (cover + sheet)
          </button>
        </div>
      )}
    </div>
  );
}
