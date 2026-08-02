import { z } from "zod";

export const aiModeSchema = z.enum(["generate", "edit", "replace", "design"]);
export const aiQualitySchema = z.enum(["fast", "standard", "high"]);
export const aiProviderSchema = z.enum(["openai", "bfl"]);

/** Accept Postgres timestamptz strings (offsets + microseconds). */
export const timestampSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid timestamp",
  });

export const selectionDataSchema = z.object({
  left: z.number().finite(),
  top: z.number().finite(),
  width: z.number().finite().min(64),
  height: z.number().finite().min(64),
  fit: z.enum(["cover", "contain"]).default("cover"),
});

export const createGenerationSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(2000),
  negativePrompt: z.string().trim().max(1000).optional(),
  /** Optional for design mode — server orchestrates providers internally. */
  provider: aiProviderSchema.optional().default("openai"),
  quality: aiQualitySchema.default("standard"),
  mode: aiModeSchema.default("design"),
  selection: selectionDataSchema,
  idempotencyKey: z.string().min(8).max(128),
  referenceAssetId: z.string().uuid().optional(),
  fit: z.enum(["cover", "contain"]).default("cover"),
  /** When refining an existing selection */
  selectedObjectIds: z.array(z.string().min(1).max(64)).max(40).optional(),
  selectedObjects: z.array(z.unknown()).max(40).optional(),
  nearbySummary: z.string().max(2000).optional(),
});

export const saveProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    canvasJson: z.unknown(),
    canvasWidth: z.number().finite().positive().optional(),
    canvasHeight: z.number().finite().positive().optional(),
    backgroundColor: z.string().max(32).optional(),
    /** Client optimistic-lock token from last known projects.updated_at */
    expectedUpdatedAt: timestampSchema.optional(),
    /** @deprecated Prefer expectedUpdatedAt — kept for older clients */
    updatedAt: timestampSchema.optional(),
  })
  .refine((data) => Boolean(data.expectedUpdatedAt ?? data.updatedAt), {
    message: "expectedUpdatedAt is required",
    path: ["expectedUpdatedAt"],
  });

export const checkoutSchema = z.object({
  planCode: z.enum(["creator", "pro", "credit_pack"]),
});

export const renameProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export type CreateGenerationInput = z.infer<typeof createGenerationSchema>;
export type SaveProjectInput = z.infer<typeof saveProjectSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
