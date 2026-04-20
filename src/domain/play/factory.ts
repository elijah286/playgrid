import {
  PLAY_DOCUMENT_SCHEMA_VERSION,
  type EndDecoration,
  type PlayDocument,
  type Player,
  type PlayType,
  type Route,
  type SpecialTeamsUnit,
  type SportProfile,
  type SportVariant,
} from "./types";

/** Whether hash marks should render by default for a given sport variant.
 *  Flag football plays a smaller, cleaner field — hash marks are noise.
 *  Tackle plays on a real field — hash marks are expected. */
export function shouldShowHashMarksDefault(variant: SportVariant): boolean {
  if (variant === "tackle_11") return true;
  if (variant === "other") return false;
  return false;
}

/** Resolve the effective hash-mark setting: explicit override wins,
 *  otherwise derive from sport variant. */
export function resolveShowHashMarks(doc: PlayDocument): boolean {
  if (typeof doc.showHashMarks === "boolean") return doc.showHashMarks;
  return shouldShowHashMarksDefault(doc.sportProfile.variant);
}

/** Effective yard-number setting. Defaults to true when unset. */
export function resolveShowYardNumbers(doc: PlayDocument): boolean {
  return doc.showYardNumbers ?? true;
}

/** LOS marker style, defaulting to a horizontal line. */
export function resolveLineOfScrimmage(
  doc: PlayDocument,
): "line" | "football" | "none" {
  return doc.lineOfScrimmage ?? "line";
}

/**
 * Normalized y where the LOS lives.
 * Default 0.4 = 10 yards behind the line in the standard 25-yard display window
 * (10 yds backfield + 15 yds downfield).
 */
export function resolveLineOfScrimmageY(doc: PlayDocument): number {
  const y = doc.lineOfScrimmageY;
  if (typeof y === "number" && Number.isFinite(y)) {
    return Math.max(0, Math.min(1, y));
  }
  return 0.4;
}

/** Field zone, defaulting to mid-field. */
export function resolveFieldZone(doc: PlayDocument): "midfield" | "red_zone" {
  return doc.fieldZone ?? "midfield";
}

/**
 * Yards shown behind the LOS in the current display window.
 * Default: 10 (LOS at 0.4 of 25-yd window).
 */
export function resolveBackfieldYards(doc: PlayDocument): number {
  const losY = resolveLineOfScrimmageY(doc);
  return Math.round(losY * doc.sportProfile.fieldLengthYds);
}

/**
 * Yards shown downfield from the LOS in the current display window.
 * Default: 15 (LOS at 0.4 of 25-yd window).
 */
export function resolveDownfieldYards(doc: PlayDocument): number {
  const losY = resolveLineOfScrimmageY(doc);
  return Math.round((1 - losY) * doc.sportProfile.fieldLengthYds);
}

/** Route end-decoration, defaulting to arrow. */
export function resolveEndDecoration(route: Route): EndDecoration {
  return route.endDecoration ?? "arrow";
}

/**
 * Routes inherit the carrier player's fill colour unless the user has
 * explicitly picked a different stroke. Legacy routes were all stored as
 * white, so treat white as "no explicit colour" and fall back to the
 * player's fill colour.
 */
export function resolveRouteStroke(route: Route, players: Player[]): string {
  const raw = route.style.stroke;
  const isDefault = raw.toLowerCase() === "#ffffff" || raw.toLowerCase() === "#fff";
  if (!isDefault) return raw;
  const carrier = players.find((p) => p.id === route.carrierPlayerId);
  return carrier?.style.fill ?? raw;
}

/* ------------------------------------------------------------------ */
/*  Sport-variant helpers                                             */
/* ------------------------------------------------------------------ */

/**
 * Canonical field dimensions for each sport variant.
 *
 * fieldLengthYds = 25 across the board — the display window always shows
 * 10 yards of backfield + 15 yards downfield from the line of scrimmage.
 * fieldWidthYds reflects the real sideline-to-sideline width for each sport.
 */
export function sportProfileForVariant(variant: SportVariant): SportProfile {
  switch (variant) {
    case "flag_5v5":
      return { variant, offensePlayerCount: 5,  defensePlayerCount: 5,  fieldWidthYds: 25, fieldLengthYds: 25, motionMustNotAdvanceTowardGoal: true };
    case "flag_7v7":
      return { variant, offensePlayerCount: 7,  defensePlayerCount: 7,  fieldWidthYds: 30, fieldLengthYds: 25, motionMustNotAdvanceTowardGoal: true };
    case "other":
      return { variant, offensePlayerCount: 6,  defensePlayerCount: 6,  fieldWidthYds: 40, fieldLengthYds: 25, motionMustNotAdvanceTowardGoal: false };
    case "tackle_11":
      return { variant, offensePlayerCount: 11, defensePlayerCount: 11, fieldWidthYds: 53, fieldLengthYds: 25, motionMustNotAdvanceTowardGoal: false };
  }
}

/** Number of defensive players for a variant, respecting playbook override for "other". */
export function defensePlayerCountForVariant(
  variant: SportVariant,
  customCount?: number | null,
): number {
  if (variant === "other" && typeof customCount === "number") return customCount;
  return sportProfileForVariant(variant).defensePlayerCount;
}

/** Human-readable label for each sport variant, for use in UI. */
export const SPORT_VARIANT_LABELS: Record<SportVariant, string> = {
  flag_5v5: "Flag",
  flag_7v7: "7v7",
  other: "Other",
  tackle_11: "Tackle",
};

function mkPlayer(
  id: string,
  role: Player["role"],
  label: string,
  x: number,
  y: number,
  eligible = true,
): Player {
  return {
    id,
    role,
    label,
    position: { x, y },
    eligible,
    style: { fill: "#f8fafc", stroke: "#0f172a", labelColor: "#0f172a" },
  };
}

/** Defender shape + red fill. Positioned above the LOS (y > losY). */
function mkDefender(
  id: string,
  role: Player["role"],
  label: string,
  x: number,
  y: number,
): Player {
  return {
    id,
    role,
    label,
    position: { x, y },
    eligible: true,
    shape: "triangle",
    style: { fill: "#EF4444", stroke: "#991b1b", labelColor: "#FFFFFF" },
  };
}

/**
 * Generate a generic offensive formation for a custom player count.
 * Always includes QB (shotgun) and C (center on LOS). Remaining players
 * are spread as WRs evenly across the width, outside players on the line
 * and inside/slot players slightly behind.
 */
export function generateOtherVariantPlayers(count: number): Player[] {
  const players: Player[] = [];
  players.push(mkPlayer("p_qb", "QB", "Q", 0.50, 0.20));
  players.push(mkPlayer("p_c",  "C",  "C", 0.50, 0.38, false));

  const remaining = Math.max(0, count - 2);
  if (remaining === 0) return players;

  const labels = ["X", "Y", "Z", "A", "H", "S", "W", "R", "V", "U"].slice(0, remaining);
  // Spread evenly from left (0.08) to right (0.92)
  for (let i = 0; i < remaining; i++) {
    const x = remaining === 1
      ? 0.50
      : 0.08 + (i / (remaining - 1)) * 0.84;
    const isOutside = x < 0.25 || x > 0.75;
    const y = isOutside ? 0.38 : 0.34;
    players.push(mkPlayer(`p_r${i}`, "WR", labels[i], x, y));
  }
  return players;
}

/**
 * Default offensive formation for each sport variant.
 *
 * All y-positions are calibrated for the 25-yard display window
 * (LOS default y=0.40 = 10 yds from bottom):
 *   y=0.38 ≈ on the line of scrimmage (0.5 yd back)
 *   y=0.34 ≈ 1.5 yds back
 *   y=0.28 ≈ 3 yds back
 *   y=0.20 ≈ 5 yds back (shotgun / RB depth)
 */
export function defaultPlayersForVariant(variant: SportVariant, playerCount?: number): Player[] {
  switch (variant) {
    case "flag_5v5":
      return [
        mkPlayer("p_qb", "QB",  "Q", 0.50, 0.20),        // shotgun QB, 5 yds back
        mkPlayer("p_c",  "C",   "C", 0.50, 0.38, false), // center on line
        mkPlayer("p_x",  "WR",  "X", 0.12, 0.38),        // wide left, on line
        mkPlayer("p_y",  "WR",  "Y", 0.32, 0.38),        // inside left, on line
        mkPlayer("p_z",  "WR",  "Z", 0.88, 0.38),        // wide right, on line
      ];
    case "flag_7v7":
      return defaultFlagSevenPlayers();
    case "other":
      return generateOtherVariantPlayers(playerCount ?? 6);
    case "tackle_11":
      return [
        mkPlayer("p_qb", "QB",    "Q", 0.50, 0.34),        // under center, 1.5 yds back
        mkPlayer("p_c",  "C",     "C", 0.50, 0.38, false), // center on line
        mkPlayer("p_lg", "OTHER", "G", 0.44, 0.38, false), // left guard on line
        mkPlayer("p_rg", "OTHER", "G", 0.56, 0.38, false), // right guard on line
        mkPlayer("p_lt", "OTHER", "T", 0.37, 0.38, false), // left tackle on line
        mkPlayer("p_rt", "OTHER", "T", 0.63, 0.38, false), // right tackle on line
        mkPlayer("p_te", "TE",    "Y", 0.72, 0.38),        // tight end on line
        mkPlayer("p_x",  "WR",    "X", 0.05, 0.38),        // split end on line
        mkPlayer("p_z",  "WR",    "Z", 0.90, 0.34),        // flanker, 1.5 yds back
        mkPlayer("p_h",  "WR",    "H", 0.82, 0.30),        // slot, 2.5 yds back
        mkPlayer("p_rb", "RB",    "B", 0.50, 0.22),        // RB, 4.5 yds back
      ];
  }
}

let idCounter = 0;
export function uid(prefix: string) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export function mkZone(
  kind: "rectangle" | "ellipse",
  label: string,
  center: { x: number; y: number } = { x: 0.5, y: 0.65 },
): import("./types").Zone {
  return {
    id: uid("zn"),
    kind,
    center,
    size: { w: 0.14, h: 0.1 },
    label,
    style: { fill: "rgba(59,130,246,0.18)", stroke: "rgba(59,130,246,0.7)" },
  };
}

/** Default 7v7 offensive positions — normalized field box */
export function defaultFlagSevenPlayers(): Player[] {
  const mk = (
    id: string,
    role: Player["role"],
    label: string,
    x: number,
    y: number,
  ): Player => ({
    id,
    role,
    label,
    position: { x, y },
    eligible: true,
    style: {
      fill: "#f8fafc",
      stroke: "#0f172a",
      labelColor: "#0f172a",
    },
  });

  return [
    mk("p_qb", "QB", "Q", 0.50, 0.20),  // shotgun QB, 5 yds back
    mk("p_c",  "C",  "C", 0.50, 0.38),  // center on line
    mk("p_s",  "WR", "S", 0.28, 0.34),  // slot left, 1.5 yds back
    mk("p_x",  "WR", "X", 0.10, 0.38),  // wide left, on line
    mk("p_y",  "WR", "Y", 0.66, 0.34),  // slot right, 1.5 yds back
    mk("p_z",  "WR", "Z", 0.90, 0.38),  // wide right, on line
    mk("p_f",  "RB", "F", 0.50, 0.28),  // flex/RB, 3 yds back
  ];
}

export function createEmptyPlayDocument(overrides?: Partial<PlayDocument>): PlayDocument {
  const variant: SportVariant =
    (overrides?.sportProfile?.variant as SportVariant | undefined) ?? "flag_7v7";
  const players = defaultPlayersForVariant(variant);
  const anchors: Record<string, { x: number; y: number }> = {};
  for (const p of players) anchors[p.label] = { ...p.position };

  const base: PlayDocument = {
    schemaVersion: PLAY_DOCUMENT_SCHEMA_VERSION,
    sportProfile: sportProfileForVariant(variant),
    lineOfScrimmageY: 0.4,
    metadata: {
      coachName: "New Play",
      shorthand: "",
      wristbandCode: "",
      mnemonic: "",
      sheetAbbrev: "",
      formation: "",
      concept: "",
      tags: [],
      formationId: null,
      formationTag: null,
      playType: "offense",
      specialTeamsUnit: null,
      opponentFormationId: null,
    },
    formation: {
      semantic: { key: "" },
      layout: { playerAnchors: anchors },
    },
    layers: {
      players,
      routes: [],
      annotations: [],
      zones: [],
    },
    printProfile: {
      visibility: {
        showPlayerLabels: true,
        showNotes: true,
        showProgression: true,
        showWristbandCode: true,
      },
      wristband: {
        gridRows: 2,
        gridCols: 4,
        diagramScale: 1,
        density: "standard",
      },
      sheetDiagramScale: 1,
      fontScale: 1,
    },
    timeline: {
      durationMs: 2800,
      routeStartOffsets: {},
    },
  };

  return { ...base, ...overrides };
}

/**
 * Normalize a PlayDocument loaded from the database.
 *
 * Older saves may have stale sportProfile dimensions (e.g. fieldLengthYds: 40)
 * or player positions calibrated against the old LOS default (y=0.5).  This
 * function:
 *   1. Re-derives sportProfile from the variant so field dimensions are always
 *      the canonical 25-yard window values.
 *   2. If the document has no explicit lineOfScrimmageY stored (i.e. it was
 *      using the old 0.5 default), it migrates player y-positions by the delta
 *      between old and new defaults (−0.10) so they land in the correct
 *      backfield zone relative to the new LOS.
 *   3. Sets lineOfScrimmageY: 0.4 explicitly so the document is self-contained.
 */
export function normalizePlayDocument(doc: PlayDocument): PlayDocument {
  // Upgrade schema-level defaults first.
  doc = migratePlayDocument(doc);
  const canonical = sportProfileForVariant(doc.sportProfile.variant);

  // For "other" variant, preserve the user's custom player count.
  // Also preserve fieldLengthYds if the user has customized it — but
  // treat the old stale value of 40 as "not set" and reset to canonical 25.
  const storedFieldLength = doc.sportProfile.fieldLengthYds;
  const effectiveFieldLength =
    storedFieldLength === 40 ? canonical.fieldLengthYds : storedFieldLength;

  const sportProfile =
    doc.sportProfile.variant === "other"
      ? {
          ...canonical,
          offensePlayerCount: doc.sportProfile.offensePlayerCount,
          defensePlayerCount:
            doc.sportProfile.defensePlayerCount ?? doc.sportProfile.offensePlayerCount,
          fieldLengthYds: effectiveFieldLength,
        }
      : { ...canonical, fieldLengthYds: effectiveFieldLength };

  // If the stored LOS is the old 0.5 default (no explicit value was ever
  // saved), migrate player positions so they remain in the backfield relative
  // to the new default (0.4).
  const storedLos = doc.lineOfScrimmageY;
  const needsPlayerMigration =
    typeof storedLos !== "number" || storedLos === 0.5;
  const oldLos = 0.5;
  // If no migration needed, preserve the user's stored LOS (e.g. from yard spinners).
  const effectiveLos = needsPlayerMigration ? 0.4 : storedLos;

  const players = needsPlayerMigration
    ? doc.layers.players.map((p) => ({
        ...p,
        position: {
          x: p.position.x,
          // Shift y by the same delta the LOS moved, preserving relative
          // distance from the line.  Clamp to [0, 1].
          y: Math.max(0, Math.min(1, p.position.y - (oldLos - effectiveLos))),
        },
      }))
    : doc.layers.players;

  return {
    ...doc,
    sportProfile,
    lineOfScrimmageY: effectiveLos,
    layers: {
      ...doc.layers,
      players,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Defensive formations                                              */
/* ------------------------------------------------------------------ */

/**
 * Defensive templates are keyed by sport variant. Positions use the same
 * normalized field coords as offense; defensive players sit ABOVE the LOS
 * (y > 0.4 default). Each template includes a `key` (stable, semantic),
 * a `displayName` for UI, and the default player set.
 */
export type DefenseTemplate = {
  key: string;
  displayName: string;
  description: string;
  variant: SportVariant;
  players: Player[];
};

// LOS default = 0.4 across the app. Defenders sit slightly above (y > 0.4).
// Linebackers ~3 yards off LOS (~0.45); safeties deep (~0.70).

export function defenseTemplatesForVariant(variant: SportVariant): DefenseTemplate[] {
  switch (variant) {
    case "flag_5v5":
      // Normalized y: LOS = 0.4, 1 yd ≈ 0.04. 4 yds off = 0.56, 7 yds deep = 0.68, 1 yd off = 0.44.
      // Labels: outside = CB, middle = LB, others = S.
      return [
        {
          key: "flag5_base",
          displayName: "Base",
          description: "All defenders 4 yards off the ball",
          variant,
          players: [
            mkDefender("d_cb1", "CB", "C", 0.15, 0.56),
            mkDefender("d_s1",  "S",  "S", 0.32, 0.56),
            mkDefender("d_lb",  "LB", "M", 0.50, 0.56),
            mkDefender("d_s2",  "S",  "S", 0.68, 0.56),
            mkDefender("d_cb2", "CB", "C", 0.85, 0.56),
          ],
        },
        {
          key: "flag5_cover2",
          displayName: "Cover 2",
          description: "Two safeties 7 yards deep, three defenders 4 yards off",
          variant,
          players: [
            mkDefender("d_cb1", "CB", "C", 0.15, 0.56),
            mkDefender("d_lb",  "LB", "M", 0.50, 0.56),
            mkDefender("d_cb2", "CB", "C", 0.85, 0.56),
            mkDefender("d_fs",  "S",  "F", 0.30, 0.68),
            mkDefender("d_ss",  "S",  "S", 0.70, 0.68),
          ],
        },
        {
          key: "flag5_press",
          displayName: "Press",
          description: "Two safeties deep, three defenders pressing 1 yard off the ball",
          variant,
          players: [
            mkDefender("d_cb1", "CB", "C", 0.15, 0.44),
            mkDefender("d_lb",  "LB", "M", 0.50, 0.44),
            mkDefender("d_cb2", "CB", "C", 0.85, 0.44),
            mkDefender("d_fs",  "S",  "F", 0.30, 0.68),
            mkDefender("d_ss",  "S",  "S", 0.70, 0.68),
          ],
        },
      ];
    case "flag_7v7":
      return [
        {
          key: "flag7_base",
          displayName: "Base",
          description: "All defenders 4 yards off the ball",
          variant,
          players: [
            mkDefender("d_cb1", "CB", "C", 0.10, 0.56),
            mkDefender("d_s1",  "S",  "S", 0.25, 0.56),
            mkDefender("d_lb1", "LB", "M", 0.40, 0.56),
            mkDefender("d_lb2", "LB", "M", 0.50, 0.56),
            mkDefender("d_lb3", "LB", "M", 0.60, 0.56),
            mkDefender("d_s2",  "S",  "S", 0.75, 0.56),
            mkDefender("d_cb2", "CB", "C", 0.90, 0.56),
          ],
        },
        {
          key: "flag7_cover2",
          displayName: "Cover 2",
          description: "Two safeties 7 yards deep, five defenders 4 yards off",
          variant,
          players: [
            mkDefender("d_cb1", "CB", "C", 0.10, 0.56),
            mkDefender("d_lb1", "LB", "M", 0.30, 0.56),
            mkDefender("d_lb2", "LB", "M", 0.50, 0.56),
            mkDefender("d_lb3", "LB", "M", 0.70, 0.56),
            mkDefender("d_cb2", "CB", "C", 0.90, 0.56),
            mkDefender("d_fs",  "S",  "F", 0.30, 0.68),
            mkDefender("d_ss",  "S",  "S", 0.70, 0.68),
          ],
        },
        {
          key: "flag7_press",
          displayName: "Press",
          description: "Two safeties deep, five defenders pressing 1 yard off the ball",
          variant,
          players: [
            mkDefender("d_cb1", "CB", "C", 0.10, 0.44),
            mkDefender("d_lb1", "LB", "M", 0.30, 0.44),
            mkDefender("d_lb2", "LB", "M", 0.50, 0.44),
            mkDefender("d_lb3", "LB", "M", 0.70, 0.44),
            mkDefender("d_cb2", "CB", "C", 0.90, 0.44),
            mkDefender("d_fs",  "S",  "F", 0.30, 0.68),
            mkDefender("d_ss",  "S",  "S", 0.70, 0.68),
          ],
        },
      ];
    case "tackle_11":
      return [
        {
          key: "tackle11_43_over",
          displayName: "4-3 Over",
          description: "Four down linemen, three linebackers",
          variant,
          players: [
            mkDefender("d_de1", "DL", "E", 0.30, 0.43),
            mkDefender("d_dt1", "DL", "T", 0.42, 0.43),
            mkDefender("d_dt2", "DL", "T", 0.54, 0.43),
            mkDefender("d_de2", "DL", "E", 0.70, 0.43),
            mkDefender("d_sam", "LB", "S", 0.30, 0.50),
            mkDefender("d_mlb", "LB", "M", 0.50, 0.50),
            mkDefender("d_will","LB", "W", 0.70, 0.50),
            mkDefender("d_cb1", "CB", "C", 0.08, 0.46),
            mkDefender("d_cb2", "CB", "C", 0.92, 0.46),
            mkDefender("d_fs",  "S",  "F", 0.38, 0.76),
            mkDefender("d_ss",  "S",  "S", 0.62, 0.76),
          ],
        },
        {
          key: "tackle11_34_base",
          displayName: "3-4 Base",
          description: "Three down linemen, four linebackers",
          variant,
          players: [
            mkDefender("d_de1", "DL", "E", 0.36, 0.43),
            mkDefender("d_nt",  "DL", "N", 0.50, 0.43),
            mkDefender("d_de2", "DL", "E", 0.64, 0.43),
            mkDefender("d_olb1","LB", "O", 0.24, 0.47),
            mkDefender("d_ilb1","LB", "I", 0.42, 0.50),
            mkDefender("d_ilb2","LB", "I", 0.58, 0.50),
            mkDefender("d_olb2","LB", "O", 0.76, 0.47),
            mkDefender("d_cb1", "CB", "C", 0.08, 0.46),
            mkDefender("d_cb2", "CB", "C", 0.92, 0.46),
            mkDefender("d_fs",  "S",  "F", 0.38, 0.76),
            mkDefender("d_ss",  "S",  "S", 0.62, 0.76),
          ],
        },
      ];
    case "other":
      return [
        {
          key: "other_balanced_zone",
          displayName: "Balanced Zone",
          description: "Evenly-spaced front with deep help",
          variant,
          players: generateDefaultDefenders(6),
        },
      ];
  }
}

/** Generic defender layout for "other" variant / custom player counts. */
export function generateDefaultDefenders(count: number): Player[] {
  const players: Player[] = [];
  const frontCount = Math.min(Math.max(Math.floor(count / 2), 2), count - 1);
  const backCount = count - frontCount;
  for (let i = 0; i < frontCount; i++) {
    const x = frontCount === 1 ? 0.5 : 0.20 + (i / (frontCount - 1)) * 0.60;
    players.push(mkDefender(`d_f${i}`, "LB", "D", x, 0.46));
  }
  for (let i = 0; i < backCount; i++) {
    const x = backCount === 1 ? 0.5 : 0.15 + (i / (backCount - 1)) * 0.70;
    players.push(mkDefender(`d_b${i}`, "S", "D", x, 0.72));
  }
  return players;
}

/** Default defender set for a variant when no template is selected. */
export function defaultDefendersForVariant(
  variant: SportVariant,
  customCount?: number | null,
): Player[] {
  if (variant === "other") {
    return generateDefaultDefenders(customCount ?? 6);
  }
  // Use the first template as the blank default.
  return defenseTemplatesForVariant(variant)[0].players.map((p) => ({ ...p }));
}

/* ------------------------------------------------------------------ */
/*  Special teams templates (tackle only)                             */
/* ------------------------------------------------------------------ */

export type SpecialTeamsTemplate = {
  key: string;
  unit: SpecialTeamsUnit;
  displayName: string;
  description: string;
  players: Player[];
};

// Special teams players use neutral styling + a small square marker to
// distinguish from offense/defense.
function mkST(
  id: string,
  role: Player["role"],
  label: string,
  x: number,
  y: number,
): Player {
  return {
    id,
    role,
    label,
    position: { x, y },
    eligible: true,
    shape: "square",
    style: { fill: "#e0f2fe", stroke: "#0369a1", labelColor: "#0c4a6e" },
  };
}

export function specialTeamsTemplates(): SpecialTeamsTemplate[] {
  return [
    {
      key: "st_punt",
      unit: "punt",
      displayName: "Punt",
      description: "Standard spread punt formation",
      players: [
        mkST("st_p",  "P",  "P", 0.50, 0.05),
        mkST("st_ps", "LS", "S", 0.50, 0.38),
        mkST("st_pg1","ST", "G", 0.44, 0.38),
        mkST("st_pg2","ST", "G", 0.56, 0.38),
        mkST("st_pt1","ST", "T", 0.36, 0.38),
        mkST("st_pt2","ST", "T", 0.64, 0.38),
        mkST("st_pw1","ST", "W", 0.16, 0.38),
        mkST("st_pw2","ST", "W", 0.84, 0.38),
        mkST("st_pu1","ST", "U", 0.28, 0.30),
        mkST("st_pu2","ST", "U", 0.72, 0.30),
        mkST("st_pp", "ST", "PP", 0.50, 0.18),
      ],
    },
    {
      key: "st_punt_left",
      unit: "punt_left",
      displayName: "Punt Left",
      description: "Punt formation rolled left",
      players: [
        mkST("st_p",  "P",  "P", 0.40, 0.05),
        mkST("st_ps", "LS", "S", 0.50, 0.38),
        mkST("st_pg1","ST", "G", 0.44, 0.38),
        mkST("st_pg2","ST", "G", 0.56, 0.38),
        mkST("st_pt1","ST", "T", 0.36, 0.38),
        mkST("st_pt2","ST", "T", 0.64, 0.38),
        mkST("st_pw1","ST", "W", 0.12, 0.38),
        mkST("st_pw2","ST", "W", 0.80, 0.38),
        mkST("st_pu1","ST", "U", 0.24, 0.30),
        mkST("st_pu2","ST", "U", 0.68, 0.30),
        mkST("st_pp", "ST", "PP", 0.40, 0.18),
      ],
    },
    {
      key: "st_punt_right",
      unit: "punt_right",
      displayName: "Punt Right",
      description: "Punt formation rolled right",
      players: [
        mkST("st_p",  "P",  "P", 0.60, 0.05),
        mkST("st_ps", "LS", "S", 0.50, 0.38),
        mkST("st_pg1","ST", "G", 0.44, 0.38),
        mkST("st_pg2","ST", "G", 0.56, 0.38),
        mkST("st_pt1","ST", "T", 0.36, 0.38),
        mkST("st_pt2","ST", "T", 0.64, 0.38),
        mkST("st_pw1","ST", "W", 0.20, 0.38),
        mkST("st_pw2","ST", "W", 0.88, 0.38),
        mkST("st_pu1","ST", "U", 0.32, 0.30),
        mkST("st_pu2","ST", "U", 0.76, 0.30),
        mkST("st_pp", "ST", "PP", 0.60, 0.18),
      ],
    },
    {
      key: "st_punt_return",
      unit: "punt_return",
      displayName: "Punt Return",
      description: "Punt return w/ two returners",
      players: [
        mkST("st_j1","ST","J",0.12,0.44),
        mkST("st_j2","ST","J",0.88,0.44),
        mkST("st_r1","ST","R",0.25,0.50),
        mkST("st_r2","ST","R",0.40,0.50),
        mkST("st_r3","ST","R",0.60,0.50),
        mkST("st_r4","ST","R",0.75,0.50),
        mkST("st_h1","ST","H",0.30,0.62),
        mkST("st_h2","ST","H",0.70,0.62),
        mkST("st_h3","ST","H",0.50,0.62),
        mkST("st_pr1","ST","PR",0.40,0.88),
        mkST("st_pr2","ST","PR",0.60,0.88),
      ],
    },
    {
      key: "st_field_goal",
      unit: "field_goal",
      displayName: "Field Goal",
      description: "FG unit with kicker + holder",
      players: [
        mkST("st_k","K","K",0.46,0.20),
        mkST("st_h","ST","H",0.50,0.30),
        mkST("st_ls","LS","S",0.50,0.38),
        mkST("st_g1","ST","G",0.44,0.38),
        mkST("st_g2","ST","G",0.56,0.38),
        mkST("st_t1","ST","T",0.38,0.38),
        mkST("st_t2","ST","T",0.62,0.38),
        mkST("st_w1","ST","W",0.30,0.38),
        mkST("st_w2","ST","W",0.70,0.38),
        mkST("st_u1","ST","U",0.23,0.38),
        mkST("st_u2","ST","U",0.77,0.38),
      ],
    },
    {
      key: "st_extra_point",
      unit: "extra_point",
      displayName: "Extra Point",
      description: "PAT unit (same as FG)",
      players: [
        mkST("st_k","K","K",0.46,0.22),
        mkST("st_h","ST","H",0.50,0.32),
        mkST("st_ls","LS","S",0.50,0.38),
        mkST("st_g1","ST","G",0.44,0.38),
        mkST("st_g2","ST","G",0.56,0.38),
        mkST("st_t1","ST","T",0.38,0.38),
        mkST("st_t2","ST","T",0.62,0.38),
        mkST("st_w1","ST","W",0.30,0.38),
        mkST("st_w2","ST","W",0.70,0.38),
        mkST("st_u1","ST","U",0.23,0.38),
        mkST("st_u2","ST","U",0.77,0.38),
      ],
    },
    {
      key: "st_kickoff",
      unit: "kickoff",
      displayName: "Kickoff",
      description: "Kickoff coverage team",
      players: [
        mkST("st_k", "K","K", 0.50, 0.10),
        mkST("st_c1","ST","C",0.08,0.22),
        mkST("st_c2","ST","C",0.20,0.22),
        mkST("st_c3","ST","C",0.32,0.22),
        mkST("st_c4","ST","C",0.42,0.22),
        mkST("st_c5","ST","C",0.50,0.22),
        mkST("st_c6","ST","C",0.58,0.22),
        mkST("st_c7","ST","C",0.68,0.22),
        mkST("st_c8","ST","C",0.80,0.22),
        mkST("st_s1","ST","S",0.26,0.14),
        mkST("st_s2","ST","S",0.74,0.14),
      ],
    },
    {
      key: "st_kick_return",
      unit: "kick_return",
      displayName: "Kick Return",
      description: "Kick return w/ two deep returners",
      players: [
        mkST("st_f1","ST","F",0.20,0.44),
        mkST("st_f2","ST","F",0.40,0.44),
        mkST("st_f3","ST","F",0.60,0.44),
        mkST("st_f4","ST","F",0.80,0.44),
        mkST("st_m1","ST","M",0.25,0.58),
        mkST("st_m2","ST","M",0.50,0.58),
        mkST("st_m3","ST","M",0.75,0.58),
        mkST("st_h1","ST","H",0.35,0.72),
        mkST("st_h2","ST","H",0.65,0.72),
        mkST("st_r1","ST","R",0.40,0.92),
        mkST("st_r2","ST","R",0.60,0.92),
      ],
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  v1 → v2 loader                                                    */
/* ------------------------------------------------------------------ */

/**
 * Migrate a persisted PlayDocument up to the current schema version.
 * v1 docs predate playType, zones, and defensePlayerCount — default them
 * so editor/renderer code can treat all docs uniformly.
 */
export function migratePlayDocument(
  raw: PlayDocument & { schemaVersion?: number },
): PlayDocument {
  const doc: PlayDocument = { ...raw, schemaVersion: PLAY_DOCUMENT_SCHEMA_VERSION };
  // Backfill defensePlayerCount on the sportProfile (mirror offense by default).
  if (typeof (doc.sportProfile as SportProfile).defensePlayerCount !== "number") {
    const canonical = sportProfileForVariant(doc.sportProfile.variant);
    doc.sportProfile = {
      ...doc.sportProfile,
      defensePlayerCount: canonical.defensePlayerCount,
    };
  }
  // Default playType = "offense" for legacy docs.
  if (!doc.metadata.playType) {
    doc.metadata = { ...doc.metadata, playType: "offense" };
  }
  // Default zones layer.
  if (!doc.layers.zones) {
    doc.layers = { ...doc.layers, zones: [] };
  }
  return doc;
}
