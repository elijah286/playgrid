"use client";

import { SegmentedControl, Select } from "@/components/ui";
import type { PlaybookPrintRunConfig, PlaysheetGrouping } from "@/domain/print/playbookPrint";

type Props = {
  config: PlaybookPrintRunConfig;
  onChange: (next: PlaybookPrintRunConfig) => void;
};

const groupingOptions: { value: PlaysheetGrouping; label: string }[] = [
  { value: "manual", label: "Manual order" },
  { value: "group", label: "Group" },
  { value: "formation", label: "Formation" },
  { value: "name", label: "Name" },
  { value: "number", label: "Number / code" },
];

export function PlaybookPrintRunControls({ config, onChange }: Props) {
  function patch(partial: Partial<PlaybookPrintRunConfig>) {
    onChange({ ...config, ...partial });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-raised p-4">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Output type
        </p>
        <SegmentedControl
          options={[
            { value: "playsheet" as const, label: "Playsheet" },
            { value: "wristband" as const, label: "Wristband" },
          ]}
          value={config.product}
          onChange={(product) => patch({ product })}
        />
      </div>

      {config.product === "playsheet" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Plays per sheet</span>
            <select
              className="rounded-lg border border-border bg-surface-raised px-2 py-1.5"
              value={String(config.playsPerSheet)}
              onChange={(e) => patch({ playsPerSheet: Number(e.target.value) as 1 | 2 | 4 })}
            >
              <option value="1">1</option>
              <option value="2">2 (side by side)</option>
              <option value="4">4 (2×2 grid)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Page orientation</span>
            <select
              className="rounded-lg border border-border bg-surface-raised px-2 py-1.5"
              value={config.sheetOrientation}
              onChange={(e) =>
                patch({ sheetOrientation: e.target.value as "portrait" | "landscape" })
              }
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <div className="sm:col-span-2">
            <span className="text-sm text-muted">Group / sort plays for export</span>
            <Select
              className="mt-1"
              value={config.playsheetGrouping}
              onChange={(v) => patch({ playsheetGrouping: v as PlaysheetGrouping })}
              options={groupingOptions.map((o) => ({ value: o.value, label: o.label }))}
            />
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Backfield yards (diagram emphasis)</span>
            <input
              type="range"
              min={5}
              max={25}
              value={config.backfieldYards}
              onChange={(e) => patch({ backfieldYards: Number(e.target.value) })}
              className="accent-primary"
            />
            <span className="text-xs text-muted">{config.backfieldYards} yds</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Downfield yards (diagram emphasis)</span>
            <input
              type="range"
              min={5}
              max={35}
              value={config.downfieldYards}
              onChange={(e) => patch({ downfieldYards: Number(e.target.value) })}
              className="accent-primary"
            />
            <span className="text-xs text-muted">{config.downfieldYards} yds</span>
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={config.includeCommentsAndNotes}
              onChange={(e) => patch({ includeCommentsAndNotes: e.target.checked })}
            />
            Include comments &amp; notes on print
          </label>
        </div>
      )}

      {config.product === "wristband" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Band width</span>
            <select
              className="rounded-lg border border-border bg-surface-raised px-2 py-1.5"
              value={config.wristbandSize}
              onChange={(e) =>
                patch({
                  wristbandSize: e.target.value as PlaybookPrintRunConfig["wristbandSize"],
                })
              }
            >
              <option value="narrow">Narrow</option>
              <option value="standard">Standard</option>
              <option value="wide">Wide</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Plays per band (layout)</span>
            <select
              className="rounded-lg border border-border bg-surface-raised px-2 py-1.5"
              value={String(config.playsPerBand)}
              onChange={(e) =>
                patch({ playsPerBand: Number(e.target.value) as 1 | 2 | 3 | 4 })
              }
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
            <span className="text-xs text-muted">Export uses one play per PDF page for now.</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Backfield yards</span>
            <input
              type="range"
              min={5}
              max={25}
              value={config.backfieldYards}
              onChange={(e) => patch({ backfieldYards: Number(e.target.value) })}
              className="accent-primary"
            />
            <span className="text-xs text-muted">{config.backfieldYards} yds</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Downfield yards</span>
            <input
              type="range"
              min={5}
              max={35}
              value={config.downfieldYards}
              onChange={(e) => patch({ downfieldYards: Number(e.target.value) })}
              className="accent-primary"
            />
            <span className="text-xs text-muted">{config.downfieldYards} yds</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={config.wristbandShowName}
              onChange={(e) => patch({ wristbandShowName: e.target.checked })}
            />
            Show play name
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={config.wristbandShowNumber}
              onChange={(e) => patch({ wristbandShowNumber: e.target.checked })}
            />
            Show wristband code
          </label>
          <div className="sm:col-span-2">
            <span className="text-sm text-muted">Group / sort for export</span>
            <Select
              className="mt-1"
              value={config.wristbandGrouping}
              onChange={(v) => patch({ wristbandGrouping: v as PlaysheetGrouping })}
              options={groupingOptions.map((o) => ({ value: o.value, label: o.label }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={config.includeCommentsAndNotes}
              onChange={(e) => patch({ includeCommentsAndNotes: e.target.checked })}
            />
            Include comments &amp; notes
          </label>
        </div>
      )}
    </div>
  );
}
