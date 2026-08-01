import { z } from "zod";

export const aiModeSchema = z.enum(["generate", "edit", "replace"]);
export const aiQualitySchema = z.enum(["fast", "standard", "high"]);
export const aiProviderSchema = z.enum(["openai", "bfl"]);

export const selectionDataSchema = z.object({
  left: z.number(),
  top: z.number(),
  width: z.number().min(64),
  height: z.number().min(64),
  fit: z.enum(["cover", "contain"]).default("cover"),
});

export const createGenerationSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(2000),
  negativePrompt: z.string().trim().max(1000).optional(),
  provider: aiProviderSchema,
  quality: aiQualitySchema.default("standard"),
  mode: aiModeSchema.default("generate"),
  selection: selectionDataSchema,
  idempotencyKey: z.string().min(8).max(128),
  referenceAssetId: z.string().uuid().optional(),
  fit: z.enum(["cover", "contain"]).default("cover"),
});

export const saveProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  canvasJson: z.unknown(),
  canvasWidth: z.number().int().positive().optional(),
  canvasHeight: z.number().int().positive().optional(),
  backgroundColor: z.string().max(32).optional(),
  updatedAt: z.string().datetime(),
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
