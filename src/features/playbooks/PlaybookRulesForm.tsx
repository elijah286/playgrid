"use client";

import type { PlaybookSettings } from "@/domain/playbook/settings";

type Props = {
  value: PlaybookSettings;
  onChange: (next: PlaybookSettings) => void;
  disabled?: boolean;
};

/**
 * Compact fieldset used inside the Create-playbook and Customize-team dialogs
 * to edit rushing/handoffs/blocking/max-players. Stateless — the parent owns
 * the PlaybookSettings value and decides what defaults to pre-fill.
 */
export function PlaybookRulesForm({ value, onChange, disabled }: Props) {
  const set = <K extends keyof PlaybookSettings>(key: K, v: PlaybookSettings[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-inset/40 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        Game rules
      </p>

      <Row
        label="Rushing allowed"
        disabled={disabled}
        checked={value.rushingAllowed}
        onChange={(c) => set("rushingAllowed", c)}
      />
      {value.rushingAllowed && (
        <label className="ml-6 flex items-center gap-2 text-xs text-muted">
          <span>Required yardage from LOS</span>
          <input
            type="number"
            min={0}
            max={30}
            step={1}
            value={value.rushingYards ?? 0}
            disabled={disabled}
            onChange={(e) => set("rushingYards", Math.max(0, Number(e.target.value) || 0))}
            className="w-16 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
          />
          <span>yds</span>
        </label>
      )}

      <Row
        label="Handoffs allowed"
        disabled={disabled}
        checked={value.handoffsAllowed}
        onChange={(c) => set("handoffsAllowed", c)}
      />
      <Row
        label="Blocking allowed"
        disabled={disabled}
        checked={value.blockingAllowed}
        onChange={(c) => set("blockingAllowed", c)}
      />

      <label className="flex items-center justify-between gap-2 text-sm text-foreground">
        <span>Number of players</span>
        <input
          type="number"
          min={1}
          max={15}
          step={1}
          value={value.maxPlayers}
          disabled={disabled}
          onChange={(e) =>
            set("maxPlayers", Math.max(1, Math.min(15, Number(e.target.value) || 1)))
          }
          className="w-16 rounded-md border border-border bg-surface-raised px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
        />
      </label>
    </div>
  );
}

function Row({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (c: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm text-foreground">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-border text-primary focus:ring-primary"
      />
    </label>
  );
}
