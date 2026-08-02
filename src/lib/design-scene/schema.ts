import { z } from "zod";
import { designFonts } from "@/lib/design-scene/font-registry";
import { getDesignBriefJsonSchemaFromFormat } from "@/lib/design-scene/design-brief-format";

export const DESIGN_SCENE_VERSION = 1 as const;
export const MAX_DESIGN_OBJECTS = 48;
export const MAX_DESIGN_GROUPS = 12;
export const MAX_TEXT_LENGTH = 500;
export const MAX_PATH_LENGTH = 8_000;
export const MAX_CANVAS_EDGE = 4_096;
export const MAX_IMAGE_PLACEHOLDERS = 4;
export const MIN_CANVAS_EDGE = 64;

/**
 * OpenAI Structured Outputs (strict) requires:
 * - every property listed in required
 * - no Zod optional / nullish / default on fields sent to the API
 * - logically optional values must be required + nullable
 */

const finiteNumber = z.number().finite();
const positiveSize = finiteNumber.positive().max(MAX_CANVAS_EDGE);
const nonNeg = finiteNumber.min(0).max(MAX_CANVAS_EDGE);
const opacitySchema = finiteNumber.min(0).max(1);
const angleSchema = finiteNumber.min(-360).max(360);
const colorSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(
    /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|transparent|rgba?\([^)]+\))$/,
  );
const nullableColor = z.union([colorSchema, z.null()]);
const idSchema = z.string().min(1).max(64);

/** Shared base fields — every key required; optional semantics via null. */
const baseFields = {
  id: idSchema,
  name: z.string().min(1).max(80),
  left: finiteNumber,
  top: finiteNumber,
  width: positiveSize,
  height: positiveSize,
  angle: angleSchema,
  opacity: opacitySchema,
  visible: z.boolean(),
  locked: z.boolean(),
  layerIndex: z.number().int().min(0).max(500),
  parentId: z.union([idSchema, z.null()]),
  semanticRole: z.union([z.string().min(1).max(64), z.null()]),
} as const;

export const editableTextObjectSchema = z.object({
  ...baseFields,
  type: z.literal("text"),
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
  fontFamily: z.string().min(1).max(64),
  fontSize: finiteNumber.min(8).max(400),
  fontWeight: z.union([
    z.number().int().min(100).max(900),
    z.enum(["normal", "bold"]),
  ]),
  fontStyle: z.enum(["normal", "italic"]),
  lineHeight: finiteNumber.min(0.8).max(3),
  letterSpacing: finiteNumber.min(-50).max(200),
  textAlign: z.enum(["left", "center", "right"]),
  fill: colorSchema,
  stroke: nullableColor,
  strokeWidth: nonNeg.max(40),
  underline: z.boolean(),
  uppercase: z.boolean(),
});

export const editableRectObjectSchema = z.object({
  ...baseFields,
  type: z.literal("rect"),
  fill: nullableColor,
  stroke: nullableColor,
  strokeWidth: nonNeg.max(40),
  cornerRadius: nonNeg.max(500),
});

export const editableEllipseObjectSchema = z.object({
  ...baseFields,
  type: z.literal("ellipse"),
  fill: nullableColor,
  stroke: nullableColor,
  strokeWidth: nonNeg.max(40),
});

export const editableLineObjectSchema = z.object({
  ...baseFields,
  type: z.literal("line"),
  x1: finiteNumber,
  y1: finiteNumber,
  x2: finiteNumber,
  y2: finiteNumber,
  stroke: colorSchema,
  strokeWidth: positiveSize.max(40),
  strokeLineCap: z.enum(["butt", "round", "square"]),
});

export const editablePathObjectSchema = z.object({
  ...baseFields,
  type: z.literal("path"),
  pathData: z.string().min(1).max(MAX_PATH_LENGTH),
  fill: nullableColor,
  stroke: nullableColor,
  strokeWidth: nonNeg.max(40),
  strokeLineCap: z.enum(["butt", "round", "square"]),
  strokeLineJoin: z.enum(["miter", "round", "bevel"]),
});

export const editablePolygonObjectSchema = z.object({
  ...baseFields,
  type: z.literal("polygon"),
  points: z
    .array(z.object({ x: finiteNumber, y: finiteNumber }))
    .min(3)
    .max(64),
  fill: nullableColor,
  stroke: nullableColor,
  strokeWidth: nonNeg.max(40),
});

export const editableImageObjectSchema = z.object({
  ...baseFields,
  type: z.literal("image"),
  prompt: z.string().min(1).max(500),
  fit: z.enum(["cover", "contain"]),
  cornerRadius: nonNeg.max(500),
  assetId: z.union([z.string().uuid(), z.null()]),
});

export const editableGroupDefinitionSchema = z.object({
  ...baseFields,
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

export {
  DesignBriefSchema,
  designBriefSchema,
  normalizeDesignBrief,
  summarizeUnknownValue,
  summarizeZodIssue,
  type DesignBrief,
} from "@/lib/design-scene/design-brief-schema";

/**
 * Update patch: every key required; null means "leave unchanged".
 * Avoids z.record / z.unknown which OpenAI Structured Outputs reject.
 */
export const designUpdateChangesSchema = z.object({
  name: z.union([z.string().min(1).max(80), z.null()]),
  left: z.union([finiteNumber, z.null()]),
  top: z.union([finiteNumber, z.null()]),
  width: z.union([positiveSize, z.null()]),
  height: z.union([positiveSize, z.null()]),
  angle: z.union([angleSchema, z.null()]),
  opacity: z.union([opacitySchema, z.null()]),
  visible: z.union([z.boolean(), z.null()]),
  locked: z.union([z.boolean(), z.null()]),
  layerIndex: z.union([z.number().int().min(0).max(500), z.null()]),
  parentId: z.union([idSchema, z.null()]),
  semanticRole: z.union([z.string().min(1).max(64), z.null()]),
  text: z.union([z.string().min(1).max(MAX_TEXT_LENGTH), z.null()]),
  fontFamily: z.union([z.string().min(1).max(64), z.null()]),
  fontSize: z.union([finiteNumber.min(8).max(400), z.null()]),
  fontWeight: z.union([
    z.number().int().min(100).max(900),
    z.enum(["normal", "bold"]),
    z.null(),
  ]),
  fontStyle: z.union([z.enum(["normal", "italic"]), z.null()]),
  lineHeight: z.union([finiteNumber.min(0.8).max(3), z.null()]),
  letterSpacing: z.union([finiteNumber.min(-50).max(200), z.null()]),
  textAlign: z.union([z.enum(["left", "center", "right"]), z.null()]),
  fill: z.union([colorSchema, z.null()]),
  stroke: z.union([colorSchema, z.null()]),
  strokeWidth: z.union([nonNeg.max(40), z.null()]),
  underline: z.union([z.boolean(), z.null()]),
  uppercase: z.union([z.boolean(), z.null()]),
  cornerRadius: z.union([nonNeg.max(500), z.null()]),
  pathData: z.union([z.string().min(1).max(MAX_PATH_LENGTH), z.null()]),
  strokeLineCap: z.union([z.enum(["butt", "round", "square"]), z.null()]),
  strokeLineJoin: z.union([z.enum(["miter", "round", "bevel"]), z.null()]),
  prompt: z.union([z.string().min(1).max(500), z.null()]),
  fit: z.union([z.enum(["cover", "contain"]), z.null()]),
});

export const designCreateOperationSchema = z.object({
  type: z.literal("create"),
  object: editableDesignObjectSchema,
});

export const designUpdateOperationSchema = z.object({
  type: z.literal("update"),
  objectId: idSchema,
  changes: designUpdateChangesSchema,
});

export const designDeleteOperationSchema = z.object({
  type: z.literal("delete"),
  objectId: idSchema,
});

export const designReorderOperationSchema = z.object({
  type: z.literal("reorder"),
  objectId: idSchema,
  layerIndex: z.number().int().min(0).max(500),
});

export const designOperationSchema = z.discriminatedUnion("type", [
  designCreateOperationSchema,
  designUpdateOperationSchema,
  designDeleteOperationSchema,
  designReorderOperationSchema,
]);

export const designOperationsSchema = z.object({
  operations: z.array(designOperationSchema).min(1).max(40),
});

export type DesignOperation = z.infer<typeof designOperationSchema>;

const BASE_OBJECT_PROPS = {
  id: { type: "string" },
  name: { type: "string" },
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
  semanticRole: { type: ["string", "null"] },
} as const;

const BASE_REQUIRED = [
  "id",
  "name",
  "type",
  "left",
  "top",
  "width",
  "height",
  "angle",
  "opacity",
  "visible",
  "locked",
  "layerIndex",
  "parentId",
  "semanticRole",
] as const;

function objectBranch(
  type: string,
  extraProps: Record<string, unknown>,
  extraRequired: string[],
): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: [...BASE_REQUIRED, ...extraRequired],
    properties: {
      ...BASE_OBJECT_PROPS,
      type: { type: "string", enum: [type] },
      ...extraProps,
    },
  };
}

function designObjectAnyOf(): Record<string, unknown>[] {
  return [
    objectBranch(
      "text",
      {
        text: { type: "string" },
        fontFamily: { type: "string", enum: [...designFonts] },
        fontSize: { type: "number" },
        fontWeight: {
          anyOf: [
            { type: "number" },
            { type: "string", enum: ["normal", "bold"] },
          ],
        },
        fontStyle: { type: "string", enum: ["normal", "italic"] },
        lineHeight: { type: "number" },
        letterSpacing: { type: "number" },
        textAlign: { type: "string", enum: ["left", "center", "right"] },
        fill: { type: "string" },
        stroke: { type: ["string", "null"] },
        strokeWidth: { type: "number" },
        underline: { type: "boolean" },
        uppercase: { type: "boolean" },
      },
      [
        "text",
        "fontFamily",
        "fontSize",
        "fontWeight",
        "fontStyle",
        "lineHeight",
        "letterSpacing",
        "textAlign",
        "fill",
        "stroke",
        "strokeWidth",
        "underline",
        "uppercase",
      ],
    ),
    objectBranch(
      "rect",
      {
        fill: { type: ["string", "null"] },
        stroke: { type: ["string", "null"] },
        strokeWidth: { type: "number" },
        cornerRadius: { type: "number" },
      },
      ["fill", "stroke", "strokeWidth", "cornerRadius"],
    ),
    objectBranch(
      "ellipse",
      {
        fill: { type: ["string", "null"] },
        stroke: { type: ["string", "null"] },
        strokeWidth: { type: "number" },
      },
      ["fill", "stroke", "strokeWidth"],
    ),
    objectBranch(
      "line",
      {
        x1: { type: "number" },
        y1: { type: "number" },
        x2: { type: "number" },
        y2: { type: "number" },
        stroke: { type: "string" },
        strokeWidth: { type: "number" },
        strokeLineCap: { type: "string", enum: ["butt", "round", "square"] },
      },
      ["x1", "y1", "x2", "y2", "stroke", "strokeWidth", "strokeLineCap"],
    ),
    objectBranch(
      "path",
      {
        pathData: { type: "string" },
        fill: { type: ["string", "null"] },
        stroke: { type: ["string", "null"] },
        strokeWidth: { type: "number" },
        strokeLineCap: { type: "string", enum: ["butt", "round", "square"] },
        strokeLineJoin: { type: "string", enum: ["miter", "round", "bevel"] },
      },
      [
        "pathData",
        "fill",
        "stroke",
        "strokeWidth",
        "strokeLineCap",
        "strokeLineJoin",
      ],
    ),
    objectBranch(
      "polygon",
      {
        points: {
          type: "array",
          minItems: 3,
          maxItems: 64,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["x", "y"],
            properties: { x: { type: "number" }, y: { type: "number" } },
          },
        },
        fill: { type: ["string", "null"] },
        stroke: { type: ["string", "null"] },
        strokeWidth: { type: "number" },
      },
      ["points", "fill", "stroke", "strokeWidth"],
    ),
    objectBranch(
      "image",
      {
        prompt: { type: "string" },
        fit: { type: "string", enum: ["cover", "contain"] },
        cornerRadius: { type: "number" },
        assetId: { type: ["string", "null"] },
      },
      ["prompt", "fit", "cornerRadius", "assetId"],
    ),
    objectBranch(
      "group",
      {
        childIds: {
          type: "array",
          minItems: 1,
          maxItems: 32,
          items: { type: "string" },
        },
      },
      ["childIds"],
    ),
  ];
}

const UPDATE_CHANGES_PROPS: Record<string, unknown> = {
  name: { type: ["string", "null"] },
  left: { type: ["number", "null"] },
  top: { type: ["number", "null"] },
  width: { type: ["number", "null"] },
  height: { type: ["number", "null"] },
  angle: { type: ["number", "null"] },
  opacity: { type: ["number", "null"] },
  visible: { type: ["boolean", "null"] },
  locked: { type: ["boolean", "null"] },
  layerIndex: { type: ["number", "null"] },
  parentId: { type: ["string", "null"] },
  semanticRole: { type: ["string", "null"] },
  text: { type: ["string", "null"] },
  fontFamily: { type: ["string", "null"] },
  fontSize: { type: ["number", "null"] },
  fontWeight: {
    anyOf: [
      { type: "number" },
      { type: "string", enum: ["normal", "bold"] },
      { type: "null" },
    ],
  },
  fill: { type: ["string", "null"] },
  stroke: { type: ["string", "null"] },
  strokeWidth: { type: ["number", "null"] },
  fontStyle: { type: ["string", "null"] },
  lineHeight: { type: ["number", "null"] },
  letterSpacing: { type: ["number", "null"] },
  textAlign: { type: ["string", "null"] },
  underline: { type: ["boolean", "null"] },
  uppercase: { type: ["boolean", "null"] },
  cornerRadius: { type: ["number", "null"] },
  pathData: { type: ["string", "null"] },
  strokeLineCap: { type: ["string", "null"] },
  strokeLineJoin: { type: ["string", "null"] },
  prompt: { type: ["string", "null"] },
  fit: { type: ["string", "null"] },
};

const UPDATE_CHANGES_REQUIRED = Object.keys(UPDATE_CHANGES_PROPS);

export function getDesignBriefJsonSchema(): Record<string, unknown> {
  return getDesignBriefJsonSchemaFromFormat();
}

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
          anyOf: designObjectAnyOf(),
        },
      },
    },
  };
}

export function getDesignOperationsJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["operations"],
    properties: {
      operations: {
        type: "array",
        minItems: 1,
        maxItems: 40,
        items: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "object"],
              properties: {
                type: { type: "string", enum: ["create"] },
                object: { anyOf: designObjectAnyOf() },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "objectId", "changes"],
              properties: {
                type: { type: "string", enum: ["update"] },
                objectId: { type: "string" },
                changes: {
                  type: "object",
                  additionalProperties: false,
                  required: UPDATE_CHANGES_REQUIRED,
                  properties: UPDATE_CHANGES_PROPS,
                },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "objectId"],
              properties: {
                type: { type: "string", enum: ["delete"] },
                objectId: { type: "string" },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "objectId", "layerIndex"],
              properties: {
                type: { type: "string", enum: ["reorder"] },
                objectId: { type: "string" },
                layerIndex: { type: "number" },
              },
            },
          ],
        },
      },
    },
  };
}

export type DesignResponseFormat = {
  type: "json_schema";
  name: string;
  strict: true;
  schema: Record<string, unknown>;
};

/**
 * Recursively assert OpenAI strict Structured Outputs constraints.
 * Throws DESIGN_SCHEMA_INVALID on any violation.
 */
export function assertOpenAiStrictJsonSchema(
  schema: unknown,
  path = "$",
): void {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error(`Schema at ${path} must be an object`);
  }
  const node = schema as Record<string, unknown>;

  if (node.type === "object") {
    if (node.additionalProperties !== false) {
      throw new Error(
        `Schema at ${path} must set additionalProperties: false`,
      );
    }
    const properties = (node.properties ?? {}) as Record<string, unknown>;
    const required = Array.isArray(node.required)
      ? (node.required as string[])
      : [];
    const keys = Object.keys(properties);
    for (const key of keys) {
      if (!required.includes(key)) {
        throw new Error(
          `Schema field at ${path}/properties/${key} is missing from required[] (optional fields are not supported)`,
        );
      }
      assertOpenAiStrictJsonSchema(properties[key], `${path}/properties/${key}`);
    }
    for (const key of required) {
      if (!(key in properties)) {
        throw new Error(
          `Schema at ${path} lists required "${key}" without a properties entry`,
        );
      }
    }
  }

  if (Array.isArray(node.anyOf)) {
    node.anyOf.forEach((branch, i) =>
      assertOpenAiStrictJsonSchema(branch, `${path}/anyOf/${i}`),
    );
  }
  if (Array.isArray(node.oneOf)) {
    node.oneOf.forEach((branch, i) =>
      assertOpenAiStrictJsonSchema(branch, `${path}/oneOf/${i}`),
    );
  }
  if (node.items) {
    assertOpenAiStrictJsonSchema(node.items, `${path}/items`);
  }
}

function asResponseFormat(
  name: string,
  schema: Record<string, unknown>,
): DesignResponseFormat {
  if (schema.type !== "object") {
    throw new Error(`Root schema "${name}" must be type object, not anyOf`);
  }
  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    throw new Error(`Root schema "${name}" must not be anyOf/oneOf`);
  }
  assertOpenAiStrictJsonSchema(schema, name);
  return {
    type: "json_schema",
    name,
    strict: true,
    schema,
  };
}

/** Production response formats — construct before charging credits. */
export function createDesignBriefResponseFormat(): DesignResponseFormat {
  // Same DesignBriefSchema instance as local safeParse (via zodTextFormat).
  return asResponseFormat("design_brief", getDesignBriefJsonSchema());
}

export function createDesignSceneResponseFormat(): DesignResponseFormat {
  return asResponseFormat(
    "editable_design_scene",
    getDesignSceneJsonSchema(),
  );
}

export function createDesignOperationsResponseFormat(): DesignResponseFormat {
  return asResponseFormat(
    "design_operations",
    getDesignOperationsJsonSchema(),
  );
}

/** Preflight all Design Structured Outputs schemas used in production. */
export function createDesignResponseFormats(): {
  brief: DesignResponseFormat;
  scene: DesignResponseFormat;
  operations: DesignResponseFormat;
} {
  return {
    brief: createDesignBriefResponseFormat(),
    scene: createDesignSceneResponseFormat(),
    operations: createDesignOperationsResponseFormat(),
  };
}

/** Alias expected by tests / callers. */
export function createDesignResponseFormat(): {
  brief: DesignResponseFormat;
  scene: DesignResponseFormat;
  operations: DesignResponseFormat;
} {
  return createDesignResponseFormats();
}
