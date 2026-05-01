import type { SportVariant } from "@/domain/play/types";

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
  switch (variant) {
    case "flag_7v7":
      return {
        rushingAllowed: false,
        rushingYards: null,
        handoffsAllowed: false,
        blockingAllowed: false,
        centerIsEligible: false,
        maxPlayers: 7,
      };
    case "flag_5v5":
      return {
        rushingAllowed: true,
        rushingYards: 7,
        handoffsAllowed: true,
        blockingAllowed: false,
        centerIsEligible: true,
        maxPlayers: 5,
      };
    case "tackle_11":
      return {
        rushingAllowed: true,
        rushingYards: 0,
        handoffsAllowed: true,
        blockingAllowed: true,
        centerIsEligible: false,
        maxPlayers: 11,
      };
    case "other":
      return {
        rushingAllowed: true,
        rushingYards: 0,
        handoffsAllowed: true,
        blockingAllowed: true,
        centerIsEligible: false,
        maxPlayers: Math.max(4, Math.min(11, customPlayers ?? 7)),
      };
  }
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
  };
}
