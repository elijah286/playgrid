/** Normalized field coordinates: origin bottom-left, x right, y up; range typically 0–1 */

export const PLAY_DOCUMENT_SCHEMA_VERSION = 2 as const;

export type SportVariant =
  | "flag_4v4"
  | "flag_5v5"
  | "flag_6v6"
  | "flag_7v7"
  | "touch_7v7"
  | "tackle_11"
  | "other";

/** Which side of the ball / phase of play this is. */
export type PlayType = "offense" | "defense" | "special_teams" | "practice_plan";

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
  /**
   * Optional per-segment playback speed multiplier (e.g. 0.75 = 75%, 1.25 =
   * 125%). When set, overrides the route-level `speedMultiplier` for this
   * segment only. Unset / 1 = inherit from route.
   */
  speedMultiplier?: number;
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
  /**
   * Optional playback delay before this route starts moving, in seconds.
   * Used for defender reaction routes: the LB doesn't break on the seam
   * until the inside receiver crosses y≈8, so its route waits ~0.6s
   * before advancing. Player still renders at the start node during the
   * delay; only the carrier's progress along the path is paused.
   *
   * Authored exclusively by Coach Cal; the play editor UI does not expose
   * this field (intentionally — keeps editor UX simple).
   */
  startDelaySec?: number;
  /**
   * Optional route-wide playback speed multiplier (e.g. 0.75 = 75%, 1.25 =
   * 125%). Applies to every segment unless that segment has its own
   * `speedMultiplier` override. Unset / 1 = default speed.
   */
  speedMultiplier?: number;
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
  /** 1-indexed QB read position. When set, a small numbered badge is
   *  rendered next to the player so the QB can see the progression
   *  ("1, 2, 3") at a glance on a wristband card. Derived from
   *  PlaySpec.progression via the diagram converter; never hand-set. */
  progressionIndex?: number;
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
  /**
   * Canonical PlaySpec — the semantic representation of this play. When
   * present, this is the SOURCE OF TRUTH for what the play means
   * (formation, defense, per-player assignments). The rendered geometry
   * in PlayDocument.layers is a projection of this spec.
   *
   * Persistence rules:
   *   - Coach Cal write paths (create_play / update_play) populate this
   *     automatically whenever they can derive it (always, for spec-shaped
   *     inputs; best-effort, for legacy CoachDiagram inputs).
   *   - Editor write paths (manual edits in the play editor) leave this
   *     untouched — it stays consistent until something semantically
   *     incompatible happens, then a reconciler will mark it stale.
   *   - Notes generation reads from this when present and falls back to
   *     PlayMetadata.notes / Cal's free-form generation otherwise.
   *
   * Stored as a JSON-compatible object on PlayDocument.metadata; uses the
   * existing play_versions.document jsonb column so no schema migration
   * is needed to persist.
   */
  spec?: import("./spec").PlaySpec | null;
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

/**
 * Practice-plan equipment props (cones, ladders, hurdles, etc.). Rendered as
 * small, neutral SVG icons for drill illustration. Available only when
 * metadata.playType === "practice_plan".
 */
export type EquipmentKind =
  | "cone"
  | "tall_cone"
  | "agility_ladder"
  | "hurdle"
  | "agility_bag"
  | "tackling_dummy"
  | "hoop"
  | "marker_disc";

export type EquipmentItem = {
  id: string;
  kind: EquipmentKind;
  /** Center point in normalized field coords (0..1). */
  position: Point2;
  /** Rotation in degrees clockwise. Defaults to 0. */
  rotation?: number;
  /** Scale multiplier (1 = default). Each kind has its own base size. */
  scale?: number;
  /** Optional label rendered below the icon. */
  label?: string;
};

export type PlayLayers = {
  players: Player[];
  routes: Route[];
  annotations: Annotation[];
  /** Defensive coverage zones. Empty for offensive plays. */
  zones?: Zone[];
  /** Practice-plan equipment props. Empty/undefined for offense/defense. */
  equipment?: EquipmentItem[];
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
   * Whether to render the horizontal yard-line stripes every 5 yards.
   * Defaults to `true`. Set false for "bare field" demos (Football
   * Library route pages, for example) where the grid distracts from
   * the route shape — combined with `showYardNumbers: false`,
   * `showHashMarks: false`, `lineOfScrimmage: "none"`, and
   * `fieldBackground: "white"` you get an unmarked white field with
   * just the player + route on it.
   */
  showYardLines?: boolean;
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
  /**
   * Where the ball is spotted, in yards from the offense's own goal line.
   * 0 = own goal, fieldLengthYds = opponent goal. Used by the renderer to
   * decide which league markings (own goal, no-run lines, first-down lines,
   * opponent goal/endzone) fall inside the 25-yd display window. The window
   * size never changes; only what's visible inside it.
   *
   * When undefined, the renderer falls back to legacy `fieldZone` semantics
   * (midfield → 50% of field length; red_zone → fieldLengthYds − 10).
   */
  fieldPositionYds?: number;
  /** Render endzone(s) (sideline-to-sideline shaded band + back line) when
   *  the goal line falls inside the visible 25-yd window. */
  showEndzones?: boolean;
  /** Render no-run zone band(s) (yellow rectangle) when in view. */
  showNoRunZones?: boolean;
  /** Render the league's fixed first-down line(s) when in view. */
  showFirstDownLine?: boolean;
  /** Render bright-orange down marker line(s) at the league's down-marker
   *  yardages when in view. (Distinct from first-down lines: some leagues
   *  use both, e.g. NFL Flag 7v7 with two midfield-style markers.) */
  showDownMarkers?: boolean;
  /** Per-play first-down line ("chain"), in yards from the LOS (positive
   *  = downfield). When set and `showFirstDownLine` is true, the renderer
   *  draws a single dashed lime line at LOS + this value. The line is
   *  per-play because the chain moves with the down/distance situation;
   *  the league's FIXED markers live separately under
   *  `fieldStructure.firstDownLineYds` and render as orange "down
   *  markers" via `showDownMarkers`. */
  firstDownLineYards?: number;
  /** @deprecated No longer settable per-play (down markers are league-
   *  fixed). Field kept for back-compat with already-saved plays so the
   *  strict Zod parse doesn't reject them; ignored at render time. */
  downMarkerYards?: number;
  /** Rotate the painted yard-number glyphs 90° so they read correctly from
   *  each sideline (real-field convention). Default derives from variant —
   *  on for tackle and other wide fields, off for narrow flag fields. */
  rotatedYardNumbers?: boolean;
  /** Numeric override for hash-mark x positions, as fractions of field
   *  width (left, right). Wins over `hashStyle` when both are set; allows
   *  a coach to dial in non-standard hash placement. Range 0.05–0.95;
   *  values outside that band are ignored at resolve time. */
  hashColumns?: [number, number];
};
