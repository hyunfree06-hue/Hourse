import {
  EditableDesignSceneSchema,
  MAX_DESIGN_GROUPS,
  MAX_IMAGE_PLACEHOLDERS,
  MAX_PATH_LENGTH,
  type EditableDesignObject,
  type EditableDesignScene,
} from "@/lib/design-scene/schema";

export class DesignSceneValidationError extends Error {
  readonly issues: ReturnType<typeof summarizeFirstSceneZodIssue>[];

  constructor(
    message: string,
    issues: ReturnType<typeof summarizeFirstSceneZodIssue>[] = [],
  ) {
    super(message);
    this.name = "DesignSceneValidationError";
    this.issues = issues;
  }
}

function getValueAtPath(raw: unknown, path: PropertyKey[]): unknown {
  let cursor: unknown = raw;
  for (const key of path) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string | number, unknown>)[
      key as string | number
    ];
  }
  return cursor;
}

/**
 * Safe first-issue summary for scene schema failures.
 * Does not log prompts or full provider payloads.
 */
export function summarizeFirstSceneZodIssue(
  issue: {
    code: string;
    path: PropertyKey[];
    minimum?: unknown;
    maximum?: unknown;
    message?: string;
  },
  raw: unknown,
): {
  path: string;
  code: string;
  minimum: number | null;
  receivedType: string;
  receivedValue: number | undefined;
} {
  const failingValue = getValueAtPath(raw, issue.path);
  return {
    path: issue.path.map(String).join("."),
    code: issue.code,
    minimum:
      "minimum" in issue && typeof issue.minimum === "number"
        ? issue.minimum
        : null,
    receivedType: typeof failingValue,
    receivedValue:
      typeof failingValue === "number" ? failingValue : undefined,
  };
}

function assertColorSafe(value: string | null | undefined, field: string) {
  if (value == null) return;
  const lower = value.toLowerCase();
  if (
    lower.includes("url(") ||
    lower.includes("javascript:") ||
    lower.includes("expression(") ||
    lower.includes("<") ||
    lower.includes(">")
  ) {
    throw new DesignSceneValidationError(`Unsafe color value on ${field}`);
  }
}

function assertNoExternalUrl(value: string, field: string) {
  if (/https?:\/\//i.test(value) || /data:/i.test(value) || /javascript:/i.test(value)) {
    throw new DesignSceneValidationError(`External/resource URL not allowed on ${field}`);
  }
}

function assertObjectBounds(obj: EditableDesignObject, canvasW: number, canvasH: number) {
  const margin = Math.max(canvasW, canvasH) * 0.5;
  if (
    obj.left < -margin ||
    obj.top < -margin ||
    obj.left > canvasW + margin ||
    obj.top > canvasH + margin
  ) {
    throw new DesignSceneValidationError(`Object ${obj.id} is outside allowed canvas limits`);
  }
  if (!Number.isFinite(obj.width) || !Number.isFinite(obj.height) || obj.width <= 0 || obj.height <= 0) {
    throw new DesignSceneValidationError(`Object ${obj.id} has invalid dimensions`);
  }
}

export function validateDesignScene(input: unknown): EditableDesignScene {
  const parsed = EditableDesignSceneSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const issues = first ? [summarizeFirstSceneZodIssue(first, input)] : [];
    throw new DesignSceneValidationError(
      `Invalid design scene: ${first?.message ?? "schema error"}`,
      issues,
    );
  }

  const scene = parsed.data;
  const ids = new Set<string>();
  let groupCount = 0;
  let imageCount = 0;

  for (const obj of scene.objects) {
    if (ids.has(obj.id)) {
      throw new DesignSceneValidationError(`Duplicate object id: ${obj.id}`);
    }
    ids.add(obj.id);

    assertObjectBounds(obj, scene.canvas.width, scene.canvas.height);

    if ("fill" in obj) assertColorSafe(obj.fill as string | null, `${obj.id}.fill`);
    if ("stroke" in obj) assertColorSafe(obj.stroke as string | null, `${obj.id}.stroke`);

    if (obj.type === "text") {
      assertNoExternalUrl(obj.text, `${obj.id}.text`);
      assertColorSafe(obj.fill, `${obj.id}.fill`);
    }

    if (obj.type === "path") {
      if (obj.pathData.length > MAX_PATH_LENGTH) {
        throw new DesignSceneValidationError(`Path too long on ${obj.id}`);
      }
      if (/javascript:|<|>|url\(/i.test(obj.pathData)) {
        throw new DesignSceneValidationError(`Unsafe path data on ${obj.id}`);
      }
    }

    if (obj.type === "image") {
      imageCount += 1;
      assertNoExternalUrl(obj.prompt, `${obj.id}.prompt`);
      if (obj.assetId != null) {
        throw new DesignSceneValidationError(`Model must not supply assetId for ${obj.id}`);
      }
    }

    if (obj.type === "group") {
      groupCount += 1;
    }
  }

  if (groupCount > MAX_DESIGN_GROUPS) {
    throw new DesignSceneValidationError(`Too many groups (max ${MAX_DESIGN_GROUPS})`);
  }
  if (imageCount > MAX_IMAGE_PLACEHOLDERS) {
    throw new DesignSceneValidationError(`Too many image placeholders (max ${MAX_IMAGE_PLACEHOLDERS})`);
  }

  for (const obj of scene.objects) {
    if (obj.parentId && !ids.has(obj.parentId)) {
      throw new DesignSceneValidationError(`Unknown parentId on ${obj.id}`);
    }
    if (obj.type === "group") {
      for (const childId of obj.childIds) {
        if (!ids.has(childId)) {
          throw new DesignSceneValidationError(`Group ${obj.id} references missing child ${childId}`);
        }
      }
    }
  }

  assertColorSafe(scene.canvas.background, "canvas.background");
  for (const [key, value] of Object.entries(scene.palette)) {
    assertColorSafe(value, `palette.${key}`);
  }

  return scene;
}

/** Parse-only helper for diagnostics / recoverable-issue detection. */
export function safeParseDesignScene(input: unknown) {
  return EditableDesignSceneSchema.safeParse(input);
}
