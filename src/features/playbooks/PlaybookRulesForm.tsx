"use client";

import {
  defaultFieldDisplayForVariant,
  type PlaybookSettings,
  type RuleCapability,
} from "@/domain/playbook/settings";
import {
  LEAGUE_PRESETS,
  presetsForVariant,
  resolveFieldStructure,
  type LeaguePreset,
} from "@/domain/play/leaguePresets";
import type { SportVariant } from "@/domain/play/types";

type Props = {
  value: PlaybookSettings;
  onChange: (next: PlaybookSettings) => void;
  disabled?: boolean;
  hideHeader?: boolean;
  /** When provided, the league preset picker filters to presets that
   *  apply to this variant. Without it, all presets are shown. */
  sportVariant?: SportVariant;
};

/**
 * Compact fieldset used inside the Create-playbook and Customize-team dialogs
 * to edit rushing/handoffs/blocking/max-players + the league preset that
 * drives field rendering. Stateless — the parent owns the PlaybookSettings
 * value and decides what defaults to pre-fill.
 */
export function PlaybookRulesForm({
  value,
  onChange,
  disabled,
  hideHeader,
  sportVariant,
}: Props) {
  const set = <K extends keyof PlaybookSettings>(key: K, v: PlaybookSettings[K]) =>
    onChange({ ...value, [key]: v });

  const handleLeaguePreset = (preset: LeaguePreset) => {
    // Switching the league preset replaces the structural numbers + the
    // marking visibility defaults. Coach-tweaked overrides on the play
    // are unaffected; only the playbook-level config changes.
    if (preset === value.fieldDisplay.leaguePreset) return;
    onChange({
      ...value,
      fieldDisplay: {
        leaguePreset: preset,
        customStructure: null,
        markingDefaults: { ...LEAGUE_PRESETS[preset].markingDefaults },
      },
    });
  };

  const presets = sportVariant
    ? presetsForVariant(sportVariant)
    : Object.values(LEAGUE_PRESETS);
  // Always include the playbook's currently saved preset, even if it's not
  // in the filtered list (e.g. variant changed mid-flight).
  const currentPresetId = value.fieldDisplay.leaguePreset;
  const presetIds = new Set(presets.map((p) => p.id));
  const visiblePresets = presetIds.has(currentPresetId)
    ? presets
    : [LEAGUE_PRESETS[currentPresetId], ...presets];

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-inset/40 p-3">
      {!hideHeader && (
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Game rules
        </p>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground">League / field preset</p>
        <select
          value={currentPresetId}
          onChange={(e) => handleLeaguePreset(e.target.value as LeaguePreset)}
          disabled={disabled}
          className="w-full rounded-md border border-border bg-surface-raised px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
        >
          {visiblePresets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-muted">
          {LEAGUE_PRESETS[currentPresetId].description}
        </p>
        {/* Endzone depth — exposed because some leagues vary (5 yds for
         *  some flag rec, 10 yds standard). Editing this shifts the
         *  preset into a custom-overridden state for that single value. */}
        <FieldStructureEditor
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
        {sportVariant && currentPresetId !== "custom" && (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...value,
                fieldDisplay: defaultFieldDisplayForVariant(sportVariant),
              })
            }
            disabled={disabled}
            className="text-[11px] text-muted underline hover:text-foreground"
          >
            Reset field defaults to preset
          </button>
        )}
      </div>

      <div className="my-1 h-px bg-border" />

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
      <Row
        label="Center is eligible receiver"
        disabled={disabled}
        checked={value.centerIsEligible}
        onChange={(c) => set("centerIsEligible", c)}
      />

      <div className="my-1 h-px bg-border" />

      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        Advanced Coach Cal concepts
      </p>
      <p className="text-[11px] leading-snug text-muted">
        Opt in per capability. Cal will recommend and diagram these
        only when enabled — leave off if your league or team isn't ready.
      </p>
      <CapabilityRow
        label="Designed QB runs"
        sublabel="QB Draw, QB Power, QB Counter, QB Sneak"
        capability="designed_qb_run"
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      <CapabilityRow
        label="Multi-handoff plays"
        sublabel="Reverses, jet reverses, double reverses"
        capability="handoff_chain"
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      <CapabilityRow
        label="Run-pass options (RPOs)"
        sublabel="QB reads a key defender, then gives or throws"
        capability="rpo_read"
        value={value}
        onChange={onChange}
        disabled={disabled}
      />

      <div className="my-1 h-px bg-border" />

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

/** Numeric overrides on top of the league preset's structural values.
 *  Today only the endzone depth is surfaced — field length and no-run
 *  yardage stay locked to the preset because the built-in presets cover
 *  the leagues coaches in our data actually run. Add more rows here when
 *  custom-league setups need them. */
function FieldStructureEditor({
  value,
  onChange,
  disabled,
}: {
  value: PlaybookSettings;
  onChange: (next: PlaybookSettings) => void;
  disabled?: boolean;
}) {
  const fd = value.fieldDisplay;
  const resolved = resolveFieldStructure(fd.leaguePreset, fd.customStructure);
  const presetEzDepth =
    LEAGUE_PRESETS[fd.leaguePreset].structure.endzoneDepthYds;
  const isOverridden = resolved.endzoneDepthYds !== presetEzDepth;

  function setEndzoneDepth(next: number) {
    const clamped = Math.max(0, Math.min(20, Math.round(next)));
    const overrides = { ...(fd.customStructure ?? {}), endzoneDepthYds: clamped };
    // If the override matches the preset, drop it so the preset wins again.
    const prunedOverrides =
      clamped === presetEzDepth
        ? (() => {
            const o = { ...overrides };
            delete (o as { endzoneDepthYds?: number }).endzoneDepthYds;
            return o;
          })()
        : overrides;
    const hasAnyOverride = Object.keys(prunedOverrides).length > 0;
    onChange({
      ...value,
      fieldDisplay: {
        ...fd,
        customStructure: hasAnyOverride ? prunedOverrides : null,
      },
    });
  }

  return (
    <label className="flex items-center justify-between gap-2 pt-1 text-xs text-muted">
      <span>
        Endzone depth{" "}
        {isOverridden && (
          <span className="text-primary">· custom</span>
        )}
      </span>
      <span className="inline-flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={20}
          step={1}
          value={resolved.endzoneDepthYds}
          disabled={disabled}
          onChange={(e) => setEndzoneDepth(Number(e.target.value) || 0)}
          className="w-14 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
        />
        <span>yds</span>
      </span>
    </label>
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

/** Two-line checkbox row for advanced capabilities. Sublabel surfaces
 *  the concrete play types so a coach can see what they're opting into
 *  before flipping the switch. Reads / writes the array-of-strings
 *  shape on PlaybookSettings.advancedCapabilities. */
function CapabilityRow({
  label,
  sublabel,
  capability,
  value,
  onChange,
  disabled,
}: {
  label: string;
  sublabel: string;
  capability: RuleCapability;
  value: PlaybookSettings;
  onChange: (next: PlaybookSettings) => void;
  disabled?: boolean;
}) {
  const enabled = value.advancedCapabilities.includes(capability);
  const toggle = (next: boolean) => {
    const set = new Set(value.advancedCapabilities);
    if (next) set.add(capability);
    else set.delete(capability);
    onChange({ ...value, advancedCapabilities: Array.from(set) });
  };
  return (
    <label className="flex items-start justify-between gap-2 text-sm text-foreground">
      <span className="flex flex-col">
        <span>{label}</span>
        <span className="text-[11px] text-muted">{sublabel}</span>
      </span>
      <input
        type="checkbox"
        checked={enabled}
        disabled={disabled}
        onChange={(e) => toggle(e.target.checked)}
        className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary"
      />
    </label>
  );
}
