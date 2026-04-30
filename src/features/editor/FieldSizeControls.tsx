"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument } from "@/domain/play/types";
import {
  resolveBackfieldYards,
  resolveDownfieldYards,
  resolveFieldZone,
  resolveHashStyle,
  resolveLineOfScrimmage,
  resolveShowYardNumbers,
  type HashStyle,
} from "@/domain/play/factory";
import { SegmentedControl } from "@/components/ui";

type Props = {
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
  /** Show the "Full field" toggle. Hidden when the variant's natural width
   *  already fits in the narrow viewport (flag, etc.). */
  showFullFieldToggle?: boolean;
  fullFieldWidth?: boolean;
  onFullFieldWidthChange?: (next: boolean) => void;
};

/** Small +/- spinner for an integer yard value. */
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
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-muted">{label}</span>
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

export function FieldSizeControls({
  doc,
  dispatch,
  showFullFieldToggle = false,
  fullFieldWidth = false,
  onFullFieldWidthChange,
}: Props) {
  const backfield = resolveBackfieldYards(doc);
  const downfield = resolveDownfieldYards(doc);
  const isDefense = doc.metadata.playType === "defense";
  const rushLineYards = doc.rushLineYards ?? 7;
  const showRushLine = doc.showRushLine ?? true;

  const handleYards = (bk: number, dn: number) => {
    dispatch({ type: "field.setYardage", backfieldYards: bk, downfieldYards: dn });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2">
      {/* Yard window spinners */}
      <YardSpinner
        label="Bkf"
        value={backfield}
        min={2}
        max={30}
        onChange={(v) => handleYards(v, downfield)}
      />
      <YardSpinner
        label="Dwn"
        value={downfield}
        min={5}
        max={50}
        onChange={(v) => handleYards(backfield, v)}
      />

      <div className="h-4 w-px bg-border" />

      {/* Hash marks — short click toggles on/off; long-press opens width picker. */}
      <HashesControl doc={doc} dispatch={dispatch} />

      {/* Yard numbers */}
      <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted">
        <input
          type="checkbox"
          className="size-3.5 cursor-pointer accent-primary"
          checked={resolveShowYardNumbers(doc)}
          onChange={(e) =>
            dispatch({
              type: "document.setShowYardNumbers",
              showYardNumbers: e.target.checked,
            })
          }
        />
        <span>Numbers</span>
      </label>

      {/* LOS style */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted">LOS</span>
        <SegmentedControl
          size="sm"
          options={[
            { value: "line" as const, label: "Line" },
            { value: "football" as const, label: "Ball" },
            { value: "none" as const, label: "None" },
          ]}
          value={resolveLineOfScrimmage(doc)}
          onChange={(v) =>
            dispatch({ type: "document.setLineOfScrimmage", lineOfScrimmage: v })
          }
        />
      </div>

      {isDefense && (
        <>
          <div className="h-4 w-px bg-border" />
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              className="size-3.5 cursor-pointer accent-primary"
              checked={showRushLine}
              onChange={(e) =>
                dispatch({
                  type: "document.setShowRushLine",
                  showRushLine: e.target.checked,
                })
              }
            />
            <span>Rush line</span>
          </label>
          {showRushLine && (
            <YardSpinner
              label="Rush"
              value={rushLineYards}
              min={6}
              max={8}
              onChange={(v) =>
                dispatch({ type: "document.setRushLineYards", rushLineYards: v })
              }
            />
          )}
        </>
      )}

      {showFullFieldToggle && onFullFieldWidthChange && (
        <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            className="size-3.5 cursor-pointer accent-primary"
            checked={fullFieldWidth}
            onChange={(e) => onFullFieldWidthChange(e.target.checked)}
          />
          <span>Full field</span>
        </label>
      )}

      {/* Field zone */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted">Zone</span>
        <SegmentedControl
          size="sm"
          options={[
            { value: "midfield" as const, label: "Mid" },
            { value: "red_zone" as const, label: "Red" },
          ]}
          value={resolveFieldZone(doc)}
          onChange={(v) =>
            dispatch({ type: "document.setFieldZone", fieldZone: v })
          }
        />
      </div>
    </div>
  );
}

const HASH_OPTIONS: {
  value: Exclude<HashStyle, "none">;
  label: string;
  hint: string;
}[] = [
  { value: "narrow", label: "Narrow", hint: "NFL" },
  { value: "normal", label: "Normal", hint: "College" },
  { value: "wide", label: "Wide", hint: "High School / Youth" },
];

function HashesControl({
  doc,
  dispatch,
}: {
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
}) {
  const style = resolveHashStyle(doc);
  const on = style !== "none";
  const [open, setOpen] = useState(false);
  const lastNonNone = useRef<Exclude<HashStyle, "none">>(
    style === "none" ? "normal" : style,
  );
  useEffect(() => {
    if (style !== "none") lastNonNone.current = style;
  }, [style]);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  const startPress = () => {
    suppressClick.current = false;
    pressTimer.current = setTimeout(() => {
      suppressClick.current = true;
      setOpen(true);
    }, 450);
  };
  const endPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

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

  const setStyle = (s: HashStyle) => {
    dispatch({ type: "document.setHashStyle", hashStyle: s });
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted"
        onMouseDown={startPress}
        onMouseUp={endPress}
        onMouseLeave={endPress}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        onTouchCancel={endPress}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          setStyle(on ? "none" : lastNonNone.current);
        }}
        title="Click to toggle. Hold (or right-click) for width options."
      >
        <span
          aria-hidden
          className={`flex size-3.5 items-center justify-center rounded-[3px] border ${
            on
              ? "border-primary bg-primary text-white"
              : "border-border bg-surface-inset"
          }`}
        >
          {on && (
            <svg viewBox="0 0 12 12" className="size-2.5" fill="none">
              <path
                d="M2.5 6.5l2.5 2.5 4.5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        <span>Hashes</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 min-w-[10rem] rounded-md border border-border bg-surface-raised p-1 shadow-lg"
        >
          {HASH_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="menuitemradio"
              aria-checked={style === opt.value}
              onClick={() => setStyle(opt.value)}
              className={`flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-xs hover:bg-surface-inset ${
                style === opt.value ? "text-foreground" : "text-muted"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={`size-1.5 rounded-full ${
                    style === opt.value ? "bg-primary" : "bg-border"
                  }`}
                />
                {opt.label}
              </span>
              <span className="text-[10px] text-muted">{opt.hint}</span>
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitemradio"
            aria-checked={style === "none"}
            onClick={() => setStyle("none")}
            className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs hover:bg-surface-inset ${
              style === "none" ? "text-foreground" : "text-muted"
            }`}
          >
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${
                style === "none" ? "bg-primary" : "bg-border"
              }`}
            />
            None
          </button>
        </div>
      )}
    </div>
  );
}
