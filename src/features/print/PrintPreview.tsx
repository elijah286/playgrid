"use client";

import { useMemo } from "react";
import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument } from "@/domain/play/types";
import type { TeamTheme } from "@/domain/team/theme";
import { compilePlayToSvg } from "@/domain/print/templates";
import type { PrintTemplateKind } from "@/domain/print/templates";

type Props = {
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
  kind: PrintTemplateKind;
  onKindChange: (k: PrintTemplateKind) => void;
  teamTheme?: TeamTheme;
};

export function PrintPreview({ doc, dispatch, kind, onKindChange, teamTheme }: Props) {
  const compiled = useMemo(
    () => compilePlayToSvg(doc, kind, teamTheme),
    [doc, kind, teamTheme],
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onKindChange("wristband")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            kind === "wristband"
              ? "bg-pg-turf text-white"
              : "bg-pg-chalk ring-1 ring-pg-line dark:bg-pg-turf-deep/40"
          }`}
        >
          Wristband
        </button>
        <button
          type="button"
          onClick={() => onKindChange("full_sheet")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            kind === "full_sheet"
              ? "bg-pg-turf text-white"
              : "bg-pg-chalk ring-1 ring-pg-line dark:bg-pg-turf-deep/40"
          }`}
        >
          Full sheet
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-pg-subtle">Live preview</p>
          <div
            className="mt-2 overflow-hidden rounded-xl bg-pg-chalk p-2 ring-1 ring-pg-line dark:bg-pg-turf-deep/30"
            dangerouslySetInnerHTML={{ __html: compiled.svgMarkup }}
          />
        </div>
        <div className="space-y-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-pg-subtle">Diagram scale</span>
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
