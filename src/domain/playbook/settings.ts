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
 * Capabilities the playbook's rule-set unlocks for Coach Cal's play
 * authoring. Coarse-grained on purpose: each entry corresponds to a
 * CLASS of play behavior the renderer + writer must support, not a
 * single action kind. The defaults per variant ship via
 * `baseSettingsForVariant`; the "custom" preset / Other variant lets a
 * coach toggle individual capabilities on or off in the rules form.
 *
 * Why this is a list rather than a bag of booleans: capabilities will
 * grow (special-teams, fake punt, double-pass, no-huddle motion-at-
 * snap, etc.). A list keeps the schema additive — new capabilities
 * land as new string values, old playbooks parse without a migration
 * (unknown values are dropped on normalize). Cal reads the resolved
 * capability set at compose time; the validator rejects specs that
 * use a capability the playbook hasn't opted into.
 */
export type RuleCapability =
  /** Designed QB carries (QB Draw, QB Power, QB Counter, QB Sneak,
   *  Zone Read QB-keep). Distinct from a scramble — that's always
   *  legal when rushingAllowed is on. This gates Cal recommending or
   *  drawing the QB as the named ballcarrier. */
  | "designed_qb_run"
  /** Multi-handoff plays — reverses, jet reverses, double reverses,
   *  fake reverses. Implies the play-level `ballPath` field in the
   *  spec. Distinct from `handoffsAllowed` (single QB → RB exchange),
   *  which is the universal flag-rule toggle. */
  | "handoff_chain"
  /** Run-pass option plays — the QB's assignment uses `kind:
   *  "rpo_read"` with a key defender + run branch + pass branch. */
  | "rpo_read";

/** All recognized capability strings, in display order for the rules
 *  form. New entries appended (never renamed — saved playbooks
 *  reference these strings). */
export const RULE_CAPABILITIES: readonly RuleCapability[] = [
  "designed_qb_run",
  "handoff_chain",
  "rpo_read",
] as const;

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
   * Advanced play capabilities the playbook opts into. Tackle defaults
   * to the full set; flag variants default to a conservative subset
   * (5v5 = empty; 7v7 = `["designed_qb_run"]`). Coach can toggle in
   * the rules form. Cal reads this to decide what concepts to
   * recommend; the spec validator rejects writes that use a
   * capability not in this list. See `RuleCapability` for the
   * vocabulary.
   */
  advancedCapabilities: RuleCapability[];
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
  flag_4v4: "4v4 Flag",
  flag_5v5: "5v5 Flag",
  flag_6v6: "6v6 Flag",
  flag_7v7: "7v7",
  touch_7v7: "7v7 Touch",
  tackle_11: "11v11 Tackle",
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
    case "touch_7v7":
      // Touch 7v7 uses the same base settings as flag 7v7. The only
      // difference (two-hand-touch vs flag-pull) is a rules-KB concern,
      // not a composition / settings concern.
      return {
        rushingAllowed: false,
        rushingYards: null,
        handoffsAllowed: false,
        blockingAllowed: false,
        centerIsEligible: false,
        maxPlayers: 7,
        maxThrowDepthYds: null,
        // 7v7 traditionally pass-only — no QB runs / handoffs / RPOs
        // by default. Coach can opt in via the rules form for leagues
        // that allow more.
        advancedCapabilities: [],
      };
    case "flag_4v4":
      // Flag 4v4: 3 eligibles + QB. No-rush is the dominant league
      // convention (most rec leagues prohibit rushing entirely; some
      // allow 1 rusher from 5-7y — coaches can opt in via the rules
      // form). Handoffs allowed (many leagues permit designed runs
      // outside the no-run zone). Center-eligible varies by league —
      // default to true since center IS eligible in i9 / NFL FLAG
      // youth (the dominant 4v4 ruleset families).
      return {
        rushingAllowed: false,
        rushingYards: null,
        handoffsAllowed: true,
        blockingAllowed: false,
        centerIsEligible: true,
        maxPlayers: 4,
        maxThrowDepthYds: null,
        // 4v4 leagues vary widely on QB-run rules; default to handoff
        // only and let coaches opt in. RPO concepts are rare at 4v4
        // levels (typically tier1_5_8) and stay opt-in.
        advancedCapabilities: ["handoff_chain"],
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
        // 5v5 allows handoffs (handoffsAllowed: true), so `handoff_chain`
        // is on by default — coaches expect to be able to call sweeps,
        // dives, and basic run plays without flipping a capability
        // toggle first. designed_qb_run + rpo_read stay opt-in because
        // most 5v5 rule sets DO disallow designed QB runs and RPOs
        // (surfaced 2026-05-12 when an earlier ["designed_qb_run"]
        // default let Cal compose a QB Draw in a league that forbade
        // it). 2026-05-13: handoff_chain added after a coach in a 5v5
        // playbook hit "Flea Flicker requires handoff_chain"; the gate
        // existed but the variant default was over-conservative.
        advancedCapabilities: ["handoff_chain"],
      };
    case "flag_6v6":
      return {
        rushingAllowed: true,
        rushingYards: 7,
        handoffsAllowed: true,
        blockingAllowed: false,
        centerIsEligible: true,
        maxPlayers: 6,
        maxThrowDepthYds: null,
        // Same logic as 5v5 — handoffs are allowed by base settings,
        // so handoff_chain is on by default. designed_qb_run +
        // rpo_read stay opt-in for league-specific rules.
        advancedCapabilities: ["handoff_chain"],
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
        // Tackle football: full capability set on by default.
        advancedCapabilities: ["designed_qb_run", "handoff_chain", "rpo_read"],
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
        // Custom game type: empty by default so the coach explicitly
        // declares what their rules allow. Cal won't recommend an RPO
        // until the coach opts in for a custom variant.
        advancedCapabilities: [],
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
    advancedCapabilities: normalizeAdvancedCapabilities(
      (r as { advancedCapabilities?: unknown }).advancedCapabilities,
      defaults.advancedCapabilities,
    ),
    fieldDisplay: normalizeFieldDisplay(
      (r as { fieldDisplay?: unknown }).fieldDisplay,
      variant,
    ),
  };
}

const RULE_CAPABILITY_SET = new Set<string>(RULE_CAPABILITIES);

/** Drop unknown values, dedupe, and preserve the canonical display
 *  order. Legacy rows that pre-date this field fall back to the
 *  variant default (passed in as `fallback`). */
function normalizeAdvancedCapabilities(
  raw: unknown,
  fallback: RuleCapability[],
): RuleCapability[] {
  if (!Array.isArray(raw)) return [...fallback];
  const seen = new Set<RuleCapability>();
  for (const entry of raw) {
    if (typeof entry === "string" && RULE_CAPABILITY_SET.has(entry)) {
      seen.add(entry as RuleCapability);
    }
  }
  return RULE_CAPABILITIES.filter((c) => seen.has(c));
}
