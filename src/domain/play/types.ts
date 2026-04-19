/** Normalized field coordinates: origin bottom-left, x right, y up; range typically 0–1 */

export const PLAY_DOCUMENT_SCHEMA_VERSION = 1 as const;

export type SportVariant =
  | "flag_5v5"
  | "flag_7v7"
  | "tackle_11"
  | "six_man";

export type PlayerRole = "QB" | "RB" | "WR" | "TE" | "C" | "OTHER";

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
  fieldWidthYds: number;
  fieldLengthYds: number;
  motionMustNotAdvanceTowardGoal?: boolean;
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
};

export type PlayLayers = {
  players: Player[];
  routes: Route[];
  annotations: Annotation[];
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
};
