"use client";

import { Lock } from "lucide-react";
import { SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  defaultPlaybookPrintRunConfig,
  PLAYSHEET_COLUMN_OPTIONS,
  WRISTBAND_HEIGHTS_IN,
  WRISTBAND_WIDTHS_IN,
  WRISTBAND_ZOOMS,
  type ArrowSize,
  type PlaybookPrintRunConfig,
  type PlaysheetColumns,
  type PlaysheetNoteLines,
  type PlaysheetPageBreak,
  type PrintLabelToggles,
  type PrintTextPosition,
  type WristbandGridLayout,
  type WristbandIconSize,
  type WristbandRouteWeight,
  type WristbandZoom,
} from "@/domain/print/playbookPrint";

const arrowSizeOptions: { value: ArrowSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

type Props = {
  config: PlaybookPrintRunConfig;
  onChange: (next: PlaybookPrintRunConfig) => void;
  /**
   * Which subset of controls to render. "layout" = structural (product,
   * columns, orientation, grouping, sizes). "visuals" = look (icons, route
   * weight, labels, colors, LOS/yard markers). "all" (default) = everything.
   */
  section?: "layout" | "visuals" | "text" | "all";
  /** When false, render the Wristband segment with a lock indicator. */
  canUseWristbands?: boolean;
};

function LabelToggles({
  value,
  onChange,
}: {
  value: PrintLabelToggles;
  onChange: (next: PrintLabelToggles) => void;
}) {
  const items: { key: keyof PrintLabelToggles; label: string }[] = [
    { key: "showNumber", label: "Number" },
    { key: "showFormation", label: "Formation" },
    { key: "showName", label: "Name" },
  ];
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Play labels
      </p>
      <div className="space-y-1.5">
        {items.map((it) => (
          <label key={it.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={value[it.key]}
              onChange={(e) => onChange({ ...value, [it.key]: e.target.checked })}
            />
            {it.label}
          </label>
        ))}
      </div>
    </div>
  );
}

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

function LabelSettings({
  title,
  size,
  onSize,
  position,
  onPosition,
}: {
  title: string;
  size: number;
  onSize: (v: number) => void;
  position: PrintTextPosition;
  onPosition: (v: PrintTextPosition) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border/60 p-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {title}
      </p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Size · {Math.round(size * 100)}%</span>
        <input
          type="range"
          min={50}
          max={250}
          step={5}
          value={Math.round(size * 100)}
          onChange={(e) => onSize(Number(e.target.value) / 100)}
          className="accent-primary"
        />
      </label>
      <PillGroup
        label="Position"
        value={position}
        options={[
          { value: "top-left" as PrintTextPosition, label: "Top left" },
          { value: "top-center" as PrintTextPosition, label: "Top middle" },
          { value: "top-overlay" as PrintTextPosition, label: "On play" },
          { value: "bottom-center" as PrintTextPosition, label: "Bottom middle" },
        ]}
        onChange={onPosition}
      />
    </div>
  );
}

export function PlaybookPrintRunControls({ config, onChange, section = "all", canUseWristbands = true }: Props) {
  function patch(partial: Partial<PlaybookPrintRunConfig>) {
    onChange({ ...config, ...partial });
  }

  const showLayout = section === "all" || section === "layout";
  const showVisuals = section === "all" || section === "visuals";
  const showText = section === "all" || section === "text";

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-raised p-4">
      {showLayout && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Output type
          </p>
          <SegmentedControl
            options={[
              { value: "playsheet" as const, label: "Playsheet" },
              {
                value: "wristband" as const,
                label: canUseWristbands ? "Wristband" : "Wristband (Team Coach)",
                icon: canUseWristbands ? undefined : Lock,
              },
            ]}
            value={config.product}
            onChange={(product) => patch({ product })}
          />
          <button
            type="button"
            onClick={() =>
              onChange({ ...defaultPlaybookPrintRunConfig, product: config.product })
            }
            className="mt-2 text-xs text-primary underline-offset-2 hover:underline"
          >
            Reset to recommended defaults
          </button>
        </div>
      )}

      {config.product === "playsheet" && (
        <div className="space-y-4">
          {showLayout && (
            <>
              <PillGroup
                label="Columns"
                value={config.playsheetColumns}
                onChange={(v) => patch({ playsheetColumns: v as PlaysheetColumns })}
                options={PLAYSHEET_COLUMN_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
              />

              <PillGroup
                label="Page orientation"
                value={config.sheetOrientation}
                onChange={(v) => patch({ sheetOrientation: v })}
                options={[
                  { value: "portrait" as const, label: "Portrait" },
                  { value: "landscape" as const, label: "Landscape" },
                ]}
              />

              <PillGroup
                label="Page breaks"
                value={config.playsheetPageBreak}
                onChange={(v) => patch({ playsheetPageBreak: v as PlaysheetPageBreak })}
                options={[
                  { value: "continuous" as const, label: "Pack tightly" },
                  { value: "group" as const, label: "New page per group" },
                ]}
              />

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={config.playsheetIncludeHeader}
                    onChange={(e) => patch({ playsheetIncludeHeader: e.target.checked })}
                  />
                  Include team header on every page
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={config.playsheetIncludeFooter}
                    onChange={(e) => patch({ playsheetIncludeFooter: e.target.checked })}
                  />
                  Include footer on every page
                </label>
                {config.playsheetIncludeFooter && (
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-muted">
                      Footer text · placeholders: {"{playbook}"}, {"{coach}"}, {"{date}"}
                    </span>
                    <input
                      type="text"
                      value={config.playsheetFooterText}
                      onChange={(e) => patch({ playsheetFooterText: e.target.value })}
                      className="rounded-md border border-border bg-surface-raised px-2 py-1 text-sm"
                    />
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={config.playsheetShowNotes}
                    onChange={(e) => patch({ playsheetShowNotes: e.target.checked })}
                  />
                  Show notes strip below plays
                </label>
                {config.playsheetShowNotes && (
                  <PillGroup
                    label="Note lines"
                    value={config.playsheetNoteLines}
                    onChange={(v) => patch({ playsheetNoteLines: v as PlaysheetNoteLines })}
                    options={[
                      { value: 1 as PlaysheetNoteLines, label: "1" },
                      { value: 2 as PlaysheetNoteLines, label: "2" },
                      { value: 3 as PlaysheetNoteLines, label: "3" },
                    ]}
                  />
                )}
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">
                    Padding between plays · {Math.round(config.playsheetCellPadding * 100)}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(config.playsheetCellPadding * 100)}
                    onChange={(e) =>
                      patch({ playsheetCellPadding: Number(e.target.value) / 100 })
                    }
                    className="accent-primary"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">
                    Play height · {Math.round(config.playsheetCellHeightScale * 100)}%
                  </span>
                  <input
                    type="range"
                    min={50}
                    max={150}
                    step={5}
                    value={Math.round(config.playsheetCellHeightScale * 100)}
                    onChange={(e) =>
                      patch({ playsheetCellHeightScale: Number(e.target.value) / 100 })
                    }
                    className="accent-primary"
                  />
                </label>
              </div>
            </>
          )}

          {showVisuals && (
            <>
              <PillGroup
                label="Position icon size"
                value={config.playsheetIconSize}
                onChange={(v) => patch({ playsheetIconSize: v as WristbandIconSize })}
                options={[
                  { value: "small" as WristbandIconSize, label: "Small" },
                  { value: "medium" as WristbandIconSize, label: "Medium" },
                  { value: "large" as WristbandIconSize, label: "Large" },
                ]}
              />

              <PillGroup
                label="Route line weight"
                value={config.playsheetRouteWeight}
                onChange={(v) => patch({ playsheetRouteWeight: v as WristbandRouteWeight })}
                options={[
                  { value: "thin" as WristbandRouteWeight, label: "Thin" },
                  { value: "medium" as WristbandRouteWeight, label: "Medium" },
                  { value: "thick" as WristbandRouteWeight, label: "Thick" },
                ]}
              />

              <PillGroup
                label="Arrow size"
                value={config.playsheetArrowSize}
                onChange={(v) => patch({ playsheetArrowSize: v as ArrowSize })}
                options={arrowSizeOptions}
              />

              <div className="space-y-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">
                    Line of scrimmage · {Math.round(config.playsheetLosIntensity * 100)}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(config.playsheetLosIntensity * 100)}
                    onChange={(e) =>
                      patch({ playsheetLosIntensity: Number(e.target.value) / 100 })
                    }
                    className="accent-primary"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">
                    Yard markers · {Math.round(config.playsheetYardMarkersIntensity * 100)}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(config.playsheetYardMarkersIntensity * 100)}
                    onChange={(e) =>
                      patch({ playsheetYardMarkersIntensity: Number(e.target.value) / 100 })
                    }
                    className="accent-primary"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">
                    Play border thickness · {Math.round(config.playsheetBorderThickness * 100)}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={10}
                    value={Math.round(config.playsheetBorderThickness * 100)}
                    onChange={(e) =>
                      patch({ playsheetBorderThickness: Number(e.target.value) / 100 })
                    }
                    className="accent-primary"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={config.playsheetPlayerOutline}
                    onChange={(e) => patch({ playsheetPlayerOutline: e.target.checked })}
                  />
                  Outline player markers
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={config.playsheetColorCoding}
                    onChange={(e) => patch({ playsheetColorCoding: e.target.checked })}
                  />
                  Color-code labels by tag
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">
                    Yards behind line of scrimmage · {config.backfieldYards}
                  </span>
                  <input
                    type="range"
                    min={5}
                    max={15}
                    step={1}
                    value={config.backfieldYards}
                    onChange={(e) =>
                      patch({ backfieldYards: Number(e.target.value) })
                    }
                    className="accent-primary"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">
                    Yards downfield · {config.downfieldYards}
                  </span>
                  <input
                    type="range"
                    min={10}
                    max={25}
                    step={1}
                    value={config.downfieldYards}
                    onChange={(e) =>
                      patch({ downfieldYards: Number(e.target.value) })
                    }
                    className="accent-primary"
                  />
                </label>
              </div>
            </>
          )}

          {showText && (
            <div className="space-y-3">
              <LabelToggles
                value={config.playsheetLabels}
                onChange={(v) => patch({ playsheetLabels: v })}
              />
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">
                  Header font size · {Math.round(config.playsheetHeaderFontSize * 100)}%
                </span>
                <input
                  type="range"
                  min={50}
                  max={200}
                  step={5}
                  value={Math.round(config.playsheetHeaderFontSize * 100)}
                  onChange={(e) =>
                    patch({ playsheetHeaderFontSize: Number(e.target.value) / 100 })
                  }
                  className="accent-primary"
                />
              </label>
              {config.playsheetLabels.showFormation && (
                <LabelSettings
                  title="Formation"
                  size={config.playsheetFormationSize}
                  onSize={(v) => patch({ playsheetFormationSize: v })}
                  position={config.playsheetFormationPosition}
                  onPosition={(v) => patch({ playsheetFormationPosition: v })}
                />
              )}
              {config.playsheetLabels.showName && (
                <LabelSettings
                  title="Name"
                  size={config.playsheetNameSize}
                  onSize={(v) => patch({ playsheetNameSize: v })}
                  position={config.playsheetNamePosition}
                  onPosition={(v) => patch({ playsheetNamePosition: v })}
                />
              )}
              {config.playsheetLabels.showNumber && (
                <div className="space-y-2 rounded-md border border-border/60 p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Number
                  </p>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-muted">
                      Size · {Math.round(config.playsheetNumberSize * 100)}%
                    </span>
                    <input
                      type="range"
                      min={50}
                      max={250}
                      step={5}
                      value={Math.round(config.playsheetNumberSize * 100)}
                      onChange={(e) =>
                        patch({ playsheetNumberSize: Number(e.target.value) / 100 })
                      }
                      className="accent-primary"
                    />
                  </label>
                  <PillGroup
                    label="Position"
                    value={config.playsheetNumberPosition}
                    options={[
                      { value: "top-left", label: "Top left" },
                      { value: "bottom-left", label: "Bottom left" },
                      { value: "bottom-center", label: "Bottom middle" },
                      { value: "below-name", label: "Below name" },
                    ]}
                    onChange={(v) => patch({ playsheetNumberPosition: v })}
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={config.playsheetLabelWrap}
                  onChange={(e) => patch({ playsheetLabelWrap: e.target.checked })}
                />
                Wrap long labels
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={config.playsheetShowPlayerLabels}
                  onChange={(e) => patch({ playsheetShowPlayerLabels: e.target.checked })}
                />
                Show player letters
              </label>
            </div>
          )}
        </div>
      )}

      {config.product === "wristband" && (
        <div className="space-y-4">
          {showLayout && (
            <>
              <PillGroup
                label="Sheet layout"
                value={config.wristbandSheet}
                onChange={(v) => patch({ wristbandSheet: v as "single" | "sheet" })}
                options={[
                  { value: "sheet" as const, label: "Pack onto letter (cut apart)" },
                  { value: "single" as const, label: "One strip per page" },
                ]}
              />

              {config.wristbandSheet === "sheet" && (
                <PillGroup
                  label="Copies per sheet"
                  value={config.wristbandCopiesPerSheet}
                  onChange={(v) =>
                    patch({
                      wristbandCopiesPerSheet:
                        v as PlaybookPrintRunConfig["wristbandCopiesPerSheet"],
                    })
                  }
                  options={[
                    { value: "auto" as const, label: "Auto-fit" },
                    { value: 1, label: "1" },
                    { value: 2, label: "2" },
                    { value: 3, label: "3" },
                    { value: 4, label: "4" },
                    { value: 5, label: "5" },
                    { value: 6, label: "6" },
                    { value: 7, label: "7" },
                    { value: 8, label: "8" },
                  ]}
                />
              )}

              <PillGroup
                label="Grid"
                value={config.wristbandGridLayout}
                onChange={(v) => patch({ wristbandGridLayout: v })}
                options={[
                  { value: "12" as WristbandGridLayout, label: "12 plays" },
              { value: "10" as WristbandGridLayout, label: "10 plays" },
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

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">
                  Padding between plays · {Math.round(config.wristbandCellPadding * 100)}%
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(config.wristbandCellPadding * 100)}
                  onChange={(e) =>
                    patch({ wristbandCellPadding: Number(e.target.value) / 100 })
                  }
                  className="accent-primary"
                />
              </label>
            </>
          )}

          {showVisuals && (
            <>
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
            label="Arrow size"
            value={config.wristbandArrowSize}
            onChange={(v) => patch({ wristbandArrowSize: v as ArrowSize })}
            options={arrowSizeOptions}
          />

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={config.wristbandShowLos}
                onChange={(e) => patch({ wristbandShowLos: e.target.checked })}
              />
              Show line of scrimmage
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={config.wristbandShowYardMarkers}
                onChange={(e) => patch({ wristbandShowYardMarkers: e.target.checked })}
              />
              Show yard markers
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={config.wristbandPlayerOutline}
                onChange={(e) => patch({ wristbandPlayerOutline: e.target.checked })}
              />
              Outline player markers
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">
                Play border thickness · {Math.round(config.wristbandBorderThickness * 100)}%
              </span>
              <input
                type="range"
                min={0}
                max={200}
                step={10}
                value={Math.round(config.wristbandBorderThickness * 100)}
                onChange={(e) =>
                  patch({ wristbandBorderThickness: Number(e.target.value) / 100 })
                }
                className="accent-primary"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={config.wristbandColorCoding}
                onChange={(e) => patch({ wristbandColorCoding: e.target.checked })}
              />
              Color-code labels by tag
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">
                Yards behind line of scrimmage · {config.backfieldYards}
              </span>
              <input
                type="range"
                min={5}
                max={15}
                step={1}
                value={config.backfieldYards}
                onChange={(e) => patch({ backfieldYards: Number(e.target.value) })}
                className="accent-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">
                Yards downfield · {config.downfieldYards}
              </span>
              <input
                type="range"
                min={10}
                max={25}
                step={1}
                value={config.downfieldYards}
                onChange={(e) => patch({ downfieldYards: Number(e.target.value) })}
                className="accent-primary"
              />
            </label>
          </div>
            </>
          )}

          {showText && (
            <div className="space-y-3">
              <LabelToggles
                value={config.wristbandLabels}
                onChange={(v) => patch({ wristbandLabels: v })}
              />
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">
                  Header font size · {Math.round(config.wristbandHeaderFontSize * 100)}%
                </span>
                <input
                  type="range"
                  min={50}
                  max={200}
                  step={5}
                  value={Math.round(config.wristbandHeaderFontSize * 100)}
                  onChange={(e) =>
                    patch({ wristbandHeaderFontSize: Number(e.target.value) / 100 })
                  }
                  className="accent-primary"
                />
              </label>
              {config.wristbandLabels.showFormation && (
                <LabelSettings
                  title="Formation"
                  size={config.wristbandFormationSize}
                  onSize={(v) => patch({ wristbandFormationSize: v })}
                  position={config.wristbandFormationPosition}
                  onPosition={(v) => patch({ wristbandFormationPosition: v })}
                />
              )}
              {config.wristbandLabels.showName && (
                <LabelSettings
                  title="Name"
                  size={config.wristbandNameSize}
                  onSize={(v) => patch({ wristbandNameSize: v })}
                  position={config.wristbandNamePosition}
                  onPosition={(v) => patch({ wristbandNamePosition: v })}
                />
              )}
              {config.wristbandLabels.showNumber && (
                <div className="space-y-2 rounded-md border border-border/60 p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Number
                  </p>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-muted">
                      Size · {Math.round(config.wristbandNumberSize * 100)}%
                    </span>
                    <input
                      type="range"
                      min={50}
                      max={250}
                      step={5}
                      value={Math.round(config.wristbandNumberSize * 100)}
                      onChange={(e) =>
                        patch({ wristbandNumberSize: Number(e.target.value) / 100 })
                      }
                      className="accent-primary"
                    />
                  </label>
                  <PillGroup
                    label="Position"
                    value={config.wristbandNumberPosition}
                    options={[
                      { value: "top-left", label: "Top left" },
                      { value: "bottom-left", label: "Bottom left" },
                      { value: "bottom-center", label: "Bottom middle" },
                      { value: "below-name", label: "Below name" },
                    ]}
                    onChange={(v) => patch({ wristbandNumberPosition: v })}
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={config.wristbandLabelWrap}
                  onChange={(e) => patch({ wristbandLabelWrap: e.target.checked })}
                />
                Wrap long labels
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={config.wristbandShowPlayerLabels}
                  onChange={(e) => patch({ wristbandShowPlayerLabels: e.target.checked })}
                />
                Show player letters
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
