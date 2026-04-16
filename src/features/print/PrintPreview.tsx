"use client";

import { useMemo, useState } from "react";
import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument } from "@/domain/play/types";
import { compilePlayToSvg } from "@/domain/print/templates";

type Props = {
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
};

export function PrintPreview({ doc, dispatch }: Props) {
  const [kind, setKind] = useState<"wristband" | "full_sheet">("wristband");

  const compiled = useMemo(() => compilePlayToSvg(doc, kind), [doc, kind]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setKind("wristband")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            kind === "wristband"
              ? "bg-slate-900 text-white"
              : "bg-white ring-1 ring-slate-200"
          }`}
        >
          Wristband
        </button>
        <button
          type="button"
          onClick={() => setKind("full_sheet")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            kind === "full_sheet"
              ? "bg-slate-900 text-white"
              : "bg-white ring-1 ring-slate-200"
          }`}
        >
          Full sheet
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-slate-500">Live preview</p>
          <div
            className="mt-2 overflow-hidden rounded-xl bg-white p-2 ring-1 ring-slate-200"
            dangerouslySetInnerHTML={{ __html: compiled.svgMarkup }}
          />
        </div>
        <div className="space-y-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-slate-500">Diagram scale</span>
            <input
              type="range"
              min={0.6}
              max={1.4}
              step={0.05}
              value={doc.printProfile.wristband.diagramScale}
              onChange={(e) =>
                dispatch({
                  type: "document.setPrintProfile",
                  printProfile: {
                    ...doc.printProfile,
                    wristband: {
                      ...doc.printProfile.wristband,
                      diagramScale: Number(e.target.value),
                    },
                  },
                })
              }
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={doc.printProfile.visibility.showPlayerLabels}
              onChange={(e) =>
                dispatch({
                  type: "document.setPrintProfile",
                  printProfile: {
                    ...doc.printProfile,
                    visibility: {
                      ...doc.printProfile.visibility,
                      showPlayerLabels: e.target.checked,
                    },
                  },
                })
              }
            />
            Player labels
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={doc.printProfile.visibility.showNotes}
              onChange={(e) =>
                dispatch({
                  type: "document.setPrintProfile",
                  printProfile: {
                    ...doc.printProfile,
                    visibility: {
                      ...doc.printProfile.visibility,
                      showNotes: e.target.checked,
                    },
                  },
                })
              }
            />
            Notes
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={doc.printProfile.visibility.showWristbandCode}
              onChange={(e) =>
                dispatch({
                  type: "document.setPrintProfile",
                  printProfile: {
                    ...doc.printProfile,
                    visibility: {
                      ...doc.printProfile.visibility,
                      showWristbandCode: e.target.checked,
                    },
                  },
                })
              }
            />
            Wristband code
          </label>
        </div>
      </div>
    </div>
  );
}
