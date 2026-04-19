"use client";

import { SegmentedControl, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  WRISTBAND_HEIGHTS_IN,
  WRISTBAND_WIDTHS_IN,
  WRISTBAND_ZOOMS,
  type PlaybookPrintRunConfig,
  type PlaysheetGrouping,
  type WristbandGridLayout,
  type WristbandIconSize,
  type WristbandLabelMode,
  type WristbandLabelStyle,
  type WristbandPlayerShape,
  type WristbandRouteWeight,
  type WristbandZoom,
} from "@/domain/print/playbookPrint";

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

type PillOption<T extends string | number> = { value: T; label: string };

function PillGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: PillOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-surface-raised text-muted hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
        <div className="space-y-4">
          <PillGroup
            label="Player shape"
            value={config.wristbandPlayerShape}
            onChange={(v) => patch({ wristbandPlayerShape: v })}
            options={[
              { value: "circle" as WristbandPlayerShape, label: "●" },
              { value: "x" as WristbandPlayerShape, label: "✕" },
              { value: "diamond" as WristbandPlayerShape, label: "◆" },
            ]}
          />

          <PillGroup
            label="Grid"
            value={config.wristbandGridLayout}
            onChange={(v) => patch({ wristbandGridLayout: v })}
            options={[
              { value: "8" as WristbandGridLayout, label: "8 plays" },
              { value: "6" as WristbandGridLayout, label: "6 plays" },
              { value: "4" as WristbandGridLayout, label: "4 plays" },
              { value: "4col" as WristbandGridLayout, label: "4 cols" },
              { value: "3" as WristbandGridLayout, label: "3 plays" },
            ]}
          />

          <PillGroup
            label="Width (inches)"
            value={config.wristbandWidthIn}
            onChange={(v) => patch({ wristbandWidthIn: v })}
            options={WRISTBAND_WIDTHS_IN.map((n) => ({ value: n, label: `${n}"` }))}
          />

          <PillGroup
            label="Height (inches)"
            value={config.wristbandHeightIn}
            onChange={(v) => patch({ wristbandHeightIn: v })}
            options={WRISTBAND_HEIGHTS_IN.map((n) => ({ value: n, label: `${n}"` }))}
          />

          <PillGroup
            label="Zoom"
            value={config.wristbandZoom}
            onChange={(v) => patch({ wristbandZoom: v as WristbandZoom })}
            options={WRISTBAND_ZOOMS.map((n) => ({ value: n, label: `${n}%` }))}
          />

          <PillGroup
            label="Position icon size"
            value={config.wristbandIconSize}
            onChange={(v) => patch({ wristbandIconSize: v })}
            options={[
              { value: "small" as WristbandIconSize, label: "Small" },
              { value: "medium" as WristbandIconSize, label: "Medium" },
              { value: "large" as WristbandIconSize, label: "Large" },
            ]}
          />

          <PillGroup
            label="Route line weight"
            value={config.wristbandRouteWeight}
            onChange={(v) => patch({ wristbandRouteWeight: v })}
            options={[
              { value: "thin" as WristbandRouteWeight, label: "Thin" },
              { value: "medium" as WristbandRouteWeight, label: "Medium" },
              { value: "thick" as WristbandRouteWeight, label: "Thick" },
            ]}
          />

          <PillGroup
            label="Play label style"
            value={config.wristbandLabelStyle}
            onChange={(v) => patch({ wristbandLabelStyle: v })}
            options={[
              { value: "prominent" as WristbandLabelStyle, label: "Prominent" },
              { value: "compact" as WristbandLabelStyle, label: "Compact" },
            ]}
          />

          <PillGroup
            label="Play labels"
            value={config.wristbandLabels}
            onChange={(v) => patch({ wristbandLabels: v })}
            options={[
              { value: "both" as WristbandLabelMode, label: "Both" },
              { value: "name" as WristbandLabelMode, label: "Name" },
              { value: "number" as WristbandLabelMode, label: "Number" },
            ]}
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={config.wristbandColorCoding}
              onChange={(e) => patch({ wristbandColorCoding: e.target.checked })}
            />
            Color-code labels by tag
          </label>

          <div>
            <span className="text-sm text-muted">Group / sort for export</span>
            <Select
              className="mt-1"
              value={config.wristbandGrouping}
              onChange={(v) => patch({ wristbandGrouping: v as PlaysheetGrouping })}
              options={groupingOptions.map((o) => ({ value: o.value, label: o.label }))}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
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
