/** Normalized field coordinates: origin bottom-left, x right, y up; range typically 0–1 */

export const PLAY_DOCUMENT_SCHEMA_VERSION = 2 as const;

export type SportVariant =
  | "flag_5v5"
  | "flag_7v7"
  | "tackle_11"
  | "other";

/** Which side of the ball / phase of play this is. */
export type PlayType = "offense" | "defense" | "special_teams";

/** Special-teams unit (only meaningful when playType === "special_teams"). */
export type SpecialTeamsUnit =
  | "punt"
  | "punt_left"
  | "punt_right"
  | "punt_return"
  | "field_goal"
  | "extra_point"
  | "kickoff"
  | "kick_return";

export type PlayerRole =
  | "QB" | "RB" | "WR" | "TE" | "C"
  // Defensive roles
  | "DL" | "LB" | "CB" | "S" | "NB"
  // Special teams
  | "K" | "P" | "LS" | "ST"
  | "OTHER";

export type PlayerShape = "circle" | "square" | "diamond" | "triangle" | "star";

export type Point2 = { x: number; y: number };

export type PathSegmentKind =
  | "freehand_simplified"
  | "clicked"
  | "template";

export type LineSegment = {
  type: "line";
  from: Point2;
  to: Point2;
  kind: PathSegmentKind;
};

export type QuadraticSegment = {
  type: "quadratic";
  from: Point2;
  control: Point2;
  to: Point2;
  kind: PathSegmentKind;
};

export type PathSegment = LineSegment | QuadraticSegment;

export type PathGeometry = {
  segments: PathSegment[];
  closed?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Node-based route model                                            */
/* ------------------------------------------------------------------ */

export type RouteNode = {
  id: string;
  position: Point2;
};

export type SegmentShape = "straight" | "curve" | "zigzag";
export type StrokePattern = "solid" | "dashed" | "dotted" | "motion";

export type RouteSegment = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  shape: SegmentShape;
  strokePattern: StrokePattern;
  /** Manual curve control offset (null = auto-computed) */
  controlOffset: Point2 | null;
};

export type RouteSemantic = {
  family:
    | "slant"
    | "go"
    | "post"
    | "corner"
    | "comeback"
    | "out"
    | "in"
    | "whip"
    | "wheel"
    | "flat"
    | "custom";
  tags?: string[];
  confidence?: number;
};

export type RouteStyle = {
  stroke: string;
  strokeWidth: number;
  dash?: string;
};

/** How the tip of a route is decorated at its terminal node. */
export type EndDecoration = "arrow" | "t" | "none";

export type Route = {
  id: string;
  carrierPlayerId: string;
  semantic: RouteSemantic | null;
  nodes: RouteNode[];
  segments: RouteSegment[];
  style: RouteStyle;
  motion?: boolean;
  /** End-of-route decoration (arrow/T/none). Defaults to "arrow" when unset. */
  endDecoration?: EndDecoration;
};

export type PlayerStyle = {
  fill: string;
  stroke: string;
  labelColor: string;
};

export type Player = {
  id: string;
  role: PlayerRole;
  label: string;
  position: Point2;
  eligible: boolean;
  style: PlayerStyle;
  shape?: PlayerShape;
  /** When true, a star badge is rendered on the player circle to mark them as a hot route. */
  isHotRoute?: boolean;
};

export type Annotation = {
  id: string;
  text: string;
  anchor: Point2;
  progressionIndex?: number;
};

export type FormationSemantic = {
  key: string;
  strength?: "left" | "right" | "balanced";
  params?: Record<string, string | number | boolean>;
};

export type FormationLayout = {
  /** Preset id or custom */
  presetId?: string;
  playerAnchors: Record<string, Point2>;
};

export type FormationState = {
  semantic: FormationSemantic;
  layout: FormationLayout;
};

export type SportProfile = {
  variant: SportVariant;
  offensePlayerCount: number;
  /** Number of defensive players per side. Mirrors offense for standard variants. */
  defensePlayerCount: number;
  fieldWidthYds: number;
  fieldLengthYds: number;
  motionMustNotAdvanceTowardGoal?: boolean;
};

/**
 * Defensive coverage zone (hook, flat, deep thirds, etc). Rendered as a
 * translucent rectangle or ellipse with an optional label.
 */
export type Zone = {
  id: string;
  kind: "rectangle" | "ellipse";
  /** Center point of the zone, in normalized field coords. */
  center: Point2;
  /** Half-extents (rectangle half-width/half-height; ellipse rx/ry). */
  size: { w: number; h: number };
  label: string;
  style: { fill: string; stroke: string };
};

export type PrintVisibility = {
  showPlayerLabels: boolean;
  showNotes: boolean;
  showProgression: boolean;
  showWristbandCode: boolean;
};

export type WristbandPrintSettings = {
  gridRows: number;
  gridCols: number;
  diagramScale: number;
  density: "compact" | "standard" | "roomy";
};

export type PrintProfile = {
  visibility: PrintVisibility;
  wristband: WristbandPrintSettings;
  sheetDiagramScale: number;
  fontScale: number;
};

export type PlayMetadata = {
  coachName: string;
  shorthand: string;
  wristbandCode: string;
  mnemonic?: string;
  sheetAbbrev: string;
  formation: string;
  concept: string;
  /** User-defined tags for grouping (e.g. pass, run, reverse). */
  tags: string[];
  /** Free-form notes explaining how to read/execute the play. */
  notes?: string;
  /** FK to formations.id; null/undefined = no specific formation. */
  formationId?: string | null;
  /** Short modifier tag (e.g. "Under Center", "Open"). */
  formationTag?: string | null;
  /** Side of the ball / phase of play. Defaults to "offense". */
  playType?: PlayType;
  /** When playType === "special_teams", which unit this is. */
  specialTeamsUnit?: SpecialTeamsUnit | null;
  /**
   * FK to formations.id of the opposing side to overlay in gray (no routes
   * or zones). Lets coaches visualize their play against a specific look.
   */
  opponentFormationId?: string | null;
  /**
   * Defense-only. FK to plays.id of the offensive play this defense was
   * "installed against". When set, the play renders and animates alongside
   * the frozen offensive snapshot stored in `vsPlaySnapshot`.
   */
  vsPlayId?: string | null;
  /**
   * Frozen copy of the vs play's players/routes, captured at install (and
   * rewritten by "Re-sync"). Source of truth for rendering — later edits to
   * the offense do not leak into the matchup until resync.
   */
  vsPlaySnapshot?: VsPlaySnapshot | null;
};

export type VsPlaySnapshot = {
  players: Player[];
  routes: Route[];
  lineOfScrimmageY: number;
  sourceVersionId: string;
  snapshotAt: string;
  sourceName: string;
  sourceFormationName: string;
};

export type PlayLayers = {
  players: Player[];
  routes: Route[];
  annotations: Annotation[];
  /** Defensive coverage zones. Empty for offensive plays. */
  zones?: Zone[];
};

export type PlayTimeline = {
  durationMs: number;
  routeStartOffsets: Record<string, number>;
};

export type PlayDocument = {
  schemaVersion: typeof PLAY_DOCUMENT_SCHEMA_VERSION;
  sportProfile: SportProfile;
  metadata: PlayMetadata;
  formation: FormationState;
  layers: PlayLayers;
  printProfile: PrintProfile;
  timeline?: PlayTimeline;
  fieldBackground?: "green" | "white" | "black" | "gray";
  /**
   * Whether to render yard hash marks on the field. When `undefined`, the
   * default is derived from sportProfile.variant (flag variants off, tackle
   * variants on) — see `shouldShowHashMarksDefault`.
   */
  showHashMarks?: boolean;
  /**
   * Hash-mark lateral position. When set, overrides `showHashMarks` —
   * "none" hides, the others choose the column width:
   *   narrow = NFL-style (44% / 56%)
   *   normal = college/NCAA (37.5% / 62.5%)
   *   wide   = high school & youth (33.3% / 66.7%)
   */
  hashStyle?: "narrow" | "normal" | "wide" | "none";
  /**
   * Whether to render the yard numbers (5, 10, 15…) painted on the field.
   * Defaults to `true`.
   */
  showYardNumbers?: boolean;
  /**
   * Line-of-scrimmage marker style. Drawn at `lineOfScrimmageY`.
   * Defaults to "line".
   */
  lineOfScrimmage?: "line" | "football" | "none";
  /**
   * Normalized y of the LOS (0 = back of offense's backfield, 1 = far end
   * zone). Defaults to 0.5 (mid-field). Offensive players are clamped so
   * they cannot be dragged past this line.
   */
  lineOfScrimmageY?: number;
  /**
   * Which part of the field the 25-yard display window represents. Controls
   * the yard numbers painted on the field. Defaults to "midfield".
   *   - "midfield": LOS is on the ~50, numbers mirror around it (45, 50, 45, 40)
   *   - "red_zone": offense is driving toward the goal, numbers descend (25, 20, 15, 10)
   */
  fieldZone?: "midfield" | "red_zone";
  /**
   * Yards past the LOS where rushers must start on defensive plays (flag
   * football rule). Default = 7. Range 6–8. Only rendered when
   * metadata.playType === "defense".
   */
  rushLineYards?: number;
  /**
   * Whether to render the rush line on defensive plays. Defaults to true for
   * legacy docs so existing defense plays keep the line visible.
   */
  showRushLine?: boolean;
};
