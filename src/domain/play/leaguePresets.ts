/**
 * League presets — the rule-set + field-structure values for the leagues
 * we ship as built-ins. A playbook picks one preset at creation; that
 * choice fills in `fieldLengthYds`, `endzoneDepthYds`, `noRunZoneYds`,
 * `firstDownLineYds`, and the marking-visibility defaults that new plays
 * inherit. Per-play overrides win over the preset (a coach can hide the
 * no-run zones on a single play even if the preset turns them on).
 *
 * The "custom" preset stores the structural numbers the coach typed in
 * directly; `resolveFieldStructure` reads from `custom` when the preset
 * is "custom" and from the canonical map otherwise.
 *
 * Coordinate conventions used throughout this module:
 *   - "yards from own goal" = ball-progress measure. 0 is offense's own
 *     goal line, `fieldLengthYds` is the opponent's goal line. So
 *     midfield on a 50-yard IFAF field is 25; a flag "no-run zone"
 *     extends from yard 0 to yard `noRunZoneYds` (own end) and from
 *     `fieldLengthYds - noRunZoneYds` to `fieldLengthYds` (opp end).
 *   - The 25-yard display window in the editor is anchored to the LOS
 *     and never changes size. The renderer derives which markings fall
 *     inside that window from the play's `fieldPositionYds` (ball spot)
 *     and the league's structural values.
 */

import type { SportVariant } from "./types";

/** Stable identifier for a built-in league rule-set. New presets are
 *  appended; never renamed (saved playbooks reference these strings). */
export type LeaguePreset =
  | "ifaf_5v5"
  | "ifaf_7v7"
  | "nfhs_5v5"
  | "nfl_flag_5v5"
  | "nfl_flag_7v7"
  | "tackle_hs"
  | "tackle_college"
  | "tackle_nfl"
  | "custom";

/** A single no-run / pass-only zone, drawn as a yellow band ending at
 *  `atYd` and extending `depthYds` yards back from there. Defaults are
 *  league-determined; coaches can add, remove, or tune individual zones
 *  per playbook. */
export type NoRunZoneConfig = {
  /** League yard (from own goal) where the band's downfield edge sits.
   *  Band occupies `[atYd - depthYds, atYd]`. */
  atYd: number;
  /** Depth of the band in yards. Defaults to 5 in the UI when adding
   *  a new zone. */
  depthYds: number;
};

/** Physical field structure derived from a league preset. */
export type FieldStructure = {
  /** Total length of the playing field in yards (excluding endzones).
   *  IFAF flag = 50, NFL flag = 50, tackle = 100. */
  fieldLengthYds: number;
  /** Sideline-to-sideline width in yards. IFAF/NFHS flag 5v5 = 25,
   *  flag 7v7 ≈ 30, tackle = 53. */
  fieldWidthYds: number;
  /** Depth of each endzone in yards. */
  endzoneDepthYds: number;
  /** @deprecated Use `noRunZones`. Legacy single-depth value kept on the
   *  type so that already-persisted `customStructure` blobs still parse
   *  and so callers reading the depth of "the" zone (e.g. AI prompts)
   *  can still get a representative number. The renderer/UI now drive
   *  off `noRunZones` exclusively. */
  noRunZoneYds: number | null;
  /** Per-zone no-run / pass-only band config. Empty array = no zones.
   *  5v5 leagues default to bands at own backed-up area, midfield, and
   *  scoring approach. 7v7 / tackle default to none. */
  noRunZones: NoRunZoneConfig[];
  /** Down-marker yard lines (yards from own goal) the league fixes by
   *  rule — the offense gets a fresh set of downs by crossing one of
   *  these. Renderer draws each as a solid orange line. Empty array =
   *  distance-based downs only (no fixed marker; "first-down line" then
   *  becomes a per-play coach decision). 5v5 = midfield only; 7v7 ≈
   *  every 15 yds. Field name kept for back-compat with persisted
   *  `customStructure` blobs that may reference it. */
  firstDownLineYds: number[];
};

/** Per-play marking visibility defaults that the league preset sets when
 *  a coach creates a new playbook. Each maps 1:1 to a flag on
 *  `PlayDocument`; the play-level flag wins when set. */
export type FieldMarkingDefaults = {
  background: "green" | "white" | "black" | "gray";
  showEndzones: boolean;
  showNoRunZones: boolean;
  showFirstDownLine: boolean;
  showDownMarkers: boolean;
  rotatedYardNumbers: boolean;
  showHashMarks: boolean;
  hashStyle: "narrow" | "normal" | "wide" | "none";
  showYardNumbers: boolean;
};

export type LeaguePresetDefinition = {
  /** Stable id used in saved data. */
  id: LeaguePreset;
  /** Coach-facing label for the preset picker. */
  label: string;
  /** One-line description for the preset picker. */
  description: string;
  /** Sport variants this preset is offered for. The picker filters by
   *  the playbook's variant; unmatched presets are hidden. */
  variants: SportVariant[];
  structure: FieldStructure;
  markingDefaults: FieldMarkingDefaults;
};

// New playbooks ship with all league-fixed markings (endzones, no-run
// zones, first-down line, down markers) hidden. Coaches can opt in via
// the Markings popover; the structural data (no-run bands, fixed-down
// yardages) still lives on the preset so toggling on works without
// re-picking a league.
const FLAG_DEFAULT_MARKINGS: FieldMarkingDefaults = {
  background: "green",
  showEndzones: false,
  showNoRunZones: false,
  showFirstDownLine: false,
  showDownMarkers: false,
  rotatedYardNumbers: true,
  showHashMarks: false,
  hashStyle: "none",
  showYardNumbers: true,
};

const TACKLE_DEFAULT_MARKINGS: FieldMarkingDefaults = {
  background: "green",
  showEndzones: false,
  showNoRunZones: false,
  showFirstDownLine: false,
  showDownMarkers: false,
  rotatedYardNumbers: true,
  showHashMarks: true,
  hashStyle: "normal",
  showYardNumbers: true,
};

/** Built-in league presets. Order = display order in the picker. */
export const LEAGUE_PRESETS: Record<LeaguePreset, LeaguePresetDefinition> = {
  ifaf_5v5: {
    id: "ifaf_5v5",
    label: "IFAF Flag 5v5",
    description: "50-yard field, 5-yd no-run zones, midfield 1st-down line",
    variants: ["flag_5v5"],
    structure: {
      fieldLengthYds: 50,
      fieldWidthYds: 25,
      endzoneDepthYds: 10,
      noRunZoneYds: 5,
      // Default 5v5 no-run bands: backed-up own zone, midfield approach,
      // and scoring approach — all 5 yds deep.
      noRunZones: [
        { atYd: 5, depthYds: 5 },
        { atYd: 25, depthYds: 5 },
        { atYd: 50, depthYds: 5 },
      ],
      firstDownLineYds: [25],
    },
    markingDefaults: { ...FLAG_DEFAULT_MARKINGS },
  },
  ifaf_7v7: {
    id: "ifaf_7v7",
    label: "IFAF Flag 7v7",
    description: "50-yard field, fixed downs every 15 yds",
    variants: ["flag_7v7"],
    structure: {
      fieldLengthYds: 50,
      fieldWidthYds: 30,
      endzoneDepthYds: 10,
      // 7v7 has no pass-only / no-run zone — that's a 5v5 rule. Leaving
      // null hides the toggle in the Markings popover and prevents the
      // band layer from drawing.
      noRunZoneYds: null,
      noRunZones: [],
      // 7v7 rule: fixed down markers every 15 yards.
      firstDownLineYds: [15, 30, 45],
    },
    markingDefaults: { ...FLAG_DEFAULT_MARKINGS, showNoRunZones: false },
  },
  nfhs_5v5: {
    id: "nfhs_5v5",
    label: "NFHS Flag 5v5",
    description: "60-yard field, midfield 1st-down line (NFHS)",
    variants: ["flag_5v5"],
    structure: {
      fieldLengthYds: 60,
      fieldWidthYds: 25,
      endzoneDepthYds: 10,
      noRunZoneYds: 5,
      noRunZones: [
        { atYd: 5, depthYds: 5 },
        { atYd: 30, depthYds: 5 },
        { atYd: 60, depthYds: 5 },
      ],
      // 5v5 rule: cross midfield = automatic 1st down (single fixed line).
      firstDownLineYds: [30],
    },
    markingDefaults: { ...FLAG_DEFAULT_MARKINGS },
  },
  nfl_flag_5v5: {
    id: "nfl_flag_5v5",
    label: "NFL Flag 5v5",
    description: "30-yard field, 5-yd endzones + 5-yd no-run zones",
    variants: ["flag_5v5"],
    structure: {
      // NFL Flag youth standard: shorter field with 5-yard endzones.
      fieldLengthYds: 30,
      fieldWidthYds: 25,
      endzoneDepthYds: 5,
      noRunZoneYds: 5,
      noRunZones: [
        { atYd: 5, depthYds: 5 },
        { atYd: 15, depthYds: 5 },
        { atYd: 30, depthYds: 5 },
      ],
      firstDownLineYds: [15],
    },
    markingDefaults: { ...FLAG_DEFAULT_MARKINGS },
  },
  nfl_flag_7v7: {
    id: "nfl_flag_7v7",
    label: "NFL Flag 7v7",
    description: "40-yard field, 10-yd endzones, two 1st-down lines",
    variants: ["flag_7v7"],
    structure: {
      fieldLengthYds: 40,
      fieldWidthYds: 30,
      endzoneDepthYds: 10,
      // 7v7 has no pass-only zone — see ifaf_7v7 note.
      noRunZoneYds: null,
      noRunZones: [],
      firstDownLineYds: [14, 28],
    },
    markingDefaults: { ...FLAG_DEFAULT_MARKINGS, showNoRunZones: false },
  },
  tackle_hs: {
    id: "tackle_hs",
    label: "High School Tackle",
    description: "100-yd field, wide hash spacing (NFHS)",
    variants: ["tackle_11"],
    structure: {
      fieldLengthYds: 100,
      fieldWidthYds: 53,
      endzoneDepthYds: 10,
      noRunZoneYds: null,
      noRunZones: [],
      firstDownLineYds: [],
    },
    markingDefaults: { ...TACKLE_DEFAULT_MARKINGS, hashStyle: "wide" },
  },
  tackle_college: {
    id: "tackle_college",
    label: "College Tackle",
    description: "100-yd field, NCAA hash spacing",
    variants: ["tackle_11"],
    structure: {
      fieldLengthYds: 100,
      fieldWidthYds: 53,
      endzoneDepthYds: 10,
      noRunZoneYds: null,
      noRunZones: [],
      firstDownLineYds: [],
    },
    markingDefaults: { ...TACKLE_DEFAULT_MARKINGS, hashStyle: "normal" },
  },
  tackle_nfl: {
    id: "tackle_nfl",
    label: "NFL Tackle",
    description: "100-yd field, narrow NFL hash spacing",
    variants: ["tackle_11"],
    structure: {
      fieldLengthYds: 100,
      fieldWidthYds: 53,
      endzoneDepthYds: 10,
      noRunZoneYds: null,
      noRunZones: [],
      firstDownLineYds: [],
    },
    markingDefaults: { ...TACKLE_DEFAULT_MARKINGS, hashStyle: "narrow" },
  },
  custom: {
    id: "custom",
    label: "Custom",
    description: "Define your own field length and markings",
    variants: ["flag_5v5", "flag_7v7", "tackle_11", "other"],
    structure: {
      fieldLengthYds: 50,
      fieldWidthYds: 25,
      endzoneDepthYds: 10,
      noRunZoneYds: null,
      noRunZones: [],
      firstDownLineYds: [],
    },
    markingDefaults: {
      ...FLAG_DEFAULT_MARKINGS,
      showFirstDownLine: false,
      showDownMarkers: false,
    },
  },
};

/** Default preset to suggest at playbook creation, given a sport variant.
 *  Picks the most common league for that variant. */
export function defaultLeaguePresetForVariant(variant: SportVariant): LeaguePreset {
  switch (variant) {
    case "flag_5v5":
      return "nfl_flag_5v5";
    case "flag_7v7":
      return "ifaf_7v7";
    case "tackle_11":
      return "tackle_hs";
    case "other":
      return "custom";
  }
}

/** Presets the picker should offer for a given sport variant. */
export function presetsForVariant(variant: SportVariant): LeaguePresetDefinition[] {
  return Object.values(LEAGUE_PRESETS).filter((p) => p.variants.includes(variant));
}

/** Validate a string and narrow to LeaguePreset, falling back to "custom"
 *  for unknown values (forward-compat: a saved playbook from a future
 *  client that referenced a preset we don't know about doesn't crash). */
export function coerceLeaguePreset(raw: unknown): LeaguePreset {
  if (typeof raw !== "string") return "custom";
  return raw in LEAGUE_PRESETS ? (raw as LeaguePreset) : "custom";
}

/** Resolve the structural values for a preset, applying the optional
 *  numeric override ("custom") when present. */
export function resolveFieldStructure(
  preset: LeaguePreset,
  override?: Partial<FieldStructure> | null,
): FieldStructure {
  const base = LEAGUE_PRESETS[preset].structure;
  if (!override) {
    return {
      ...base,
      noRunZones: base.noRunZones.map((z) => ({ ...z })),
      firstDownLineYds: [...base.firstDownLineYds],
    };
  }
  return {
    fieldLengthYds:
      typeof override.fieldLengthYds === "number" && override.fieldLengthYds > 0
        ? override.fieldLengthYds
        : base.fieldLengthYds,
    fieldWidthYds:
      typeof override.fieldWidthYds === "number" && override.fieldWidthYds > 0
        ? override.fieldWidthYds
        : base.fieldWidthYds,
    endzoneDepthYds:
      typeof override.endzoneDepthYds === "number" && override.endzoneDepthYds >= 0
        ? override.endzoneDepthYds
        : base.endzoneDepthYds,
    noRunZoneYds:
      override.noRunZoneYds === null
        ? null
        : typeof override.noRunZoneYds === "number" && override.noRunZoneYds >= 0
          ? override.noRunZoneYds
          : base.noRunZoneYds,
    noRunZones: Array.isArray(override.noRunZones)
      ? override.noRunZones
          .filter(
            (z): z is NoRunZoneConfig =>
              !!z &&
              typeof z.atYd === "number" &&
              z.atYd > 0 &&
              typeof z.depthYds === "number" &&
              z.depthYds > 0,
          )
          .map((z) => ({ atYd: z.atYd, depthYds: z.depthYds }))
      : base.noRunZones.map((z) => ({ ...z })),
    firstDownLineYds: Array.isArray(override.firstDownLineYds)
      ? override.firstDownLineYds.filter((n) => typeof n === "number" && n > 0)
      : [...base.firstDownLineYds],
  };
}
