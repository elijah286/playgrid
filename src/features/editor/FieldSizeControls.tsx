"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument } from "@/domain/play/types";
import {
  resolveBackfieldYards,
  resolveDownfieldYards,
  resolveFieldPositionYds,
  resolveHashStyle,
  resolveLineOfScrimmage,
  resolveRotatedYardNumbers,
  resolveShowDownMarkers,
  resolveShowEndzones,
  resolveShowFirstDownLine,
  resolveShowHashMarks,
  resolveShowNoRunZones,
  resolveShowYardNumbers,
  type HashStyle,
} from "@/domain/play/factory";
import type {
  FieldStructure,
  NoRunZoneConfig,
} from "@/domain/play/leaguePresets";
import {
  markingDefaultsFromPlay,
  type PlaybookSettings,
} from "@/domain/playbook/settings";
import { updatePlaybookFieldDisplayAction } from "@/app/actions/playbooks";
import { SegmentedControl } from "@/components/ui";

type Props = {
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
  /** Show the "Full field" toggle. Hidden when the variant's natural width
   *  already fits in the narrow viewport (flag, etc.). */
  showFullFieldToggle?: boolean;
  fullFieldWidth?: boolean;
  onFullFieldWidthChange?: (next: boolean) => void;
  /** Resolved league field structure (length, no-run, first-down lines).
   *  When provided, the Position popover offers semantic chips and the
   *  yardage input clamps to the league field length. */
  fieldStructure?: FieldStructure | null;
  /** Playbook id — required to enable the "Save as team default" action. */
  playbookId?: string;
  /** Current playbook settings — used to read the existing fieldDisplay
   *  (league preset + structure) so "Save as team default" preserves the
   *  preset and only updates the marking defaults. */
  playbookSettings?: PlaybookSettings;
  /** Optimistic setter for `playbookSettings`. The Display popover's
   *  width/length spinners call this so the canvas re-shapes immediately;
   *  the server save happens in parallel. Without it, changes wouldn't
   *  show until the next page load. */
  onPlaybookSettingsChange?: (next: PlaybookSettings) => void;
  /** Playbook accent color (hex). Used to tint the scoring-endzone
   *  legend swatch so the legend matches the field's stripe color. */
  playbookColor?: string | null;
};

/* ───────────────────────────────────────────────────────────────── */
/*  Popover scaffolding                                              */
/* ───────────────────────────────────────────────────────────────── */

function usePopover() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, wrapRef };
}

function PopoverButton({
  label,
  state,
  open,
  onToggle,
}: {
  label: string;
  state: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition ${
        open
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-surface-inset text-muted hover:bg-surface-raised hover:text-foreground"
      }`}
    >
      <span className="font-medium">{label}</span>
      <span className="text-[10px] text-muted">{state}</span>
      <svg
        viewBox="0 0 12 12"
        className={`size-2.5 transition ${open ? "rotate-180" : ""}`}
        fill="none"
      >
        <path
          d="M3 4.5l3 3 3-3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function Panel({
  children,
  width = "min-w-[16rem]",
}: {
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <div
      role="menu"
      className={`absolute left-0 top-full z-30 mt-1 ${width} rounded-md border border-border bg-surface-raised p-2 shadow-lg`}
    >
      {children}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/*  Small inputs                                                     */
/* ───────────────────────────────────────────────────────────────── */

function YardSpinner({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="min-w-[3rem] text-[11px] text-muted">{label}</span>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex size-5 items-center justify-center rounded border border-border bg-surface-inset text-xs text-muted hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      >
        −
      </button>
      <span className="w-6 text-center text-xs font-medium tabular-nums text-foreground">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex size-5 items-center justify-center rounded border border-border bg-surface-inset text-xs text-muted hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
  rightSlot,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  rightSlot?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center justify-between gap-2 rounded px-1.5 py-1 text-xs hover:bg-surface-inset">
      <span className="flex items-center gap-2 text-foreground">
        <input
          type="checkbox"
          className="size-3.5 cursor-pointer accent-primary"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </span>
      {rightSlot && <span className="text-[10px] text-muted">{rightSlot}</span>}
    </label>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/*  Main component                                                   */
/* ───────────────────────────────────────────────────────────────── */

export function FieldSizeControls({
  doc,
  dispatch,
  showFullFieldToggle = false,
  fullFieldWidth = false,
  onFullFieldWidthChange,
  fieldStructure = null,
  playbookId,
  playbookSettings,
  onPlaybookSettingsChange,
  playbookColor = null,
}: Props) {
  const isDefense = doc.metadata.playType === "defense";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2">
      <FieldControl
        doc={doc}
        dispatch={dispatch}
        showFullFieldToggle={showFullFieldToggle}
        fullFieldWidth={fullFieldWidth}
        onFullFieldWidthChange={onFullFieldWidthChange}
      />
      {fieldStructure && (
        <PositionControl
          doc={doc}
          dispatch={dispatch}
          fieldStructure={fieldStructure}
        />
      )}
      <MarkingsControl
        doc={doc}
        dispatch={dispatch}
        isDefense={isDefense}
        fieldStructure={fieldStructure}
        playbookId={playbookId}
        playbookSettings={playbookSettings}
        onPlaybookSettingsChange={onPlaybookSettingsChange}
      />
      <DisplayControl
        doc={doc}
        dispatch={dispatch}
        fieldStructure={fieldStructure}
        playbookId={playbookId}
        playbookSettings={playbookSettings}
        onPlaybookSettingsChange={onPlaybookSettingsChange}
      />
      <FieldLegend
        doc={doc}
        fieldStructure={fieldStructure}
        isDefense={isDefense}
        playbookColor={playbookColor}
      />
      <div className="ml-auto">
        {playbookId && playbookSettings && (
          <SaveAsTeamDefaultButton
            doc={doc}
            playbookId={playbookId}
            playbookSettings={playbookSettings}
          />
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/*  Legend (visible-marking key)                                     */
/* ───────────────────────────────────────────────────────────────── */

function FieldLegend({
  doc,
  fieldStructure,
  isDefense,
  playbookColor,
}: {
  doc: PlayDocument;
  fieldStructure: FieldStructure | null;
  isDefense: boolean;
  playbookColor: string | null;
}) {
  const teamColor = playbookColor || "#F26522";
  // Only items the coach is actually seeing on the field show up — match
  // the renderer's visibility checks (toggle on + structure supports it +
  // at least one yardage falls inside the visible 25-yd window). Keeps
  // the legend in lockstep with what's drawn.
  const items: { key: string; label: string; swatch: React.ReactNode }[] = [];
  if (fieldStructure) {
    const ball = resolveFieldPositionYds(doc, fieldStructure);
    const losYd =
      typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4;
    const winLen = doc.sportProfile.fieldLengthYds || 25;
    const bottom = ball - losYd * winLen;
    const top = bottom + winLen;
    const inWindow = (m: number) => m >= bottom && m <= top;

    if (resolveShowEndzones(doc) && fieldStructure.endzoneDepthYds > 0) {
      const ownVisible = inWindow(0) || inWindow(-fieldStructure.endzoneDepthYds);
      const oppVisible =
        inWindow(fieldStructure.fieldLengthYds) ||
        inWindow(fieldStructure.fieldLengthYds + fieldStructure.endzoneDepthYds);
      if (ownVisible) {
        items.push({
          key: "ez-own",
          label: "Own end zone",
          swatch: (
            <span
              aria-hidden
              className="block h-3 w-5 border border-black/15"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(0,0,0,0.30) 0 2px, rgba(255,255,255,0.50) 2px 4px)",
              }}
            />
          ),
        });
      }
      if (oppVisible) {
        items.push({
          key: "ez-opp",
          label: "Scoring end zone",
          swatch: (
            <span
              aria-hidden
              className="block h-3 w-5 border border-black/15"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, currentColor 0 2px, transparent 2px 4px)",
                color: teamColor,
              }}
            />
          ),
        });
      }
    }

    if (resolveShowNoRunZones(doc) && fieldStructure.noRunZones.length > 0) {
      // A zone is visible if the marker edge OR the band's far edge
      // falls inside the visible 25-yd window.
      const anyVisible = fieldStructure.noRunZones.some(
        (z) => inWindow(z.atYd) || inWindow(z.atYd - z.depthYds),
      );
      if (anyVisible) {
        items.push({
          key: "no-run",
          label: "No-run zone",
          swatch: (
            <span
              aria-hidden
              className="block h-3 w-5 border border-amber-600/60"
              style={{ backgroundColor: "rgba(250,204,21,0.55)" }}
            />
          ),
        });
      }
    }

    // First-down line visibility: per-play LOS-relative override only
    // (no league-fixed fallback — those belong to "Down markers" below).
    const fdPerPlay = doc.firstDownLineYards;
    const fdVisible =
      resolveShowFirstDownLine(doc) && typeof fdPerPlay === "number";
    if (fdVisible) {
      items.push({
        key: "fd",
        label: "First-down line",
        swatch: (
          <span
            aria-hidden
            className="block h-1 w-5"
            style={{
              // Dashed lime — matches the renderer's stroke-dasharray="6 4".
              backgroundImage:
                "linear-gradient(to right, #84CC16 60%, transparent 60%)",
              backgroundSize: "6px 100%",
            }}
          />
        ),
      });
    }

    if (
      resolveShowDownMarkers(doc) &&
      fieldStructure.firstDownLineYds.some(inWindow)
    ) {
      items.push({
        key: "dm",
        label: "Down marker",
        swatch: (
          <span
            aria-hidden
            className="block h-1 w-5 rounded-sm"
            style={{ backgroundColor: "#F97316" }}
          />
        ),
      });
    }
  }
  // Rush line: available on any play type. Renderer falls back to true on
  // defense for legacy plays (default-on); on offense it's opt-in via the
  // Markings toggle.
  if (
    (doc.showRushLine ?? isDefense) &&
    (doc.showRushLine !== false)
  ) {
    items.push({
      key: "rush",
      label: "Rush line",
      swatch: (
        <span
          aria-hidden
          className="block h-1 w-5 opacity-80"
          style={{
            backgroundImage:
              "linear-gradient(to right, #94A3B8 50%, transparent 50%)",
            backgroundSize: "4px 100%",
          }}
        />
      ),
    });
  }

  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-muted">
      {items.map((it) => (
        <span key={it.key} className="inline-flex items-center gap-1.5">
          {it.swatch}
          <span>{it.label}</span>
        </span>
      ))}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/*  Window popover (Bkf / Dwn / Full field)                          */
/* ───────────────────────────────────────────────────────────────── */

function FieldControl({
  doc,
  dispatch,
  showFullFieldToggle,
  fullFieldWidth,
  onFullFieldWidthChange,
}: {
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
  showFullFieldToggle: boolean;
  fullFieldWidth: boolean;
  onFullFieldWidthChange?: (next: boolean) => void;
}) {
  const { open, setOpen, wrapRef } = usePopover();
  const backfield = resolveBackfieldYards(doc);
  const downfield = resolveDownfieldYards(doc);

  return (
    <div ref={wrapRef} className="relative">
      <PopoverButton
        label="Field"
        state={`${backfield} / ${downfield}`}
        open={open}
        onToggle={() => setOpen(!open)}
      />
      {open && (
        <Panel>
          <div className="flex flex-col gap-1.5">
            <YardSpinner
              label="Backfield"
              value={backfield}
              min={2}
              max={30}
              onChange={(v) =>
                dispatch({
                  type: "field.setYardage",
                  backfieldYards: v,
                  downfieldYards: downfield,
                })
              }
            />
            <YardSpinner
              label="Downfield"
              value={downfield}
              min={5}
              max={50}
              onChange={(v) =>
                dispatch({
                  type: "field.setYardage",
                  backfieldYards: backfield,
                  downfieldYards: v,
                })
              }
            />
            {showFullFieldToggle && onFullFieldWidthChange && (
              <CheckboxRow
                label="Full-width field"
                checked={fullFieldWidth}
                onChange={onFullFieldWidthChange}
              />
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/*  Position popover (chips + numeric)                               */
/* ───────────────────────────────────────────────────────────────── */

type PositionChip = { label: string; yds: number };

function buildPositionChips(structure: FieldStructure): PositionChip[] {
  const len = structure.fieldLengthYds;
  const noRun = structure.noRunZoneYds;
  const firstDown =
    structure.firstDownLineYds.length > 0
      ? structure.firstDownLineYds[Math.floor(structure.firstDownLineYds.length / 2)]
      : Math.round(len / 2);
  const chips: PositionChip[] = [
    { label: "Own end zone", yds: 1 },
    { label: "Backed up", yds: noRun != null ? noRun + 1 : 5 },
    { label: "Midfield", yds: firstDown },
    { label: "Red zone", yds: Math.max(1, len - 10) },
    { label: "Goal line", yds: Math.max(1, len - 1) },
  ];
  // Dedupe positions that collapse on small fields.
  const seen = new Set<number>();
  return chips.filter((c) => {
    const k = Math.round(c.yds);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function PositionControl({
  doc,
  dispatch,
  fieldStructure,
}: {
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
  fieldStructure: FieldStructure;
}) {
  const { open, setOpen, wrapRef } = usePopover();
  const ball = Math.round(resolveFieldPositionYds(doc, fieldStructure));
  const chips = buildPositionChips(fieldStructure);
  const summary = (() => {
    const half = fieldStructure.fieldLengthYds / 2;
    const distFromOwn = ball;
    const distFromOpp = fieldStructure.fieldLengthYds - ball;
    if (Math.abs(ball - half) < 1) return "Midfield";
    if (distFromOwn < half) return `Own ${Math.min(50, Math.round(distFromOwn))}`;
    return `Opp ${Math.min(50, Math.round(distFromOpp))}`;
  })();

  return (
    <div ref={wrapRef} className="relative">
      <PopoverButton
        label="Position"
        state={summary}
        open={open}
        onToggle={() => setOpen(!open)}
      />
      {open && (
        <Panel width="min-w-[18rem]">
          <div className="mb-2 flex flex-wrap gap-1">
            {chips.map((c) => {
              const active = Math.abs(ball - c.yds) < 1;
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: "document.setFieldPositionYds",
                      fieldPositionYds: c.yds,
                    })
                  }
                  className={`rounded border px-2 py-1 text-[11px] transition ${
                    active
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-surface-inset text-muted hover:bg-surface-raised hover:text-foreground"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 px-1">
            <span className="text-[11px] text-muted">Ball at yard</span>
            <input
              type="number"
              min={0}
              max={fieldStructure.fieldLengthYds}
              value={ball}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                const clamped = Math.max(
                  0,
                  Math.min(fieldStructure.fieldLengthYds, Math.round(v)),
                );
                dispatch({
                  type: "document.setFieldPositionYds",
                  fieldPositionYds: clamped,
                });
              }}
              className="w-16 rounded border border-border bg-surface-inset px-1.5 py-0.5 text-xs text-foreground"
            />
            <span className="text-[11px] text-muted">
              of {fieldStructure.fieldLengthYds}
            </span>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/*  Markings popover                                                  */
/* ───────────────────────────────────────────────────────────────── */

/** Tiny chevron-style "Edit/Add" button used by the No-run zones and
 *  Down markers rows to open their inline editor card. */
function ExpandToggleButton({
  open,
  label,
  onClick,
}: {
  open: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition ${
        open
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-surface-inset text-muted hover:bg-surface-raised hover:text-foreground"
      }`}
      aria-expanded={open}
    >
      <span>{label}</span>
      <svg
        viewBox="0 0 12 12"
        className={`size-2 transition ${open ? "rotate-180" : ""}`}
        fill="none"
        aria-hidden
      >
        <path
          d="M3 4.5l3 3 3-3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/** Inline editor card for the playbook's no-run zones. Each zone is a
 *  `{ atYd, depthYds }` pair. The card lets coaches add/remove zones,
 *  drag yardages, and tune individual band depths — useful for leagues
 *  whose rules deviate from the league preset (e.g. a 5v5 with extra
 *  no-run zones around 1st-down lines, or a 7v7 league that does have
 *  pass-only zones). All edits persist to playbook customStructure. */
function NoRunZonesEditor({
  zones,
  fieldLengthYds,
  onChange,
}: {
  zones: NoRunZoneConfig[];
  fieldLengthYds: number;
  onChange: (next: NoRunZoneConfig[]) => void;
}) {
  const updateZone = (idx: number, patch: Partial<NoRunZoneConfig>) => {
    const next = zones.map((z, i) => (i === idx ? { ...z, ...patch } : z));
    onChange(next);
  };
  const removeZone = (idx: number) => {
    onChange(zones.filter((_, i) => i !== idx));
  };
  const addZone = () => {
    // Suggest a yardage that doesn't already collide with an existing
    // zone — start at midfield, fall back to first non-occupied yard.
    const taken = new Set(zones.map((z) => z.atYd));
    const mid = Math.round(fieldLengthYds / 2);
    let suggested = taken.has(mid) ? mid + 5 : mid;
    while (taken.has(suggested) && suggested < fieldLengthYds) suggested += 1;
    onChange([...zones, { atYd: suggested, depthYds: 5 }]);
  };
  return (
    <div className="ml-6 mt-1 mb-1 flex flex-col gap-1 rounded border border-border bg-surface-inset p-2">
      {zones.length === 0 && (
        <div className="text-[10px] italic text-muted">
          No zones. Add one to draw a pass-only band.
        </div>
      )}
      {zones.map((z, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 text-[11px] text-muted"
        >
          <span>at yd</span>
          <YardNumberInput
            value={z.atYd}
            min={1}
            max={fieldLengthYds}
            onChange={(v) => updateZone(i, { atYd: v })}
          />
          <span>·</span>
          <YardNumberInput
            value={z.depthYds}
            min={1}
            max={fieldLengthYds}
            onChange={(v) => updateZone(i, { depthYds: v })}
          />
          <span>yd deep</span>
          <button
            type="button"
            onClick={() => removeZone(i)}
            aria-label="Remove zone"
            className="ml-auto rounded border border-border bg-surface-raised px-1.5 text-[10px] text-muted hover:border-rose-500/60 hover:text-rose-500"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addZone}
        className="self-start rounded border border-dashed border-border px-2 py-0.5 text-[10px] text-muted hover:border-primary hover:text-foreground"
      >
        + Add zone
      </button>
    </div>
  );
}

/** Inline editor card for the playbook's fixed down-marker yardages.
 *  Each marker is a single league yard from own goal. Sorted ascending
 *  on commit so the renderer's sweep stays deterministic. */
function DownMarkersEditor({
  markers,
  fieldLengthYds,
  onChange,
}: {
  markers: number[];
  fieldLengthYds: number;
  onChange: (next: number[]) => void;
}) {
  const sortAndDedupe = (arr: number[]) =>
    Array.from(new Set(arr.map((n) => Math.round(n)))).sort((a, b) => a - b);
  const updateMarker = (idx: number, value: number) => {
    const next = markers.map((m, i) => (i === idx ? value : m));
    onChange(sortAndDedupe(next));
  };
  const removeMarker = (idx: number) => {
    onChange(markers.filter((_, i) => i !== idx));
  };
  const addMarker = () => {
    const taken = new Set(markers);
    const mid = Math.round(fieldLengthYds / 2);
    let suggested = taken.has(mid) ? mid + 5 : mid;
    while (taken.has(suggested) && suggested < fieldLengthYds) suggested += 1;
    onChange(sortAndDedupe([...markers, suggested]));
  };
  return (
    <div className="ml-6 mt-1 mb-1 flex flex-col gap-1 rounded border border-border bg-surface-inset p-2">
      {markers.length === 0 && (
        <div className="text-[10px] italic text-muted">
          No fixed markers. Add one to draw an orange line.
        </div>
      )}
      {markers.map((m, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 text-[11px] text-muted"
        >
          <span>at yd</span>
          <YardNumberInput
            value={m}
            min={1}
            max={fieldLengthYds}
            onChange={(v) => updateMarker(i, v)}
          />
          <button
            type="button"
            onClick={() => removeMarker(i)}
            aria-label="Remove marker"
            className="ml-auto rounded border border-border bg-surface-raised px-1.5 text-[10px] text-muted hover:border-rose-500/60 hover:text-rose-500"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addMarker}
        className="self-start rounded border border-dashed border-border px-2 py-0.5 text-[10px] text-muted hover:border-primary hover:text-foreground"
      >
        + Add marker
      </button>
    </div>
  );
}

/** Compact numeric input used by the zone/marker editors. Commits on
 *  blur or Enter so dragging the spinner doesn't fire a save per keystroke. */
function YardNumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const commit = () => {
    const n = Number(draft);
    if (!Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, Math.round(n)));
    if (clamped !== value) onChange(clamped);
    else setDraft(String(value));
  };
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="w-12 rounded border border-border bg-surface-raised px-1 py-0.5 text-center text-xs text-foreground tabular-nums"
    />
  );
}

const HASH_OPTIONS: { value: HashStyle; label: string; hint: string }[] = [
  { value: "none", label: "Off", hint: "" },
  { value: "narrow", label: "Narrow", hint: "NFL" },
  { value: "normal", label: "Normal", hint: "College" },
  { value: "wide", label: "Wide", hint: "HS / Youth" },
];

function MarkingsControl({
  doc,
  dispatch,
  isDefense,
  fieldStructure,
  playbookId,
  playbookSettings,
  onPlaybookSettingsChange,
}: {
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
  isDefense: boolean;
  fieldStructure: FieldStructure | null;
  playbookId?: string;
  playbookSettings?: PlaybookSettings;
  onPlaybookSettingsChange?: (next: PlaybookSettings) => void;
}) {
  const [expanded, setExpanded] = useState<"noRun" | "markers" | null>(null);
  const canPersistStructure =
    !!playbookId && !!playbookSettings && !!onPlaybookSettingsChange;
  const { open, setOpen, wrapRef } = usePopover();
  const showEndzones = resolveShowEndzones(doc);
  const showNoRunZones = resolveShowNoRunZones(doc);
  const showFirstDownLine = resolveShowFirstDownLine(doc);
  const showDownMarkers = resolveShowDownMarkers(doc);
  const rotated = resolveRotatedYardNumbers(doc);
  const hashOn = resolveShowHashMarks(doc);
  const hashStyle = resolveHashStyle(doc);
  const showYardNumbers = resolveShowYardNumbers(doc);
  const losStyle = resolveLineOfScrimmage(doc);
  const showRushLine = doc.showRushLine ?? true;
  const rushLineYards = doc.rushLineYards ?? 7;
  const noRunZones = fieldStructure?.noRunZones ?? [];
  const downMarkers = fieldStructure?.firstDownLineYds ?? [];
  const fieldLengthForEdit = fieldStructure?.fieldLengthYds ?? 100;

  const onCount = [
    showEndzones,
    showNoRunZones && noRunZones.length > 0,
    showFirstDownLine && typeof doc.firstDownLineYards === "number",
    showDownMarkers && downMarkers.length > 0,
    showYardNumbers,
    hashOn,
    isDefense && showRushLine,
  ].filter(Boolean).length;

  // Helper that patches `customStructure` and persists. Used by both
  // zone editors so they share optimistic-update + server-save plumbing.
  const patchCustomStructure = (patch: Partial<FieldStructure>) => {
    if (!canPersistStructure) return;
    const current = playbookSettings!.fieldDisplay.customStructure ?? {};
    const merged = { ...current, ...patch };
    const customStructure = Object.keys(merged).length > 0 ? merged : null;
    const nextFieldDisplay = {
      ...playbookSettings!.fieldDisplay,
      customStructure,
    };
    onPlaybookSettingsChange!({
      ...playbookSettings!,
      fieldDisplay: nextFieldDisplay,
    });
    void updatePlaybookFieldDisplayAction(playbookId!, nextFieldDisplay);
  };

  return (
    <div ref={wrapRef} className="relative">
      <PopoverButton
        label="Markings"
        state={`${onCount} on`}
        open={open}
        onToggle={() => setOpen(!open)}
      />
      {open && (
        <Panel width="min-w-[20rem]">
          <div className="flex flex-col gap-0.5">
            {fieldStructure && (
              <>
                <CheckboxRow
                  label="Endzones"
                  checked={showEndzones}
                  onChange={(v) =>
                    dispatch({ type: "document.setShowEndzones", showEndzones: v })
                  }
                />
                <CheckboxRow
                  label={
                    noRunZones.length === 0
                      ? "No-run zones (none)"
                      : `No-run zones (${noRunZones.length})`
                  }
                  checked={showNoRunZones}
                  onChange={(v) =>
                    dispatch({
                      type: "document.setShowNoRunZones",
                      showNoRunZones: v,
                    })
                  }
                  rightSlot={
                    canPersistStructure ? (
                      <ExpandToggleButton
                        open={expanded === "noRun"}
                        label={noRunZones.length > 0 ? "Edit" : "Add"}
                        onClick={() =>
                          setExpanded((cur) => (cur === "noRun" ? null : "noRun"))
                        }
                      />
                    ) : undefined
                  }
                />
                {expanded === "noRun" && canPersistStructure && (
                  <NoRunZonesEditor
                    zones={noRunZones}
                    fieldLengthYds={fieldLengthForEdit}
                    onChange={(zones) => patchCustomStructure({ noRunZones: zones })}
                  />
                )}
                <CheckboxRow
                  label="First-down line"
                  checked={showFirstDownLine}
                  onChange={(v) =>
                    dispatch({
                      type: "document.setShowFirstDownLine",
                      showFirstDownLine: v,
                    })
                  }
                  rightSlot={
                    showFirstDownLine && (
                      <YardFromLosSpinner
                        value={
                          typeof doc.firstDownLineYards === "number"
                            ? doc.firstDownLineYards
                            : (downMarkers.length > 0
                                ? Math.round(
                                    (downMarkers[0] ?? 0) -
                                      ballLeagueYdsFromLos(doc),
                                  )
                                : 10)
                        }
                        onChange={(v) =>
                          dispatch({
                            type: "document.setFirstDownLineYards",
                            firstDownLineYards: v,
                          })
                        }
                      />
                    )
                  }
                />
                <CheckboxRow
                  label={
                    downMarkers.length === 0
                      ? "Down markers (orange) — none"
                      : downMarkers.length === 1
                        ? `Down marker at ${downMarkers[0]} yd`
                        : `Down markers at ${downMarkers.join(", ")} yd`
                  }
                  checked={showDownMarkers}
                  onChange={(v) =>
                    dispatch({
                      type: "document.setShowDownMarkers",
                      showDownMarkers: v,
                    })
                  }
                  rightSlot={
                    canPersistStructure ? (
                      <ExpandToggleButton
                        open={expanded === "markers"}
                        label={downMarkers.length > 0 ? "Edit" : "Add"}
                        onClick={() =>
                          setExpanded((cur) =>
                            cur === "markers" ? null : "markers",
                          )
                        }
                      />
                    ) : undefined
                  }
                />
                {expanded === "markers" && canPersistStructure && (
                  <DownMarkersEditor
                    markers={downMarkers}
                    fieldLengthYds={fieldLengthForEdit}
                    onChange={(markers) =>
                      patchCustomStructure({ firstDownLineYds: markers })
                    }
                  />
                )}
                <div className="my-1 h-px bg-border" />
              </>
            )}
            <CheckboxRow
              label="Yard numbers"
              checked={showYardNumbers}
              onChange={(v) =>
                dispatch({
                  type: "document.setShowYardNumbers",
                  showYardNumbers: v,
                })
              }
              rightSlot={
                <label className="flex cursor-pointer items-center gap-1">
                  <input
                    type="checkbox"
                    className="size-3 cursor-pointer accent-primary"
                    checked={rotated}
                    onChange={(e) =>
                      dispatch({
                        type: "document.setRotatedYardNumbers",
                        rotatedYardNumbers: e.target.checked,
                      })
                    }
                  />
                  rotated
                </label>
              }
            />
            <div className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs">
              <span className="text-foreground">Hash marks</span>
              <SegmentedControl
                size="sm"
                options={HASH_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
                value={hashStyle}
                onChange={(v) =>
                  dispatch({ type: "document.setHashStyle", hashStyle: v })
                }
              />
            </div>
            <HashOverrideInput doc={doc} dispatch={dispatch} />
            <div className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs">
              <span className="text-foreground">LOS</span>
              <SegmentedControl
                size="sm"
                options={[
                  { value: "line" as const, label: "Line" },
                  { value: "football" as const, label: "Ball" },
                  { value: "none" as const, label: "None" },
                ]}
                value={losStyle}
                onChange={(v) =>
                  dispatch({
                    type: "document.setLineOfScrimmage",
                    lineOfScrimmage: v,
                  })
                }
              />
            </div>
            <div className="my-1 h-px bg-border" />
            <CheckboxRow
              label="Rush line"
              checked={showRushLine}
              onChange={(v) =>
                dispatch({ type: "document.setShowRushLine", showRushLine: v })
              }
              rightSlot={
                showRushLine && (
                  <YardSpinner
                    label=""
                    value={rushLineYards}
                    min={4}
                    max={15}
                    onChange={(v) =>
                      dispatch({
                        type: "document.setRushLineYards",
                        rushLineYards: v,
                      })
                    }
                  />
                )
              }
            />
          </div>
        </Panel>
      )}
    </div>
  );
}

/** Compact +/- yards-from-LOS spinner used by First-down line and
 *  Down marker rows in the Markings popover. */
function YardFromLosSpinner({
  value,
  onChange,
  min = 0,
  max = 50,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const safe = Math.max(min, Math.min(max, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        aria-label="Decrease"
        disabled={safe <= min}
        onClick={() => onChange(Math.max(min, safe - 1))}
        className="flex size-5 items-center justify-center rounded border border-border bg-surface-inset text-xs text-muted hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      >
        −
      </button>
      <span className="w-7 text-center text-xs font-medium tabular-nums text-foreground">
        {safe}
      </span>
      <button
        type="button"
        aria-label="Increase"
        disabled={safe >= max}
        onClick={() => onChange(Math.min(max, safe + 1))}
        className="flex size-5 items-center justify-center rounded border border-border bg-surface-inset text-xs text-muted hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      >
        +
      </button>
      <span className="text-[10px] text-muted">yds</span>
    </span>
  );
}

/** Yards from LOS to a fieldStructure-absolute yardage. Used to seed the
 *  per-play first-down line spinner from the league-fixed line when the
 *  coach hasn't set a per-play override yet. */
function ballLeagueYdsFromLos(doc: PlayDocument): number {
  if (typeof doc.fieldPositionYds !== "number") return 0;
  return doc.fieldPositionYds;
}

/** Numeric override for hash spacing (left/right column as fractions of
 *  field width). When both are blank, the named hash style wins. */
function HashOverrideInput({
  doc,
  dispatch,
}: {
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
}) {
  const override = doc.hashColumns;
  const [left, setLeft] = useState(
    override ? Math.round(override[0] * 100).toString() : "",
  );
  const [right, setRight] = useState(
    override ? Math.round(override[1] * 100).toString() : "",
  );

  useEffect(() => {
    setLeft(override ? Math.round(override[0] * 100).toString() : "");
    setRight(override ? Math.round(override[1] * 100).toString() : "");
  }, [override]);

  const commit = (l: string, r: string) => {
    const lv = Number(l);
    const rv = Number(r);
    if (!Number.isFinite(lv) || !Number.isFinite(rv)) return;
    const lf = lv / 100;
    const rf = rv / 100;
    if (lf < 0.05 || rf > 0.95 || lf >= rf) return;
    dispatch({
      type: "document.setHashColumns",
      hashColumns: [lf, rf],
    });
  };

  const clear = () => {
    setLeft("");
    setRight("");
    dispatch({ type: "document.setHashColumns", hashColumns: undefined });
  };

  return (
    <div className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] text-muted">
      <span>Hash override</span>
      <input
        type="number"
        min={5}
        max={95}
        placeholder="L%"
        value={left}
        onChange={(e) => setLeft(e.target.value)}
        onBlur={() => commit(left, right)}
        className="w-12 rounded border border-border bg-surface-inset px-1 py-0.5 text-xs text-foreground"
      />
      <input
        type="number"
        min={5}
        max={95}
        placeholder="R%"
        value={right}
        onChange={(e) => setRight(e.target.value)}
        onBlur={() => commit(left, right)}
        className="w-12 rounded border border-border bg-surface-inset px-1 py-0.5 text-xs text-foreground"
      />
      {override && (
        <button
          type="button"
          onClick={clear}
          className="text-[10px] text-muted underline hover:text-foreground"
        >
          clear
        </button>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/*  Display popover (background)                                     */
/* ───────────────────────────────────────────────────────────────── */

const BG_SWATCHES: {
  value: "green" | "white" | "gray" | "black";
  swatch: string;
  label: string;
}[] = [
  { value: "green", swatch: "#2D8B4E", label: "Green" },
  { value: "white", swatch: "#FFFFFF", label: "White" },
  { value: "gray", swatch: "#E5E7EB", label: "Gray" },
  { value: "black", swatch: "#0A0A0A", label: "Black" },
];

function DisplayControl({
  doc,
  dispatch,
  fieldStructure,
  playbookId,
  playbookSettings,
  onPlaybookSettingsChange,
}: {
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
  fieldStructure: FieldStructure | null;
  playbookId?: string;
  playbookSettings?: PlaybookSettings;
  onPlaybookSettingsChange?: (next: PlaybookSettings) => void;
}) {
  const { open, setOpen, wrapRef } = usePopover();
  const bg = doc.fieldBackground ?? "green";
  const current = BG_SWATCHES.find((s) => s.value === bg) ?? BG_SWATCHES[0];

  return (
    <div ref={wrapRef} className="relative">
      <PopoverButton
        label="Display"
        state={current.label}
        open={open}
        onToggle={() => setOpen(!open)}
      />
      {open && (
        <Panel width="min-w-[16rem]">
          <div className="px-1 pb-1 text-[11px] text-muted">Background</div>
          <div className="flex flex-wrap gap-1.5 px-1">
            {BG_SWATCHES.map((s) => {
              const active = bg === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: "document.setFieldBackground",
                      background: s.value,
                    })
                  }
                  title={s.label}
                  className={`flex size-7 items-center justify-center rounded border transition ${
                    active
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-border hover:border-foreground/40"
                  }`}
                  style={{ background: s.swatch }}
                  aria-label={s.label}
                />
              );
            })}
          </div>
          {fieldStructure && playbookId && playbookSettings && (
            <FieldDimensions
              fieldStructure={fieldStructure}
              playbookId={playbookId}
              playbookSettings={playbookSettings}
              onPlaybookSettingsChange={onPlaybookSettingsChange}
            />
          )}
        </Panel>
      )}
    </div>
  );
}

/** Width / length spinners that persist to the playbook's
 *  fieldDisplay.customStructure. Defaults come from the league preset
 *  (resolved into fieldStructure); coaches can dial them up or down in
 *  5-yard increments for non-standard fields. */
function FieldDimensions({
  fieldStructure,
  playbookId,
  playbookSettings,
  onPlaybookSettingsChange,
}: {
  fieldStructure: FieldStructure;
  playbookId: string;
  playbookSettings: PlaybookSettings;
  onPlaybookSettingsChange?: (next: PlaybookSettings) => void;
}) {
  const [pending, startTransition] = useTransition();
  // Width nudges in 5-yd steps (handful-of-yards changes match how
  // coaches think about field margins). Length uses 10-yd steps because
  // that matches the natural unit of field length — a 50-yd field +10
  // → 60, +10 → 70, etc.
  const WIDTH_STEP = 5;
  const LENGTH_STEP = 10;
  const widthOptions = { min: 15, max: 100 };
  const lengthOptions = { min: 20, max: 200 };

  const setOverride = (patch: { fieldWidthYds?: number; fieldLengthYds?: number }) => {
    const current = playbookSettings.fieldDisplay.customStructure ?? {};
    const merged = { ...current, ...patch };
    const customStructure = Object.keys(merged).length > 0 ? merged : null;
    const nextFieldDisplay = {
      ...playbookSettings.fieldDisplay,
      customStructure,
    };
    // Optimistic local update so the canvas re-shapes immediately. The
    // server save runs in parallel; if it fails, the in-memory state is
    // ahead of the DB until the next page load reconciles.
    onPlaybookSettingsChange?.({
      ...playbookSettings,
      fieldDisplay: nextFieldDisplay,
    });
    startTransition(async () => {
      await updatePlaybookFieldDisplayAction(playbookId, nextFieldDisplay);
    });
  };

  const stepWidth = (delta: number) => {
    const next = Math.max(
      widthOptions.min,
      Math.min(widthOptions.max, Math.round(fieldStructure.fieldWidthYds + delta)),
    );
    if (next !== fieldStructure.fieldWidthYds) setOverride({ fieldWidthYds: next });
  };
  const stepLength = (delta: number) => {
    const next = Math.max(
      lengthOptions.min,
      Math.min(lengthOptions.max, Math.round(fieldStructure.fieldLengthYds + delta)),
    );
    if (next !== fieldStructure.fieldLengthYds) setOverride({ fieldLengthYds: next });
  };

  return (
    <div className="mt-2 border-t border-border pt-2">
      <div className="px-1 pb-1 text-[11px] text-muted">
        Field size (width ±5, length ±10)
      </div>
      <div className="flex flex-col gap-1.5 px-1">
        <DimensionRow
          label="Width"
          value={fieldStructure.fieldWidthYds}
          onDecrease={() => stepWidth(-WIDTH_STEP)}
          onIncrease={() => stepWidth(WIDTH_STEP)}
          disabled={pending}
          atMin={fieldStructure.fieldWidthYds <= widthOptions.min}
          atMax={fieldStructure.fieldWidthYds >= widthOptions.max}
        />
        <DimensionRow
          label="Length"
          value={fieldStructure.fieldLengthYds}
          onDecrease={() => stepLength(-LENGTH_STEP)}
          onIncrease={() => stepLength(LENGTH_STEP)}
          disabled={pending}
          atMin={fieldStructure.fieldLengthYds <= lengthOptions.min}
          atMax={fieldStructure.fieldLengthYds >= lengthOptions.max}
        />
      </div>
    </div>
  );
}

function DimensionRow({
  label,
  value,
  onDecrease,
  onIncrease,
  disabled,
  atMin,
  atMax,
}: {
  label: string;
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  disabled?: boolean;
  atMin?: boolean;
  atMax?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={disabled || atMin}
          onClick={onDecrease}
          className="flex size-5 items-center justify-center rounded border border-border bg-surface-inset text-xs text-muted hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
        >
          −
        </button>
        <span className="w-10 text-center text-xs font-medium tabular-nums text-foreground">
          {value}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={disabled || atMax}
          onClick={onIncrease}
          className="flex size-5 items-center justify-center rounded border border-border bg-surface-inset text-xs text-muted hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
        >
          +
        </button>
        <span className="text-[10px] text-muted">yds</span>
      </span>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/*  Save as team default                                             */
/* ───────────────────────────────────────────────────────────────── */

function SaveAsTeamDefaultButton({
  doc,
  playbookId,
  playbookSettings,
}: {
  doc: PlayDocument;
  playbookId: string;
  playbookSettings: PlaybookSettings;
}) {
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    const next = {
      ...playbookSettings.fieldDisplay,
      markingDefaults: markingDefaultsFromPlay(
        {
          fieldBackground: doc.fieldBackground,
          showEndzones: doc.showEndzones,
          showNoRunZones: doc.showNoRunZones,
          showFirstDownLine: doc.showFirstDownLine,
          showDownMarkers: doc.showDownMarkers,
          rotatedYardNumbers: doc.rotatedYardNumbers,
          showHashMarks: doc.showHashMarks,
          hashStyle: doc.hashStyle,
          showYardNumbers: doc.showYardNumbers,
        },
        playbookSettings.fieldDisplay.markingDefaults,
      ),
    };
    startTransition(async () => {
      const r = await updatePlaybookFieldDisplayAction(playbookId, next);
      if (r.ok) {
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 2400);
      } else {
        setError(r.error);
      }
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      {error && <span className="text-[10px] text-rose-500">{error}</span>}
      {savedAt && !error && (
        <span className="text-[10px] text-green-600">Saved.</span>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded border border-border bg-surface-inset px-2 py-1 text-[11px] text-muted hover:bg-surface-raised hover:text-foreground disabled:opacity-50"
        title="Save current field-display settings as the playbook default"
      >
        {pending ? "Saving…" : "Save as team default"}
      </button>
    </div>
  );
}
