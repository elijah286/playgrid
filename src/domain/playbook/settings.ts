import type { SportVariant } from "@/domain/play/types";
import {
  coerceLeaguePreset,
  defaultLeaguePresetForVariant,
  LEAGUE_PRESETS,
  resolveFieldStructure,
  type FieldMarkingDefaults,
  type FieldStructure,
  type LeaguePreset,
} from "@/domain/play/leaguePresets";

/**
 * Per-playbook field-display config. Encodes the league rule-set + the
 * marking-visibility defaults that new plays inherit. The structural
 * fields (length, no-run zone, first-down lines) are derived from
 * `leaguePreset` unless `customStructure` is set; the renderer reads
 * the resolved structure via `resolvePlaybookFieldStructure`.
 */
export type FieldDisplaySettings = {
  /** Stable preset id. "custom" means the coach defined their own
   *  numbers via `customStructure`. */
  leaguePreset: LeaguePreset;
  /** Numeric overrides that win over the preset's structure. Used when
   *  the coach explicitly tweaks field length / endzone depth / etc.
   *  null when no overrides are set. */
  customStructure: Partial<FieldStructure> | null;
  /** Per-play marking visibility defaults. New plays inherit these;
   *  individual plays may override on a per-flag basis. */
  markingDefaults: FieldMarkingDefaults;
};

/**
 * Per-playbook game-rule settings. Stored denormalized on `playbooks.settings`
 * (jsonb) so a coach can tweak rules after creation without touching the sport
 * variant. `maxPlayers` also drives the "too many players on the field"
 * warning in the play + formation editors.
 */
export type PlaybookSettings = {
  rushingAllowed: boolean;
  /** Required minimum yardage from LOS for a legal rush. Ignored if rushing off. */
  rushingYards: number | null;
  handoffsAllowed: boolean;
  blockingAllowed: boolean;
  /**
   * Whether the center is an eligible receiver. True for flag 5v5 (only 5
   * offensive players, no pure linemen); false for 7v7 / tackle / other by
   * default. Drives play-editor route assignment + Coach Cal play generation.
   */
  centerIsEligible: boolean;
  maxPlayers: number;
  /**
   * Maximum legal forward throw depth in yards for plays in this playbook.
   * When set, the save-time route validator rejects any forward route
   * whose deepest waypoint exceeds this depth (unless the route is
   * marked nonCanonical: true as an explicit coach override).
   *
   * Persistent so a coach with a young/inexperienced team can set the
   * cap once on the playbook and Cal can never violate it on a save —
   * the prior approach (Cal propagating max_throw_depth_yds on every
   * create_play call) failed when Cal forgot to include it.
   *
   * Default null = no cap. When the coach surfaces a cap in chat
   * ("under 12 yards"), Cal should also persist it via the playbook
   * settings UI so it doesn't drift across sessions.
   */
  maxThrowDepthYds: number | null;
  /**
   * Per-playbook field-display settings — league preset + structural
   * overrides + per-play marking visibility defaults. Drives the field
   * renderer (which markings are visible inside the 25-yd window) and
   * the defaults applied when the coach creates a new play.
   */
  fieldDisplay: FieldDisplaySettings;
};

/** Label used in UI + warnings. */
export const SPORT_VARIANT_LABELS: Record<SportVariant, string> = {
  flag_5v5: "Flag 5v5",
  flag_7v7: "7v7",
  tackle_11: "Tackle (11v11)",
  other: "Other",
};

/**
 * Sensible defaults per game type. Per product:
 *  - 7v7: rushing off, handoffs off, blocking off
 *  - Flag: blocking off
 *  - Tackle / Other: everything on
 */
export function defaultSettingsForVariant(
  variant: SportVariant,
  customPlayers?: number | null,
): PlaybookSettings {
  const base = baseSettingsForVariant(variant, customPlayers);
  return { ...base, fieldDisplay: defaultFieldDisplayForVariant(variant) };
}

function baseSettingsForVariant(
  variant: SportVariant,
  customPlayers?: number | null,
): Omit<PlaybookSettings, "fieldDisplay"> {
  switch (variant) {
    case "flag_7v7":
      return {
        rushingAllowed: false,
        rushingYards: null,
        handoffsAllowed: false,
        blockingAllowed: false,
        centerIsEligible: false,
        maxPlayers: 7,
        maxThrowDepthYds: null,
      };
    case "flag_5v5":
      return {
        rushingAllowed: true,
        rushingYards: 7,
        handoffsAllowed: true,
        blockingAllowed: false,
        centerIsEligible: true,
        maxPlayers: 5,
        maxThrowDepthYds: null,
      };
    case "tackle_11":
      return {
        rushingAllowed: true,
        rushingYards: 0,
        handoffsAllowed: true,
        blockingAllowed: true,
        centerIsEligible: false,
        maxPlayers: 11,
        maxThrowDepthYds: null,
      };
    case "other":
      return {
        rushingAllowed: true,
        rushingYards: 0,
        handoffsAllowed: true,
        blockingAllowed: true,
        centerIsEligible: false,
        maxPlayers: Math.max(4, Math.min(11, customPlayers ?? 7)),
        maxThrowDepthYds: null,
      };
  }
}

/** Field-display settings for a fresh playbook of the given variant. Uses
 *  the variant's most common league preset and that preset's marking
 *  defaults. */
export function defaultFieldDisplayForVariant(
  variant: SportVariant,
): FieldDisplaySettings {
  const preset = defaultLeaguePresetForVariant(variant);
  return {
    leaguePreset: preset,
    customStructure: null,
    markingDefaults: { ...LEAGUE_PRESETS[preset].markingDefaults },
  };
}

/** Resolve the playbook's effective field structure: preset values, with
 *  any custom overrides applied. The renderer + spawn-new-play paths read
 *  this, never the raw `customStructure` blob. */
export function resolvePlaybookFieldStructure(
  fieldDisplay: FieldDisplaySettings,
): FieldStructure {
  return resolveFieldStructure(fieldDisplay.leaguePreset, fieldDisplay.customStructure);
}

/** Capture a play's current field-display flags into the marking-defaults
 *  shape so a coach can promote them to the playbook's defaults via the
 *  "Save as team default" action. Per-flag fallbacks mirror the runtime
 *  resolvers in `factory.ts`. */
export type PlayFieldDisplaySnapshot = {
  fieldBackground?: FieldMarkingDefaults["background"];
  showEndzones?: boolean;
  showNoRunZones?: boolean;
  showFirstDownLine?: boolean;
  showDownMarkers?: boolean;
  rotatedYardNumbers?: boolean;
  showHashMarks?: boolean;
  hashStyle?: FieldMarkingDefaults["hashStyle"];
  showYardNumbers?: boolean;
};

export function markingDefaultsFromPlay(
  snapshot: PlayFieldDisplaySnapshot,
  fallback: FieldMarkingDefaults,
): FieldMarkingDefaults {
  return {
    background: snapshot.fieldBackground ?? fallback.background,
    showEndzones: snapshot.showEndzones ?? fallback.showEndzones,
    showNoRunZones: snapshot.showNoRunZones ?? fallback.showNoRunZones,
    showFirstDownLine: snapshot.showFirstDownLine ?? fallback.showFirstDownLine,
    showDownMarkers: snapshot.showDownMarkers ?? fallback.showDownMarkers,
    rotatedYardNumbers: snapshot.rotatedYardNumbers ?? fallback.rotatedYardNumbers,
    showHashMarks: snapshot.showHashMarks ?? fallback.showHashMarks,
    hashStyle: snapshot.hashStyle ?? fallback.hashStyle,
    showYardNumbers: snapshot.showYardNumbers ?? fallback.showYardNumbers,
  };
}

const HASH_STYLE_VALUES = new Set(["narrow", "normal", "wide", "none"]);
const FIELD_BG_VALUES = new Set(["green", "white", "black", "gray"]);

function normalizeMarkingDefaults(
  raw: unknown,
  fallback: FieldMarkingDefaults,
): FieldMarkingDefaults {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const r = raw as Partial<FieldMarkingDefaults>;
  return {
    background:
      typeof r.background === "string" && FIELD_BG_VALUES.has(r.background)
        ? r.background
        : fallback.background,
    showEndzones:
      typeof r.showEndzones === "boolean" ? r.showEndzones : fallback.showEndzones,
    showNoRunZones:
      typeof r.showNoRunZones === "boolean" ? r.showNoRunZones : fallback.showNoRunZones,
    showFirstDownLine:
      typeof r.showFirstDownLine === "boolean"
        ? r.showFirstDownLine
        : fallback.showFirstDownLine,
    showDownMarkers:
      typeof r.showDownMarkers === "boolean"
        ? r.showDownMarkers
        : fallback.showDownMarkers,
    rotatedYardNumbers:
      typeof r.rotatedYardNumbers === "boolean"
        ? r.rotatedYardNumbers
        : fallback.rotatedYardNumbers,
    showHashMarks:
      typeof r.showHashMarks === "boolean" ? r.showHashMarks : fallback.showHashMarks,
    hashStyle:
      typeof r.hashStyle === "string" && HASH_STYLE_VALUES.has(r.hashStyle)
        ? (r.hashStyle as FieldMarkingDefaults["hashStyle"])
        : fallback.hashStyle,
    showYardNumbers:
      typeof r.showYardNumbers === "boolean"
        ? r.showYardNumbers
        : fallback.showYardNumbers,
  };
}

function normalizeCustomStructure(
  raw: unknown,
): Partial<FieldStructure> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<FieldStructure>;
  const out: Partial<FieldStructure> = {};
  if (typeof r.fieldLengthYds === "number" && r.fieldLengthYds > 0) {
    out.fieldLengthYds = r.fieldLengthYds;
  }
  if (typeof r.fieldWidthYds === "number" && r.fieldWidthYds > 0) {
    out.fieldWidthYds = r.fieldWidthYds;
  }
  if (typeof r.endzoneDepthYds === "number" && r.endzoneDepthYds >= 0) {
    out.endzoneDepthYds = r.endzoneDepthYds;
  }
  if (r.noRunZoneYds === null) {
    out.noRunZoneYds = null;
  } else if (typeof r.noRunZoneYds === "number" && r.noRunZoneYds >= 0) {
    out.noRunZoneYds = r.noRunZoneYds;
  }
  if (Array.isArray(r.firstDownLineYds)) {
    const cleaned = r.firstDownLineYds.filter(
      (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
    );
    if (cleaned.length > 0) out.firstDownLineYds = cleaned;
  }
  if (Array.isArray(r.noRunZones)) {
    // Empty array is valid (means "no zones overriding the preset to
    // empty"), so persist it as-is. Filter out malformed entries.
    out.noRunZones = r.noRunZones
      .filter(
        (z): z is { atYd: number; depthYds: number } =>
          !!z &&
          typeof (z as { atYd?: unknown }).atYd === "number" &&
          Number.isFinite((z as { atYd: number }).atYd) &&
          (z as { atYd: number }).atYd > 0 &&
          typeof (z as { depthYds?: unknown }).depthYds === "number" &&
          Number.isFinite((z as { depthYds: number }).depthYds) &&
          (z as { depthYds: number }).depthYds > 0,
      )
      .map((z) => ({ atYd: z.atYd, depthYds: z.depthYds }));
  }
  return Object.keys(out).length > 0 ? out : null;
}

function normalizeFieldDisplay(
  raw: unknown,
  variant: SportVariant,
): FieldDisplaySettings {
  const fallback = defaultFieldDisplayForVariant(variant);
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Partial<FieldDisplaySettings>;
  const preset = coerceLeaguePreset(r.leaguePreset ?? fallback.leaguePreset);
  const presetDefaults = LEAGUE_PRESETS[preset].markingDefaults;
  return {
    leaguePreset: preset,
    customStructure: normalizeCustomStructure(r.customStructure),
    markingDefaults: normalizeMarkingDefaults(r.markingDefaults, presetDefaults),
  };
}

/**
 * Merge a stored partial settings blob with the variant defaults. Safe to call
 * with `null`/`undefined`/legacy rows that lack a settings column.
 */
export function normalizePlaybookSettings(
  raw: unknown,
  variant: SportVariant,
  customPlayers?: number | null,
): PlaybookSettings {
  const defaults = defaultSettingsForVariant(variant, customPlayers);
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Partial<PlaybookSettings>;
  return {
    rushingAllowed:
      typeof r.rushingAllowed === "boolean" ? r.rushingAllowed : defaults.rushingAllowed,
    rushingYards:
      typeof r.rushingYards === "number" && Number.isFinite(r.rushingYards)
        ? r.rushingYards
        : defaults.rushingYards,
    handoffsAllowed:
      typeof r.handoffsAllowed === "boolean" ? r.handoffsAllowed : defaults.handoffsAllowed,
    blockingAllowed:
      typeof r.blockingAllowed === "boolean" ? r.blockingAllowed : defaults.blockingAllowed,
    centerIsEligible:
      typeof r.centerIsEligible === "boolean" ? r.centerIsEligible : defaults.centerIsEligible,
    maxPlayers:
      typeof r.maxPlayers === "number" && r.maxPlayers > 0
        ? Math.round(r.maxPlayers)
        : defaults.maxPlayers,
    maxThrowDepthYds:
      typeof r.maxThrowDepthYds === "number" && Number.isFinite(r.maxThrowDepthYds) && r.maxThrowDepthYds > 0
        ? r.maxThrowDepthYds
        : defaults.maxThrowDepthYds,
    fieldDisplay: normalizeFieldDisplay(
      (r as { fieldDisplay?: unknown }).fieldDisplay,
      variant,
    ),
  };
}
