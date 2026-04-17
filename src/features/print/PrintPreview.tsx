"use client";

import { useMemo } from "react";
import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument } from "@/domain/play/types";
import { compilePlayToSvg } from "@/domain/print/templates";
import { SegmentedControl } from "@/components/ui";
import { useState } from "react";

type Props = {
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
  kind?: "wristband" | "full_sheet";
  onKindChange?: (k: "wristband" | "full_sheet") => void;
};

export function PrintPreview({ doc, dispatch, kind: kindProp, onKindChange }: Props) {
  const [internalKind, setInternalKind] = useState<"wristband" | "full_sheet">("wristband");
  const kind = kindProp ?? internalKind;
  const setKind = onKindChange ?? setInternalKind;

  const compiled = useMemo(() => compilePlayToSvg(doc, kind), [doc, kind]);

  return (
    <div className="space-y-4">
      <SegmentedControl
        options={[
          { value: "wristband" as const, label: "Wristband" },
          { value: "full_sheet" as const, label: "Full sheet" },
        ]}
        value={kind}
        onChange={setKind}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Live preview</p>
          <div
            className="overflow-hidden rounded-xl border border-border bg-surface-raised p-3"
            dangerouslySetInnerHTML={{ __html: compiled.svgMarkup }}
          />
        </div>
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Settings</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Diagram scale</span>
            <input
              type="range"
              min={0.6}
              max={1.4}
              step={0.05}
              value={doc.printProfile.wristband.diagramScale}
              className="accent-primary"
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
          <div className="space-y-2.5">
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={doc.printProfile.visibility.showPlayerLabels}
                className="size-4 rounded accent-primary"
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
              <span className="text-foreground">Player labels</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={doc.printProfile.visibility.showNotes}
                className="size-4 rounded accent-primary"
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
              <span className="text-foreground">Notes</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={doc.printProfile.visibility.showWristbandCode}
                className="size-4 rounded accent-primary"
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
              <span className="text-foreground">Wristband code</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
