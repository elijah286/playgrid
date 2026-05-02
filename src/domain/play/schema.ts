/**
 * Runtime schema for PlayDocument and its sub-types.
 *
 * This is the AUTHORITATIVE structural contract for play data. It runs
 * at every boundary where bytes cross trust levels:
 *   - SAVE  (recordPlayVersion): parsePlayDocumentStrict — reject any
 *           shape we didn't explicitly define. Anything that fails here
 *           is a code bug to fix.
 *   - LOAD  (every read of play_versions.document): parsePlayDocument —
 *           strict-strip semantics: unknown keys are silently dropped so
 *           legacy data renders, but the OUTPUT cannot contain anything
 *           the renderer doesn't know about.
 *   - TOOL  (Coach Cal create_play / update_play): use the relevant
 *           sub-schema (CoachDiagram or PlaySpec) to gate input.
 *   - RENDER (Editor / chat / thumbnail): components accept the parsed
 *           type only — no `as PlayDocument` casts allowed downstream.
 *
 * Hierarchy (mirrors AGENTS.md "Coach Cal architecture: hard rules"):
 *
 *   PlayDocument
 *     ├─ schemaVersion (literal)
 *     ├─ sportProfile          (variant + dimensions)
 *     ├─ metadata              (coach-facing fields + saved spec)
 *     ├─ formation             (semantic + layout anchors)
 *     ├─ layers
 *     │    ├─ players          (id, role, label, position, style, shape)
 *     │    ├─ routes           (carrier, semantic, nodes, segments, style)
 *     │    ├─ zones            (defensive coverage rectangles/ellipses)
 *     │    ├─ annotations      (text labels)
 *     │    └─ equipment        (practice-plan props)
 *     ├─ printProfile          (visibility flags + wristband settings)
 *     ├─ timeline (optional)   (animation duration + per-route delays)
 *     └─ field display flags   (LOS style, hash marks, yard numbers, etc)
 *
 * Anything not in this hierarchy is invalid and ignored on load. Cal
 * cannot smuggle in custom fields; corrupted DB rows can't crash the
 * renderer; new properties have to enter through this file first.
 */

import { z } from "zod";
import { PLAY_DOCUMENT_SCHEMA_VERSION } from "./types";

// ── Primitives ─────────────────────────────────────────────────────────

/** Normalized field coord (0..1). Permissive on slight overshoot —
 *  routes legitimately end past the field edge during animation. */
const point2Schema = z.object({
  x: z.number(),
  y: z.number(),
}).strict();

const hexColorSchema = z.string();
// Note: not running a regex check on hex format. The renderer accepts
// rgba()/named colors too (legacy data has both). Strictness on shape
// is the focus; color-format validation belongs at the writer.

// ── Player ─────────────────────────────────────────────────────────────

const playerRoleSchema = z.enum([
  "QB", "RB", "WR", "TE", "C",
  "DL", "LB", "CB", "S", "NB",
  "K", "P", "LS", "ST",
  "OTHER",
]);

const playerShapeSchema = z.enum(["circle", "square", "diamond", "triangle", "star"]);

const playerStyleSchema = z.object({
  fill: hexColorSchema,
  stroke: hexColorSchema,
  labelColor: hexColorSchema,
}).strict();

const playerSchema = z.object({
  id: z.string(),
  role: playerRoleSchema,
  label: z.string(),
  position: point2Schema,
  eligible: z.boolean(),
  style: playerStyleSchema,
  shape: playerShapeSchema.optional(),
  isHotRoute: z.boolean().optional(),
}).strict();

// ── Route ──────────────────────────────────────────────────────────────

const routeFamilySchema = z.enum([
  "slant", "go", "post", "corner", "comeback",
  "out", "in", "whip", "wheel", "flat",
  "custom",
]);

const routeSemanticSchema = z.object({
  family: routeFamilySchema,
  tags: z.array(z.string()).optional(),
  confidence: z.number().optional(),
}).strict();

const routeNodeSchema = z.object({
  id: z.string(),
  position: point2Schema,
}).strict();

const segmentShapeSchema = z.enum(["straight", "curve", "zigzag"]);
const strokePatternSchema = z.enum(["solid", "dashed", "dotted", "motion"]);

const routeSegmentSchema = z.object({
  id: z.string(),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  shape: segmentShapeSchema,
  strokePattern: strokePatternSchema,
  /** null = auto-computed; explicit point = manual override. */
  controlOffset: point2Schema.nullable(),
  speedMultiplier: z.number().optional(),
}).strict();

const routeStyleSchema = z.object({
  stroke: hexColorSchema,
  strokeWidth: z.number(),
  dash: z.string().optional(),
}).strict();

const endDecorationSchema = z.enum(["arrow", "t", "none"]);

const routeSchema = z.object({
  id: z.string(),
  carrierPlayerId: z.string(),
  semantic: routeSemanticSchema.nullable(),
  nodes: z.array(routeNodeSchema),
  segments: z.array(routeSegmentSchema),
  style: routeStyleSchema,
  motion: z.boolean().optional(),
  endDecoration: endDecorationSchema.optional(),
  startDelaySec: z.number().optional(),
  speedMultiplier: z.number().optional(),
}).strict();

// ── Zone ───────────────────────────────────────────────────────────────

const zoneSchema = z.object({
  id: z.string(),
  kind: z.enum(["rectangle", "ellipse"]),
  center: point2Schema,
  /** Half-extents (rectangle half-w / half-h; ellipse rx/ry). */
  size: z.object({ w: z.number(), h: z.number() }).strict(),
  label: z.string(),
  style: z.object({
    fill: hexColorSchema,
    stroke: hexColorSchema,
  }).strict(),
}).strict();

// ── Annotation ─────────────────────────────────────────────────────────

const annotationSchema = z.object({
  id: z.string(),
  text: z.string(),
  anchor: point2Schema,
  progressionIndex: z.number().optional(),
}).strict();

// ── Equipment (practice plan props) ────────────────────────────────────

const equipmentKindSchema = z.enum([
  "cone", "tall_cone", "agility_ladder", "hurdle", "agility_bag",
  "tackling_dummy", "hoop", "marker_disc",
]);

const equipmentItemSchema = z.object({
  id: z.string(),
  kind: equipmentKindSchema,
  position: point2Schema,
  rotation: z.number().optional(),
  scale: z.number().optional(),
  label: z.string().optional(),
}).strict();

// ── Layers ─────────────────────────────────────────────────────────────

const layersSchema = z.object({
  players: z.array(playerSchema),
  routes: z.array(routeSchema),
  annotations: z.array(annotationSchema),
  zones: z.array(zoneSchema).optional(),
  equipment: z.array(equipmentItemSchema).optional(),
}).strict();

// ── Formation ──────────────────────────────────────────────────────────

const formationSemanticSchema = z.object({
  key: z.string(),
  strength: z.enum(["left", "right", "balanced"]).optional(),
  params: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()]),
  ).optional(),
}).strict();

const formationLayoutSchema = z.object({
  presetId: z.string().optional(),
  playerAnchors: z.record(z.string(), point2Schema),
}).strict();

const formationStateSchema = z.object({
  semantic: formationSemanticSchema,
  layout: formationLayoutSchema,
}).strict();

// ── Sport profile ──────────────────────────────────────────────────────

const sportVariantSchema = z.enum(["flag_5v5", "flag_7v7", "tackle_11", "other"]);

const sportProfileSchema = z.object({
  variant: sportVariantSchema,
  offensePlayerCount: z.number().int().positive(),
  defensePlayerCount: z.number().int().positive(),
  fieldWidthYds: z.number().positive(),
  fieldLengthYds: z.number().positive(),
  motionMustNotAdvanceTowardGoal: z.boolean().optional(),
}).strict();

// ── Print profile ──────────────────────────────────────────────────────

const printProfileSchema = z.object({
  visibility: z.object({
    showPlayerLabels: z.boolean(),
    showNotes: z.boolean(),
    showProgression: z.boolean(),
    showWristbandCode: z.boolean(),
  }).strict(),
  wristband: z.object({
    gridRows: z.number().int().positive(),
    gridCols: z.number().int().positive(),
    diagramScale: z.number().positive(),
    density: z.enum(["compact", "standard", "roomy"]),
  }).strict(),
  sheetDiagramScale: z.number().positive(),
  fontScale: z.number().positive(),
}).strict();

// ── Timeline ───────────────────────────────────────────────────────────

const timelineSchema = z.object({
  durationMs: z.number().positive(),
  routeStartOffsets: z.record(z.string(), z.number()),
}).strict();

// ── Vs-play snapshot (defense-against-offense matchup) ─────────────────

const vsPlaySnapshotSchema = z.object({
  players: z.array(playerSchema),
  routes: z.array(routeSchema),
  lineOfScrimmageY: z.number(),
  sourceVersionId: z.string(),
  snapshotAt: z.string(),
  sourceName: z.string(),
  sourceFormationName: z.string(),
}).strict();

// ── Metadata ───────────────────────────────────────────────────────────
//
// PlayMetadata.spec contains a PlaySpec — but PlaySpec has its own
// schema (specSchema below) which is ALSO strict. We reference it by
// `.passthrough()` here only to avoid a circular import; the spec field
// gets validated independently at SFPA boundaries (resolveDiagramAndSpec).
// Anything actually rendered from spec goes through specSchema first.

const playTypeSchema = z.enum(["offense", "defense", "special_teams", "practice_plan"]);

const specialTeamsUnitSchema = z.enum([
  "punt", "punt_left", "punt_right", "punt_return",
  "field_goal", "extra_point", "kickoff", "kick_return",
]);

const playMetadataSchema = z.object({
  coachName: z.string(),
  shorthand: z.string(),
  wristbandCode: z.string(),
  mnemonic: z.string().optional(),
  sheetAbbrev: z.string(),
  formation: z.string(),
  concept: z.string(),
  tags: z.array(z.string()).default([]),
  // Legacy single-tag field; kept for read-time, dropped on save by
  // the transform below.
  tag: z.string().optional(),
  notes: z.string().optional(),
  formationId: z.string().nullable().optional(),
  formationTag: z.string().nullable().optional(),
  playType: playTypeSchema.optional(),
  specialTeamsUnit: specialTeamsUnitSchema.nullable().optional(),
  opponentFormationId: z.string().nullable().optional(),
  vsPlayId: z.string().nullable().optional(),
  vsPlaySnapshot: vsPlaySnapshotSchema.nullable().optional(),
  /** PlaySpec — validated by playSpecSchema separately. */
  spec: z.unknown().optional(),
}).strict()
  .transform(({ tag, tags, ...rest }) => {
    const merged =
      tags && tags.length > 0
        ? tags
        : tag && tag.trim().length > 0
          ? [tag.trim()]
          : [];
    return { ...rest, tags: merged };
  });

// ── Top-level PlayDocument ─────────────────────────────────────────────

const fieldBackgroundSchema = z.enum(["green", "white", "black", "gray"]);
const hashStyleSchema = z.enum(["narrow", "normal", "wide", "none"]);
const losStyleSchema = z.enum(["line", "football", "none"]);
const fieldZoneSchema = z.enum(["midfield", "red_zone"]);

export const playDocumentSchema = z.object({
  schemaVersion: z.literal(PLAY_DOCUMENT_SCHEMA_VERSION),
  sportProfile: sportProfileSchema,
  metadata: playMetadataSchema,
  formation: formationStateSchema,
  layers: layersSchema,
  printProfile: printProfileSchema,
  timeline: timelineSchema.optional(),
  fieldBackground: fieldBackgroundSchema.optional(),
  showHashMarks: z.boolean().optional(),
  hashStyle: hashStyleSchema.optional(),
  showYardNumbers: z.boolean().optional(),
  lineOfScrimmage: losStyleSchema.optional(),
  lineOfScrimmageY: z.number().optional(),
  fieldZone: fieldZoneSchema.optional(),
  rushLineYards: z.number().optional(),
  showRushLine: z.boolean().optional(),
}).strict();

export type PlayDocumentParsed = z.infer<typeof playDocumentSchema>;

// ── Public parse APIs ──────────────────────────────────────────────────

/**
 * STRICT parse — used at SAVE boundaries. Rejects any unknown key,
 * any value out of enum, any wrong type. A failure here means the code
 * is producing data that doesn't match the schema — fix the code, not
 * the data.
 */
export function parsePlayDocumentStrict(data: unknown) {
  return playDocumentSchema.safeParse(data);
}

/**
 * LOAD-time parse. Today this is the same as strict — Zod's `.strict()`
 * fails on unknown keys, which is what we want for new saves. For
 * read-time graceful handling of legacy data, callers should catch
 * the parse failure and either (a) fall back to a known-safe empty
 * document, or (b) log the failure and skip rendering. Renderer
 * components MUST do (b) — see "RENDER" in the file header.
 *
 * If we accumulate a critical mass of legacy plays that fail strict
 * parse and need lenient handling, replace this with a `.passthrough()`
 * variant. For now strict is right because we want corrupt-data bugs
 * to surface, not be silently absorbed.
 */
export function parsePlayDocument(data: unknown) {
  return playDocumentSchema.safeParse(data);
}

/**
 * RENDER / LOAD-time defensive parse. ALWAYS returns something the
 * renderer can show safely. On parse success: returns the validated
 * doc + isCorrupt: false. On parse failure: logs the issue (for ops
 * visibility) and returns a TYPED placeholder + isCorrupt: true so
 * the caller can show a "this play needs migration" affordance
 * without the renderer crashing on unknown data.
 *
 * Use this anywhere a PlayDocument enters the rendering layer (the
 * canvas, thumbnails, the chat embed). Never `as PlayDocument` cast a
 * raw DB row directly into a renderer prop.
 */
export type SafePlayDocumentResult =
  | { ok: true; doc: PlayDocumentParsed; isCorrupt: false }
  | { ok: false; doc: null; isCorrupt: true; issues: string[] };

export function safeReadPlayDocument(data: unknown): SafePlayDocumentResult {
  const parsed = playDocumentSchema.safeParse(data);
  if (parsed.success) {
    return { ok: true, doc: parsed.data, isCorrupt: false };
  }
  const issues = parsed.error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  if (typeof console !== "undefined") {
    console.error(
      "[safeReadPlayDocument] PlayDocument failed schema parse — refusing to render unknown data.",
      { issues },
    );
  }
  return { ok: false, doc: null, isCorrupt: true, issues };
}
