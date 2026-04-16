import { z } from "zod";

/** Structured AI / agent command batch — validates before reducer */
export const agentCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("route.setSemantic"),
    routeId: z.string(),
    semantic: z
      .object({
        family: z.string(),
        tags: z.array(z.string()).optional(),
        confidence: z.number().optional(),
      })
      .nullable(),
  }),
  z.object({
    type: z.literal("document.flip"),
    axis: z.enum(["horizontal", "vertical"]),
  }),
  z.object({
    type: z.literal("formation.applySemantic"),
    formation: z.object({
      key: z.string(),
      strength: z.enum(["left", "right", "balanced"]).optional(),
    }),
  }),
  z.object({
    type: z.literal("print.setProfile"),
    patch: z.object({
      visibility: z
        .object({
          showPlayerLabels: z.boolean().optional(),
          showNotes: z.boolean().optional(),
          showProgression: z.boolean().optional(),
          showWristbandCode: z.boolean().optional(),
        })
        .optional(),
      wristband: z
        .object({
          diagramScale: z.number().optional(),
          density: z.enum(["compact", "standard", "roomy"]).optional(),
        })
        .optional(),
    }),
  }),
]);

export const agentCommandBatchSchema = z.array(agentCommandSchema);

export type AgentCommand = z.infer<typeof agentCommandSchema>;
