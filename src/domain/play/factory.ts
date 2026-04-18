import {
  PLAY_DOCUMENT_SCHEMA_VERSION,
  type EndDecoration,
  type PlayDocument,
  type Player,
  type Route,
  type SportProfile,
  type SportVariant,
} from "./types";

/** Whether hash marks should render by default for a given sport variant.
 *  Flag football plays a smaller, cleaner field — hash marks are noise.
 *  Tackle/6-man plays on a real field — hash marks are expected. */
export function shouldShowHashMarksDefault(variant: SportVariant): boolean {
  return variant === "tackle_11" || variant === "six_man";
}

/** Resolve the effective hash-mark setting: explicit override wins,
 *  otherwise derive from sport variant. */
export function resolveShowHashMarks(doc: PlayDocument): boolean {
  if (typeof doc.showHashMarks === "boolean") return doc.showHashMarks;
  return shouldShowHashMarksDefault(doc.sportProfile.variant);
}

/** LOS marker style, defaulting to a horizontal line. */
export function resolveLineOfScrimmage(
  doc: PlayDocument,
): "line" | "football" | "none" {
  return doc.lineOfScrimmage ?? "line";
}

/** Normalized y where the LOS lives. Defaults to mid-field (0.5). */
export function resolveLineOfScrimmageY(doc: PlayDocument): number {
  const y = doc.lineOfScrimmageY;
  if (typeof y === "number" && Number.isFinite(y)) {
    return Math.max(0, Math.min(1, y));
  }
  return 0.5;
}

/** Route end-decoration, defaulting to arrow. */
export function resolveEndDecoration(route: Route): EndDecoration {
  return route.endDecoration ?? "arrow";
}

/* ------------------------------------------------------------------ */
/*  Sport-variant helpers                                             */
/* ------------------------------------------------------------------ */

/** Canonical field + roster dimensions for each supported sport variant. */
export function sportProfileForVariant(variant: SportVariant): SportProfile {
  switch (variant) {
    case "flag_5v5":
      return { variant, offensePlayerCount: 5, fieldWidthYds: 25, fieldLengthYds: 30, motionMustNotAdvanceTowardGoal: true };
    case "flag_7v7":
      return { variant, offensePlayerCount: 7, fieldWidthYds: 30, fieldLengthYds: 40, motionMustNotAdvanceTowardGoal: true };
    case "six_man":
      return { variant, offensePlayerCount: 6, fieldWidthYds: 40, fieldLengthYds: 80, motionMustNotAdvanceTowardGoal: false };
    case "tackle_11":
      return { variant, offensePlayerCount: 11, fieldWidthYds: 53, fieldLengthYds: 100, motionMustNotAdvanceTowardGoal: false };
  }
}

/** Human-readable label for each sport variant, for use in UI. */
export const SPORT_VARIANT_LABELS: Record<SportVariant, string> = {
  flag_5v5: "Flag 5v5",
  flag_7v7: "Flag 7v7",
  six_man: "6-Man",
  tackle_11: "11-Man Tackle",
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

/** Default offensive formation for each sport variant. */
export function defaultPlayersForVariant(variant: SportVariant): Player[] {
  switch (variant) {
    case "flag_5v5":
      return [
        mkPlayer("p_qb", "QB",  "Q", 0.50, 0.12),
        mkPlayer("p_c",  "C",   "C", 0.50, 0.06, false),
        mkPlayer("p_x",  "WR",  "X", 0.15, 0.38),
        mkPlayer("p_y",  "WR",  "Y", 0.50, 0.38),
        mkPlayer("p_z",  "WR",  "Z", 0.85, 0.38),
      ];
    case "flag_7v7":
      return defaultFlagSevenPlayers();
    case "six_man":
      return [
        mkPlayer("p_qb", "QB",    "Q", 0.50, 0.12),
        mkPlayer("p_c",  "C",     "C", 0.50, 0.06, false),
        mkPlayer("p_lt", "OTHER", "T", 0.38, 0.06, false),
        mkPlayer("p_rt", "OTHER", "E", 0.62, 0.06),
        mkPlayer("p_x",  "WR",    "X", 0.12, 0.28),
        mkPlayer("p_z",  "WR",    "Z", 0.88, 0.28),
      ];
    case "tackle_11":
      return [
        mkPlayer("p_qb", "QB",    "Q", 0.50, 0.22),
        mkPlayer("p_c",  "C",     "C", 0.50, 0.06, false),
        mkPlayer("p_lg", "OTHER", "G", 0.44, 0.06, false),
        mkPlayer("p_rg", "OTHER", "G", 0.56, 0.06, false),
        mkPlayer("p_lt", "OTHER", "T", 0.37, 0.06, false),
        mkPlayer("p_rt", "OTHER", "T", 0.63, 0.06, false),
        mkPlayer("p_te", "TE",    "Y", 0.72, 0.06),
        mkPlayer("p_x",  "WR",    "X", 0.05, 0.06),
        mkPlayer("p_z",  "WR",    "Z", 0.90, 0.14),
        mkPlayer("p_h",  "WR",    "H", 0.82, 0.22),
        mkPlayer("p_rb", "RB",    "B", 0.50, 0.34),
      ];
  }
}

let idCounter = 0;
function uid(prefix: string) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
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
    mk("p_qb", "QB", "Q", 0.5, 0.12),
    mk("p_c", "C", "C", 0.5, 0.06),
    mk("p_s", "WR", "S", 0.22, 0.22),
    mk("p_x", "WR", "X", 0.12, 0.38),
    mk("p_y", "WR", "Y", 0.5, 0.38),
    mk("p_z", "WR", "Z", 0.88, 0.38),
    mk("p_f", "RB", "F", 0.78, 0.22),
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
    metadata: {
      coachName: "Trips Right — Stick",
      shorthand: "TR STK",
      wristbandCode: "01",
      mnemonic: "",
      sheetAbbrev: "TR STK",
      formation: "Trips Right",
      concept: "Stick",
      tag: "",
    },
    formation: {
      semantic: { key: "trips_right", strength: "right" },
      layout: { presetId: "trips_right", playerAnchors: anchors },
    },
    layers: {
      players,
      routes: [],
      annotations: [],
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

export { uid };
