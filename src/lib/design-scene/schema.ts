import { z } from "zod";
import { designFonts } from "@/lib/design-scene/font-registry";

export const DESIGN_SCENE_VERSION = 1 as const;
export const MAX_DESIGN_OBJECTS = 48;
export const MAX_DESIGN_GROUPS = 12;
export const MAX_TEXT_LENGTH = 500;
export const MAX_PATH_LENGTH = 8_000;
export const MAX_CANVAS_EDGE = 4_096;
export const MAX_IMAGE_PLACEHOLDERS = 4;
export const MIN_CANVAS_EDGE = 64;

const finiteNumber = z.number().finite();
const positiveSize = finiteNumber.positive().max(MAX_CANVAS_EDGE);
const nonNeg = finiteNumber.min(0).max(MAX_CANVAS_EDGE);
const opacitySchema = finiteNumber.min(0).max(1);
const angleSchema = finiteNumber.min(-360).max(360);

const colorSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|transparent|rgba?\([^)]+\))$/);

const nullableColor = z.union([colorSchema, z.null()]);

const idSchema = z.string().min(1).max(64);

export const baseDesignObjectSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(80),
  type: z.string(),
  left: finiteNumber,
  top: finiteNumber,
  width: positiveSize,
  height: positiveSize,
  angle: angleSchema.default(0),
  opacity: opacitySchema.default(1),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  layerIndex: z.number().int().min(0).max(500),
  parentId: z.union([idSchema, z.null()]).default(null),
  semanticRole: z.string().max(64).optional(),
});

export const editableTextObjectSchema = baseDesignObjectSchema.extend({
  type: z.literal("text"),
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
  fontFamily: z.string().min(1).max(64),
  fontSize: finiteNumber.min(8).max(400),
  fontWeight: z.union([
    z.number().int().min(100).max(900),
    z.enum(["normal", "bold"]),
  ]),
  fontStyle: z.enum(["normal", "italic"]).default("normal"),
  lineHeight: finiteNumber.min(0.8).max(3).default(1.2),
  letterSpacing: finiteNumber.min(-50).max(200).default(0),
  textAlign: z.enum(["left", "center", "right"]).default("left"),
  fill: colorSchema,
  stroke: nullableColor.default(null),
  strokeWidth: nonNeg.max(40).default(0),
  underline: z.boolean().default(false),
  uppercase: z.boolean().default(false),
});

export const editableRectObjectSchema = baseDesignObjectSchema.extend({
  type: z.literal("rect"),
  fill: nullableColor,
  stroke: nullableColor.default(null),
  strokeWidth: nonNeg.max(40).default(0),
  cornerRadius: nonNeg.max(500).default(0),
});

export const editableEllipseObjectSchema = baseDesignObjectSchema.extend({
  type: z.literal("ellipse"),
  fill: nullableColor,
  stroke: nullableColor.default(null),
  strokeWidth: nonNeg.max(40).default(0),
});

export const editableLineObjectSchema = baseDesignObjectSchema.extend({
  type: z.literal("line"),
  x1: finiteNumber,
  y1: finiteNumber,
  x2: finiteNumber,
  y2: finiteNumber,
  stroke: colorSchema,
  strokeWidth: positiveSize.max(40),
  strokeLineCap: z.enum(["butt", "round", "square"]).default("round"),
});

export const editablePathObjectSchema = baseDesignObjectSchema.extend({
  type: z.literal("path"),
  pathData: z.string().min(1).max(MAX_PATH_LENGTH),
  fill: nullableColor.default(null),
  stroke: nullableColor.default(null),
  strokeWidth: nonNeg.max(40).default(1),
  strokeLineCap: z.enum(["butt", "round", "square"]).default("round"),
  strokeLineJoin: z.enum(["miter", "round", "bevel"]).default("round"),
});

export const editablePolygonObjectSchema = baseDesignObjectSchema.extend({
  type: z.literal("polygon"),
  points: z
    .array(z.object({ x: finiteNumber, y: finiteNumber }))
    .min(3)
    .max(64),
  fill: nullableColor.default(null),
  stroke: nullableColor.default(null),
  strokeWidth: nonNeg.max(40).default(0),
});

export const editableImageObjectSchema = baseDesignObjectSchema.extend({
  type: z.literal("image"),
  prompt: z.string().min(1).max(500),
  fit: z.enum(["cover", "contain"]).default("cover"),
  cornerRadius: nonNeg.max(500).default(0),
  assetId: z.union([z.string().uuid(), z.null()]).default(null),
});

export const editableGroupDefinitionSchema = baseDesignObjectSchema.extend({
  type: z.literal("group"),
  childIds: z.array(idSchema).min(1).max(32),
});

export const editableDesignObjectSchema = z.discriminatedUnion("type", [
  editableTextObjectSchema,
  editableRectObjectSchema,
  editableEllipseObjectSchema,
  editableLineObjectSchema,
  editablePathObjectSchema,
  editablePolygonObjectSchema,
  editableImageObjectSchema,
  editableGroupDefinitionSchema,
]);

export const editableDesignSceneSchema = z.object({
  version: z.literal(DESIGN_SCENE_VERSION),
  title: z.string().min(1).max(120),
  canvas: z.object({
    width: positiveSize,
    height: positiveSize,
    background: colorSchema,
  }),
  palette: z.object({
    primary: colorSchema,
    secondary: colorSchema,
    accent: colorSchema,
    background: colorSchema,
    text: colorSchema,
  }),
  objects: z.array(editableDesignObjectSchema).min(1).max(MAX_DESIGN_OBJECTS),
});

export type EditableDesignScene = z.infer<typeof editableDesignSceneSchema>;
export type EditableDesignObject = z.infer<typeof editableDesignObjectSchema>;
export type EditableTextObject = z.infer<typeof editableTextObjectSchema>;
export type EditableImageObject = z.infer<typeof editableImageObjectSchema>;

export const designBriefSchema = z.object({
  category: z.string().min(1).max(64),
  tone: z.string().min(1).max(120),
  hierarchy: z.string().min(1).max(400),
  layout: z.string().min(1).max(400),
  typography: z.string().min(1).max(400),
  paletteNotes: z.string().min(1).max(400),
  requiredObjects: z.array(z.string().min(1).max(80)).min(1).max(24),
  spacingRhythm: z.string().min(1).max(200),
});

export type DesignBrief = z.infer<typeof designBriefSchema>;

export const designOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create"),
    object: editableDesignObjectSchema,
  }),
  z.object({
    type: z.literal("update"),
    objectId: idSchema,
    changes: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("delete"),
    objectId: idSchema,
  }),
  z.object({
    type: z.literal("reorder"),
    objectId: idSchema,
    layerIndex: z.number().int().min(0).max(500),
  }),
]);

export const designOperationsSchema = z.object({
  operations: z.array(designOperationSchema).min(1).max(40),
});

export type DesignOperation = z.infer<typeof designOperationSchema>;

/** JSON Schema fragment for OpenAI Structured Outputs (strict). */
export function getDesignSceneJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["version", "title", "canvas", "palette", "objects"],
    properties: {
      version: { type: "number", enum: [1] },
      title: { type: "string" },
      canvas: {
        type: "object",
        additionalProperties: false,
        required: ["width", "height", "background"],
        properties: {
          width: { type: "number" },
          height: { type: "number" },
          background: { type: "string" },
        },
      },
      palette: {
        type: "object",
        additionalProperties: false,
        required: ["primary", "secondary", "accent", "background", "text"],
        properties: {
          primary: { type: "string" },
          secondary: { type: "string" },
          accent: { type: "string" },
          background: { type: "string" },
          text: { type: "string" },
        },
      },
      objects: {
        type: "array",
        minItems: 1,
        maxItems: MAX_DESIGN_OBJECTS,
        items: {
          type: "object",
          additionalProperties: true,
          required: ["id", "name", "type", "left", "top", "width", "height", "layerIndex"],
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            type: {
              type: "string",
              enum: [
                "text",
                "rect",
                "ellipse",
                "line",
                "path",
                "polygon",
                "image",
                "group",
              ],
            },
            left: { type: "number" },
            top: { type: "number" },
            width: { type: "number" },
            height: { type: "number" },
            angle: { type: "number" },
            opacity: { type: "number" },
            visible: { type: "boolean" },
            locked: { type: "boolean" },
            layerIndex: { type: "number" },
            parentId: { type: ["string", "null"] },
            semanticRole: { type: "string" },
            text: { type: "string" },
            fontFamily: { type: "string", enum: [...designFonts] },
            fontSize: { type: "number" },
            fontWeight: {},
            fontStyle: { type: "string" },
            lineHeight: { type: "number" },
            letterSpacing: { type: "number" },
            textAlign: { type: "string" },
            fill: { type: ["string", "null"] },
            stroke: { type: ["string", "null"] },
            strokeWidth: { type: "number" },
            underline: { type: "boolean" },
            uppercase: { type: "boolean" },
            cornerRadius: { type: "number" },
            x1: { type: "number" },
            y1: { type: "number" },
            x2: { type: "number" },
            y2: { type: "number" },
            strokeLineCap: { type: "string" },
            strokeLineJoin: { type: "string" },
            pathData: { type: "string" },
            points: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["x", "y"],
                properties: { x: { type: "number" }, y: { type: "number" } },
              },
            },
            prompt: { type: "string" },
            fit: { type: "string" },
            assetId: { type: ["string", "null"] },
            childIds: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };
}

export function getDesignBriefJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "category",
      "tone",
      "hierarchy",
      "layout",
      "typography",
      "paletteNotes",
      "requiredObjects",
      "spacingRhythm",
    ],
    properties: {
      category: { type: "string" },
      tone: { type: "string" },
      hierarchy: { type: "string" },
      layout: { type: "string" },
      typography: { type: "string" },
      paletteNotes: { type: "string" },
      requiredObjects: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 24,
      },
      spacingRhythm: { type: "string" },
    },
  };
}
