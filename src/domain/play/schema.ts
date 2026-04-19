import { z } from "zod";
import { PLAY_DOCUMENT_SCHEMA_VERSION } from "./types";

const point2 = z.object({ x: z.number(), y: z.number() });

const pathSegment = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("line"),
    from: point2,
    to: point2,
    kind: z.enum(["freehand_simplified", "clicked", "template"]),
  }),
  z.object({
    type: z.literal("quadratic"),
    from: point2,
    control: point2,
    to: point2,
    kind: z.enum(["freehand_simplified", "clicked", "template"]),
  }),
]);

export const playDocumentSchema = z.object({
  schemaVersion: z.literal(PLAY_DOCUMENT_SCHEMA_VERSION),
  sportProfile: z.object({
    variant: z.enum(["flag_5v5", "flag_7v7", "tackle_11", "six_man"]),
    offensePlayerCount: z.number().int().positive(),
    fieldWidthYds: z.number().positive(),
    fieldLengthYds: z.number().positive(),
    motionMustNotAdvanceTowardGoal: z.boolean().optional(),
  }),
  metadata: z
    .object({
      coachName: z.string(),
      shorthand: z.string(),
      wristbandCode: z.string(),
      mnemonic: z.string().optional(),
      sheetAbbrev: z.string(),
      formation: z.string(),
      concept: z.string(),
      tags: z.array(z.string()).default([]),
      // Legacy single-tag field; coerced into `tags` below.
      tag: z.string().optional(),
    })
    .transform(({ tag, tags, ...rest }) => {
      const merged =
        tags && tags.length > 0
          ? tags
          : tag && tag.trim().length > 0
            ? [tag.trim()]
            : [];
      return { ...rest, tags: merged };
    }),
  formation: z.object({
    semantic: z.object({
      key: z.string(),
      strength: z.enum(["left", "right", "balanced"]).optional(),
      params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    }),
    layout: z.object({
      presetId: z.string().optional(),
      playerAnchors: z.record(z.string(), point2),
    }),
  }),
  layers: z.object({
    players: z.array(
      z.object({
        id: z.string(),
        role: z.enum(["QB", "RB", "WR", "TE", "C", "OTHER"]),
        label: z.string(),
        position: point2,
        eligible: z.boolean(),
        style: z.object({
          fill: z.string(),
          stroke: z.string(),
          labelColor: z.string(),
        }),
      }),
    ),
    routes: z.array(
      z.object({
        id: z.string(),
        carrierPlayerId: z.string(),
        semantic: z
          .object({
            family: z.string(),
            tags: z.array(z.string()).optional(),
            confidence: z.number().optional(),
          })
          .nullable(),
        geometry: z.object({
          segments: z.array(pathSegment),
          closed: z.boolean().optional(),
        }),
        style: z.object({
          stroke: z.string(),
          strokeWidth: z.number(),
          dash: z.string().optional(),
        }),
        motion: z.boolean().optional(),
      }),
    ),
    annotations: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        anchor: point2,
        progressionIndex: z.number().optional(),
      }),
    ),
  }),
  printProfile: z.object({
    visibility: z.object({
      showPlayerLabels: z.boolean(),
      showNotes: z.boolean(),
      showProgression: z.boolean(),
      showWristbandCode: z.boolean(),
    }),
    wristband: z.object({
      gridRows: z.number().int().positive(),
      gridCols: z.number().int().positive(),
      diagramScale: z.number().positive(),
      density: z.enum(["compact", "standard", "roomy"]),
    }),
    sheetDiagramScale: z.number().positive(),
    fontScale: z.number().positive(),
  }),
  timeline: z
    .object({
      durationMs: z.number().positive(),
      routeStartOffsets: z.record(z.string(), z.number()),
    })
    .optional(),
});

export type PlayDocumentParsed = z.infer<typeof playDocumentSchema>;

export function parsePlayDocument(data: unknown) {
  return playDocumentSchema.safeParse(data);
}
