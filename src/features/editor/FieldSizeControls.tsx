"use client";

import { useState } from "react";
import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument, SportProfile, SportVariant } from "@/domain/play/types";
import { resolveShowHashMarks } from "@/domain/play/factory";
import { Button, Input } from "@/components/ui";

type Props = {
  profile: SportProfile;
  dispatch: (c: PlayCommand) => void;
  /** Full document — lets us read/toggle hash-marks state. Optional so older
   *  callsites keep compiling. */
  doc?: PlayDocument;
};

type Preset = {
  key: string;
  label: string;
  variant: SportVariant;
  fieldLengthYds: number;
  fieldWidthYds: number;
  offensePlayerCount: number;
};

const PRESETS: Preset[] = [
  {
    key: "flag_5v5",
    label: "Flag 5v5",
    variant: "flag_5v5",
    fieldLengthYds: 30,
    fieldWidthYds: 25,
    offensePlayerCount: 5,
  },
  {
    key: "flag_7v7",
    label: "Flag 7v7",
    variant: "flag_7v7",
    fieldLengthYds: 40,
    fieldWidthYds: 30,
    offensePlayerCount: 7,
  },
  {
    key: "six_man",
    label: "6-man",
    variant: "six_man",
    fieldLengthYds: 40,
    fieldWidthYds: 40,
    offensePlayerCount: 6,
  },
  {
    key: "tackle_11",
    label: "Tackle 11v11",
    variant: "tackle_11",
    fieldLengthYds: 100,
    fieldWidthYds: 53,
    offensePlayerCount: 11,
  },
];

export function FieldSizeControls({ profile, dispatch, doc }: Props) {
  const [showCustom, setShowCustom] = useState(false);
  const [customLen, setCustomLen] = useState(String(profile.fieldLengthYds));
  const [customWid, setCustomWid] = useState(String(profile.fieldWidthYds));

  const matchedPreset = PRESETS.find(
    (p) =>
      p.fieldLengthYds === profile.fieldLengthYds &&
      p.fieldWidthYds === profile.fieldWidthYds &&
      p.variant === profile.variant,
  );

  const applyPreset = (preset: Preset) => {
    dispatch({
      type: "document.setSportProfile",
      patch: {
        variant: preset.variant,
        fieldLengthYds: preset.fieldLengthYds,
        fieldWidthYds: preset.fieldWidthYds,
        offensePlayerCount: preset.offensePlayerCount,
      },
    });
    setShowCustom(false);
  };

  const applyCustom = () => {
    const len = Math.max(5, Math.min(120, Number(customLen) || profile.fieldLengthYds));
    const wid = Math.max(5, Math.min(100, Number(customWid) || profile.fieldWidthYds));
    dispatch({
      type: "document.setSportProfile",
      patch: { fieldLengthYds: len, fieldWidthYds: wid },
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        Field
      </span>

      <div className="flex items-center gap-1">
        {PRESETS.map((p) => {
          const active = matchedPreset?.key === p.key && !showCustom;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-surface-inset text-foreground shadow-sm"
                  : "text-muted hover:bg-surface-inset/50 hover:text-foreground"
              }`}
              title={`${p.fieldLengthYds}×${p.fieldWidthYds} yd`}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setShowCustom((s) => !s)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            showCustom
              ? "bg-surface-inset text-foreground shadow-sm"
              : "text-muted hover:bg-surface-inset/50 hover:text-foreground"
          }`}
        >
          Custom
        </button>
      </div>

      {doc && (
        <label className="ml-2 flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            className="size-3.5 cursor-pointer accent-primary"
            checked={resolveShowHashMarks(doc)}
            onChange={(e) =>
              dispatch({
                type: "document.setShowHashMarks",
                showHashMarks: e.target.checked,
              })
            }
          />
          <span>Hash marks</span>
        </label>
      )}

      <div className="ml-auto text-xs text-muted">
        {profile.fieldLengthYds}L × {profile.fieldWidthYds}W yd
      </div>

      {showCustom && (
        <div className="flex w-full flex-wrap items-center gap-2 border-t border-border pt-2">
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-muted">Length</span>
            <Input
              type="number"
              value={customLen}
              onChange={(e) => setCustomLen(e.target.value)}
              className="w-20"
              min={5}
              max={120}
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-muted">Width</span>
            <Input
              type="number"
              value={customWid}
              onChange={(e) => setCustomWid(e.target.value)}
              className="w-20"
              min={5}
              max={100}
            />
          </label>
          <Button size="sm" variant="primary" onClick={applyCustom}>
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
