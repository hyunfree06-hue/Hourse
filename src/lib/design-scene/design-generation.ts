import OpenAI from "openai";
import { getServerEnv } from "@/lib/validation/env.server";
import { AppError, logServerError, logServerInfo } from "@/lib/utils/errors";
import {
  createDesignBriefResponseFormat,
  createDesignOperationsResponseFormat,
  DesignBriefSchema,
  designOperationsSchema,
  editableDesignObjectSchema,
  normalizeDesignBrief,
  summarizeUnknownValue,
  summarizeZodIssue,
  MIN_FONT_SIZE,
  type DesignBrief,
  type DesignOperation,
  type EditableDesignScene,
} from "@/lib/design-scene/schema";
import {
  createDesignResponseFormats,
  createDesignSceneResponseFormat,
} from "@/lib/design-scene/design-response-formats";
import { validateDesignScene, DesignSceneValidationError, safeParseDesignScene, summarizeFirstSceneZodIssue } from "@/lib/design-scene/validate-scene";
import { normalizeDesignSceneWithDiagnostics } from "@/lib/design-scene/normalize-diagnostics";
import {
  preNormalizeSceneRaw,
  sceneIssuesAreOnlyRecoverableNumeric,
} from "@/lib/design-scene/pre-normalize-scene";
import { designFonts } from "@/lib/design-scene/font-registry";
import {
  DesignGenerationError,
  type DesignFailureStage,
} from "@/lib/design-scene/errors";

export function resolveOpenAiDesignModel(): string {
  const env = getServerEnv();
  const configured = env.OPENAI_DESIGN_MODEL?.trim();
  if (configured) return configured;
  throw new AppError(
    "DESIGN_MODEL_NOT_CONFIGURED",
    "Design generation is temporarily unavailable.",
    503,
  );
}

/**
 * Construct and validate every Structured Outputs format used by Design.
 * Must run before credit consumption.
 */
export function preflightDesignStructuredOutputs(): {
  brief: ReturnType<typeof createDesignBriefResponseFormat>;
  scene: ReturnType<typeof createDesignSceneResponseFormat>;
  operations: ReturnType<typeof createDesignOperationsResponseFormat>;
  model: string;
} {
  try {
    const formats = createDesignResponseFormats();
    const model = resolveOpenAiDesignModel();
    return { ...formats, model };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    throw new AppError(
      "DESIGN_SCHEMA_INVALID",
      "Design generation is temporarily unavailable.",
      503,
      { stage: "structured_output_schema", detail },
    );
  }
}

type DesignLogCtx = {
  requestId: string;
  generationId?: string;
  projectId?: string;
};

function designLog(
  stage: DesignFailureStage | string,
  ctx: DesignLogCtx,
  extra?: Record<string, unknown>,
) {
  logServerInfo({
    requestId: ctx.requestId,
    route: "design_generation",
    stage,
    generationId: ctx.generationId,
    projectId: ctx.projectId,
    ...extra,
  });
}

function designFailLog(
  stage: DesignFailureStage | string,
  ctx: DesignLogCtx,
  code: string,
  extra?: Record<string, unknown>,
) {
  logServerError({
    requestId: ctx.requestId,
    route: "design_generation",
    stage,
    generationId: ctx.generationId,
    projectId: ctx.projectId,
    code,
    failureStage: stage,
    ...extra,
  });
}

function extractRefusal(response: OpenAI.Responses.Response): string | null {
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "refusal" && typeof part.refusal === "string") {
        return part.refusal;
      }
    }
  }
  return null;
}

function extractOutputText(response: OpenAI.Responses.Response): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  const chunks: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join("\n");
}

function assertUsableProviderResponse(
  response: OpenAI.Responses.Response,
  ctx: DesignLogCtx,
): void {
  designLog("provider_response_received", ctx, {
    providerStatus: response.status,
    outputItemCount: response.output?.length ?? 0,
  });
  designLog("provider_response_status", ctx, {
    providerStatus: response.status,
    hasError: Boolean(response.error),
    incompleteReason:
      response.incomplete_details &&
      typeof response.incomplete_details === "object" &&
      "reason" in response.incomplete_details
        ? String(
            (response.incomplete_details as { reason?: string }).reason ?? "",
          )
        : undefined,
  });

  const refusal = extractRefusal(response);
  if (refusal) {
    designFailLog("provider_refusal", ctx, "DESIGN_PROVIDER_REFUSED");
    throw new DesignGenerationError("DESIGN_PROVIDER_REFUSED", {
      stage: "provider_refusal",
      requestId: ctx.requestId,
    });
  }

  if (response.status === "incomplete") {
    designFailLog("provider_incomplete", ctx, "DESIGN_PROVIDER_INCOMPLETE");
    throw new DesignGenerationError("DESIGN_PROVIDER_INCOMPLETE", {
      stage: "provider_incomplete",
      requestId: ctx.requestId,
    });
  }

  if (response.status === "failed" || response.error) {
    designFailLog("provider_response_status", ctx, "DESIGN_PROVIDER_INCOMPLETE", {
      providerErrorCode:
        response.error && typeof response.error === "object"
          ? String(
              (response.error as { code?: string }).code ??
                (response.error as { message?: string }).message ??
                "",
            ).slice(0, 80)
          : undefined,
    });
    throw new DesignGenerationError("DESIGN_PROVIDER_INCOMPLETE", {
      stage: "provider_response_status",
      requestId: ctx.requestId,
    });
  }

  if (!response.output || response.output.length === 0) {
    designFailLog("provider_response_received", ctx, "DESIGN_OUTPUT_EMPTY");
    throw new DesignGenerationError("DESIGN_OUTPUT_EMPTY", {
      stage: "provider_response_received",
      requestId: ctx.requestId,
    });
  }
}

function parseJsonObject(text: string, ctx: DesignLogCtx): unknown {
  designLog("structured_output_parse", ctx);
  const trimmed = text.trim();
  if (!trimmed) {
    designFailLog("structured_output_parse", ctx, "DESIGN_OUTPUT_PARSE_FAILED");
    throw new DesignGenerationError("DESIGN_OUTPUT_PARSE_FAILED", {
      stage: "structured_output_parse",
      requestId: ctx.requestId,
      internalReason: "EMPTY_OUTPUT_TEXT",
    });
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    designFailLog("structured_output_parse", ctx, "DESIGN_OUTPUT_PARSE_FAILED");
    throw new DesignGenerationError("DESIGN_OUTPUT_PARSE_FAILED", {
      stage: "structured_output_parse",
      requestId: ctx.requestId,
    });
  }
}

function mapProviderSchemaError(error: unknown, ctx: DesignLogCtx): never {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /optional\(\)|nullish\(\)|not supported by the API|Structured Outputs schema|invalid_json_schema|schema field at/i.test(
      message,
    )
  ) {
    throw new AppError(
      "DESIGN_SCHEMA_INVALID",
      "Design generation is temporarily unavailable.",
      503,
      { stage: "structured_output_schema", detail: message },
      ctx.requestId,
    );
  }
  if (error instanceof DesignGenerationError || error instanceof AppError) {
    throw error;
  }
  designFailLog("provider_request_start", ctx, "DESIGN_PROVIDER_INCOMPLETE", {
    safeError: message.slice(0, 160),
  });
  throw new DesignGenerationError("DESIGN_PROVIDER_INCOMPLETE", {
    stage: "provider_request_start",
    requestId: ctx.requestId,
  });
}

export type DesignGenerationInput = {
  prompt: string;
  width: number;
  height: number;
  quality: "fast" | "standard" | "high";
  requestId: string;
  generationId?: string;
  projectId?: string;
  /** Prebuilt formats from preflight (avoids rebuilding after charge). */
  formats?: ReturnType<typeof createDesignResponseFormats>;
  model?: string;
};

export type DesignRefineInput = {
  prompt: string;
  width: number;
  height: number;
  quality: "fast" | "standard" | "high";
  selectedObjects: unknown[];
  nearbySummary?: string;
  selectedBounds?: { left: number; top: number; width: number; height: number };
  requestId: string;
  generationId?: string;
  projectId?: string;
  formats?: ReturnType<typeof createDesignResponseFormats>;
  model?: string;
};

async function createClient(): Promise<OpenAI> {
  const env = getServerEnv();
  if (!env.OPENAI_API_KEY) {
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      "Design generation is not configured.",
      503,
    );
  }
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

async function generateBriefOnce(
  client: OpenAI,
  model: string,
  input: DesignGenerationInput,
  briefFormat: ReturnType<typeof createDesignBriefResponseFormat>,
  ctx: DesignLogCtx,
  retry: boolean,
): Promise<DesignBrief> {
  designLog("provider_request_start", ctx, {
    pass: "brief",
    briefRetry: retry,
  });
  let response: OpenAI.Responses.Response;
  try {
    response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: [
            "You are a senior brand designer. Produce a concise internal design brief as structured JSON only. No chain-of-thought.",
            "spacingRhythm must be an array of numbers (e.g. [4, 8, 12, 16, 24, 32]), never a string.",
            "spacingNotes must be a short string describing spacing usage.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `User request: ${input.prompt}`,
            `Frame size: ${Math.round(input.width)}x${Math.round(input.height)}`,
            `Quality: ${input.quality}`,
            "Cover hierarchy, layout, typography roles, palette, spacing rhythm, required objects, alignment, category, and tone.",
            retry
              ? "RETRY: Strictly match the schema. spacingRhythm must be number[] like [4,8,12,16,24,32]. spacingNotes must be a string."
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      text: { format: briefFormat },
    });
  } catch (error) {
    mapProviderSchemaError(error, ctx);
  }

  assertUsableProviderResponse(response, ctx);
  const raw = parseJsonObject(extractOutputText(response), ctx);
  if (raw == null) {
    throw new DesignGenerationError("DESIGN_OUTPUT_PARSE_FAILED", {
      stage: "structured_output_parse",
      requestId: ctx.requestId,
    });
  }

  // Same schema instance as zodTextFormat / preflight.
  const parsed = DesignBriefSchema.safeParse(raw);
  if (!parsed.success) {
    const spacingValue =
      raw && typeof raw === "object"
        ? (raw as { spacingRhythm?: unknown }).spacingRhythm
        : undefined;
    const issueSummaries = parsed.error.issues
      .slice(0, 8)
      .map((issue) => summarizeZodIssue(issue, raw));
    designFailLog(
      "structured_output_parse",
      ctx,
      "DESIGN_OUTPUT_SCHEMA_INVALID",
      {
        issueCount: parsed.error.issues.length,
        firstPath: issueSummaries[0]?.issuePath ?? null,
        issues: issueSummaries,
        spacingRhythm: summarizeUnknownValue(spacingValue),
        briefRetry: retry,
      },
    );
    throw new DesignGenerationError("DESIGN_OUTPUT_SCHEMA_INVALID", {
      stage: "structured_output_parse",
      requestId: ctx.requestId,
      internalReason: "BRIEF_SCHEMA_MISMATCH",
      details: {
        firstPath: issueSummaries[0]?.issuePath ?? null,
        spacingRhythm: summarizeUnknownValue(spacingValue),
      },
    });
  }

  return normalizeDesignBrief(parsed.data);
}

async function generateBrief(
  client: OpenAI,
  model: string,
  input: DesignGenerationInput,
  briefFormat: ReturnType<typeof createDesignBriefResponseFormat>,
  ctx: DesignLogCtx,
): Promise<DesignBrief> {
  try {
    return await generateBriefOnce(
      client,
      model,
      input,
      briefFormat,
      ctx,
      false,
    );
  } catch (error) {
    if (
      error instanceof DesignGenerationError &&
      error.code === "DESIGN_OUTPUT_SCHEMA_INVALID"
    ) {
      designLog("structured_output_parse", ctx, {
        briefRetry: true,
        message: "retrying brief once after schema mismatch",
      });
      return generateBriefOnce(client, model, input, briefFormat, ctx, true);
    }
    throw error;
  }
}

async function generateSceneOnce(
  client: OpenAI,
  model: string,
  input: DesignGenerationInput,
  brief: DesignBrief,
  sceneFormat: ReturnType<typeof createDesignSceneResponseFormat>,
  ctx: DesignLogCtx,
  retry: boolean,
): Promise<EditableDesignScene> {
  designLog("provider_request_start", ctx, {
    pass: "scene",
    sceneRetry: retry,
  });
  let response: OpenAI.Responses.Response;
  try {
    response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: [
            "You create editable design compositions as strict JSON scene graphs.",
            "Never return a single flattened image as the whole design.",
            "Text must remain editable text objects.",
            "For logos: include one refined vector symbol (path/group) and one editable wordmark as separate layers. Optional supporting text only when requested. Balanced alignment, optical spacing, no placeholder geometry, no decorative random shapes.",
            "Prefer professional spacing, strong typography hierarchy, refined vector symbols, and separate semantic layers.",
            "Use only these fonts:",
            designFonts.join(", "),
            "Prefer Noto Sans KR for Korean text. Prefer Inter/Geist/IBM Plex Sans/Space Grotesk for Latin sans.",
            `All text fontSize values must be >= ${MIN_FONT_SIZE}.`,
            "All object width/height values must be positive finite numbers.",
            "strokeWidth may be 0; do not force strokeWidth to 8.",
            "Coordinates are local to the frame starting at 0,0.",
            "Only include image objects when photography/texture/product realism is truly required.",
            "Every object must include semanticRole (string or null) and parentId (string or null).",
            "No HTML, JavaScript, external URLs, or markdown.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `User request: ${input.prompt}`,
            `Frame: ${Math.round(input.width)}x${Math.round(input.height)}`,
            `Design brief: ${JSON.stringify(brief)}`,
            "Return only the editable design scene graph.",
            retry
              ? [
                  "RETRY: Regenerate the same editable scene.",
                  `All text font sizes must be at least ${MIN_FONT_SIZE}.`,
                  "All object dimensions must be positive.",
                  "All numeric values must satisfy the supplied JSON Schema.",
                  "Preserve the original visual direction, typography hierarchy, symbol + wordmark separation, and professional spacing.",
                ].join(" ")
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      text: { format: sceneFormat },
    });
  } catch (error) {
    mapProviderSchemaError(error, ctx);
  }

  assertUsableProviderResponse(response, ctx);
  const raw = parseJsonObject(extractOutputText(response), ctx);
  if (raw == null) {
    throw new DesignGenerationError("DESIGN_OUTPUT_PARSE_FAILED", {
      stage: "structured_output_parse",
      requestId: ctx.requestId,
    });
  }
  if (raw && typeof raw === "object" && !("version" in (raw as object))) {
    (raw as { version: number }).version = 1;
  }

  designLog("scene_schema_validation", ctx, { sceneRetry: retry });

  const rawParsed = safeParseDesignScene(raw);
  if (!rawParsed.success && rawParsed.error.issues[0]) {
    designFailLog("scene_schema_validation", ctx, "DESIGN_SCENE_INVALID", {
      sceneRetry: retry,
      phase: "raw_provider_output",
      firstIssue: summarizeFirstSceneZodIssue(rawParsed.error.issues[0], raw),
      recoverableOnly: sceneIssuesAreOnlyRecoverableNumeric(
        rawParsed.error.issues,
      ),
    });
  }

  const { value: normalizedRaw, repairs } = preNormalizeSceneRaw(raw);
  if (repairs.length > 0) {
    designLog("scene_normalization", ctx, {
      phase: "pre_validate_numeric_repair",
      sceneRetry: retry,
      repairs: repairs.slice(0, 12).map((r) => ({
        fieldPath: r.fieldPath,
        originalValue: r.originalValue,
        normalizedValue: r.normalizedValue,
      })),
    });
  }

  const repairedParsed = safeParseDesignScene(normalizedRaw);
  if (!repairedParsed.success) {
    const first = repairedParsed.error.issues[0];
    const recoverable = sceneIssuesAreOnlyRecoverableNumeric(
      repairedParsed.error.issues,
    );
    const firstIssue = first
      ? summarizeFirstSceneZodIssue(first, normalizedRaw)
      : null;
    designFailLog("scene_schema_validation", ctx, "DESIGN_SCENE_INVALID", {
      sceneRetry: retry,
      phase: "after_numeric_repair",
      firstIssue,
      recoverableOnly: recoverable,
      internalReason: first?.message?.slice(0, 120) ?? "SCHEMA_VALIDATION_FAILED",
    });
    throw new DesignGenerationError("DESIGN_SCENE_INVALID", {
      stage: "scene_schema_validation",
      requestId: ctx.requestId,
      internalReason: recoverable
        ? "SCENE_RECOVERABLE_NUMERIC_VALIDATION_FAILED"
        : "SCENE_SCHEMA_VALIDATION_FAILED",
      details: {
        firstIssue,
        recoverableOnly: recoverable,
        sceneRetry: retry,
      },
    });
  }

  let validated: EditableDesignScene;
  try {
    validated = validateDesignScene(normalizedRaw);
  } catch (error) {
    designFailLog("scene_schema_validation", ctx, "DESIGN_SCENE_INVALID", {
      sceneRetry: retry,
      phase: "post_schema_integrity",
      internalReason:
        error instanceof DesignSceneValidationError
          ? error.message.slice(0, 120)
          : "SCHEMA_VALIDATION_FAILED",
      recoverableOnly: false,
    });
    throw new DesignGenerationError("DESIGN_SCENE_INVALID", {
      stage: "scene_schema_validation",
      requestId: ctx.requestId,
      internalReason: "SCENE_SCHEMA_VALIDATION_FAILED",
      details: { recoverableOnly: false, sceneRetry: retry },
    });
  }

  designLog("scene_normalization", ctx, {
    inputObjectCount: validated.objects.length,
    sceneRetry: retry,
  });
  const diagnostics = normalizeDesignSceneWithDiagnostics(validated, {
    requestId: ctx.requestId,
    generationId: ctx.generationId,
  });
  designLog("scene_normalization", ctx, {
    inputObjectCount: diagnostics.inputObjectCount,
    validObjectCount: diagnostics.validObjectCount,
    rejectedObjectCount: diagnostics.rejectedObjectCount,
    rejectionReasons: diagnostics.rejections.map((r) => r.reason).slice(0, 12),
    sceneRetry: retry,
  });

  if (diagnostics.validObjectCount === 0) {
    throw new DesignGenerationError("DESIGN_SCENE_INVALID", {
      stage: "scene_normalization",
      requestId: ctx.requestId,
      internalReason: "ALL_GENERATED_OBJECTS_REJECTED",
    });
  }

  return diagnostics.scene;
}

async function generateSceneFromBrief(
  client: OpenAI,
  model: string,
  input: DesignGenerationInput,
  brief: DesignBrief,
  sceneFormat: ReturnType<typeof createDesignSceneResponseFormat>,
  ctx: DesignLogCtx,
): Promise<EditableDesignScene> {
  try {
    return await generateSceneOnce(
      client,
      model,
      input,
      brief,
      sceneFormat,
      ctx,
      false,
    );
  } catch (error) {
    const details =
      error instanceof DesignGenerationError
        ? (error.details as { recoverableOnly?: boolean } | undefined)
        : undefined;
    if (
      error instanceof DesignGenerationError &&
      error.code === "DESIGN_SCENE_INVALID" &&
      (details?.recoverableOnly === true ||
        error.internalReason ===
          "SCENE_RECOVERABLE_NUMERIC_VALIDATION_FAILED")
    ) {
      designLog("scene_schema_validation", ctx, {
        sceneRetry: true,
        message:
          "retrying scene once after recoverable numeric validation failure (zero credits)",
        generationId: ctx.generationId,
      });
      return generateSceneOnce(
        client,
        model,
        input,
        brief,
        sceneFormat,
        ctx,
        true,
      );
    }
    throw error;
  }
}

function assertNormalGenerationCreates(
  scene: EditableDesignScene,
  ctx: DesignLogCtx,
): void {
  designLog("operation_count", ctx, {
    objectCount: scene.objects.length,
    createCount: scene.objects.length,
  });
  if (scene.objects.length === 0) {
    designFailLog("operation_count", ctx, "DESIGN_OPERATIONS_EMPTY");
    throw new DesignGenerationError("DESIGN_OPERATIONS_EMPTY", {
      stage: "operation_count",
      requestId: ctx.requestId,
    });
  }

  designLog("object_conversion_preflight", ctx, {
    objectCount: scene.objects.length,
    objectTypes: scene.objects.map((o) => o.type).slice(0, 24),
  });
  for (const obj of scene.objects) {
    if (
      !Number.isFinite(obj.left) ||
      !Number.isFinite(obj.top) ||
      !Number.isFinite(obj.width) ||
      !Number.isFinite(obj.height) ||
      obj.width <= 0 ||
      obj.height <= 0
    ) {
      throw new DesignGenerationError("DESIGN_OBJECT_CONVERSION_FAILED", {
        stage: "object_conversion_preflight",
        requestId: ctx.requestId,
        details: { objectId: obj.id, objectType: obj.type },
      });
    }
  }
}

export async function generateEditableDesign(
  input: DesignGenerationInput,
): Promise<{ brief: DesignBrief; scene: EditableDesignScene }> {
  const ctx: DesignLogCtx = {
    requestId: input.requestId,
    generationId: input.generationId,
    projectId: input.projectId,
  };
  const client = await createClient();
  const formats = input.formats ?? createDesignResponseFormats();
  const model = input.model ?? resolveOpenAiDesignModel();
  const brief = await generateBrief(client, model, input, formats.brief, ctx);
  const scene = await generateSceneFromBrief(
    client,
    model,
    input,
    brief,
    formats.scene,
    ctx,
  );
  const sizedCanvas = {
    ...scene.canvas,
    width: Math.round(input.width),
    height: Math.round(input.height),
  };
  const sizedDiagnostics = normalizeDesignSceneWithDiagnostics(
    { ...scene, canvas: sizedCanvas },
    { requestId: ctx.requestId, generationId: ctx.generationId },
  );
  assertNormalGenerationCreates(sizedDiagnostics.scene, ctx);
  return { brief, scene: sizedDiagnostics.scene };
}

function assertRefineOperations(
  operations: DesignOperation[],
  ctx: DesignLogCtx,
): void {
  designLog("operation_validation", ctx, {
    operationCount: operations.length,
  });
  const types = operations.map((o) => o.type);
  const createCount = types.filter((t) => t === "create").length;
  const updateCount = types.filter((t) => t === "update").length;
  const deleteCount = types.filter((t) => t === "delete").length;
  const reorderCount = types.filter((t) => t === "reorder").length;
  designLog("operation_count", ctx, {
    operationCount: operations.length,
    operationTypes: [...new Set(types)],
    createCount,
    updateCount,
    deleteCount,
    reorderCount,
  });

  if (operations.length === 0) {
    designFailLog("operation_count", ctx, "DESIGN_OPERATIONS_EMPTY");
    throw new DesignGenerationError("DESIGN_OPERATIONS_EMPTY", {
      stage: "operation_count",
      requestId: ctx.requestId,
    });
  }
}

/**
 * Normal (non-refine) generation must produce create operations only when
 * operations are used. Scene-based generation uses objects as creates.
 */
export function assertNormalGenerationOperations(
  operations: DesignOperation[],
  ctx: DesignLogCtx,
): void {
  assertRefineOperations(operations, ctx);
  const nonCreate = operations.filter((o) => o.type !== "create");
  if (nonCreate.length === operations.length) {
    designFailLog("operation_validation", ctx, "DESIGN_OPERATIONS_EMPTY", {
      internalReason: "NORMAL_GENERATION_UPDATE_OR_DELETE_ONLY",
    });
    throw new DesignGenerationError("DESIGN_OPERATIONS_EMPTY", {
      stage: "operation_validation",
      requestId: ctx.requestId,
      internalReason: "NORMAL_GENERATION_REQUIRES_CREATE",
    });
  }
  const createCount = operations.filter((o) => o.type === "create").length;
  if (createCount === 0) {
    throw new DesignGenerationError("DESIGN_OPERATIONS_EMPTY", {
      stage: "operation_count",
      requestId: ctx.requestId,
      internalReason: "NORMAL_GENERATION_REQUIRES_CREATE",
    });
  }
}

export async function refineEditableDesign(
  input: DesignRefineInput,
): Promise<{ operations: DesignOperation[] }> {
  const ctx: DesignLogCtx = {
    requestId: input.requestId,
    generationId: input.generationId,
    projectId: input.projectId,
  };
  const client = await createClient();
  const formats = input.formats ?? createDesignResponseFormats();
  const model = input.model ?? resolveOpenAiDesignModel();

  designLog("provider_request_start", ctx, { pass: "refine" });
  let response: OpenAI.Responses.Response;
  try {
    response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "You refine an existing editable design. Return only structured operations: create, update, delete, reorder. For update.changes, every field is required — use null to leave a property unchanged. Keep text as text and vectors as vectors. No markdown.",
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction: input.prompt,
            frame: { width: input.width, height: input.height },
            selectedObjects: input.selectedObjects,
            nearbySummary: input.nearbySummary ?? null,
            selectedBounds: input.selectedBounds ?? null,
            quality: input.quality,
          }),
        },
      ],
      text: { format: formats.operations },
    });
  } catch (error) {
    mapProviderSchemaError(error, ctx);
  }

  assertUsableProviderResponse(response, ctx);
  const raw = parseJsonObject(extractOutputText(response), ctx);
  if (raw == null) {
    throw new DesignGenerationError("DESIGN_OUTPUT_PARSE_FAILED", {
      stage: "structured_output_parse",
      requestId: ctx.requestId,
    });
  }
  const parsed = designOperationsSchema.safeParse(raw);
  if (!parsed.success) {
    designFailLog("structured_output_parse", ctx, "DESIGN_OUTPUT_SCHEMA_INVALID", {
      issueCount: parsed.error.issues.length,
    });
    throw new DesignGenerationError("DESIGN_OUTPUT_SCHEMA_INVALID", {
      stage: "structured_output_parse",
      requestId: ctx.requestId,
      internalReason: "OPERATIONS_SCHEMA_MISMATCH",
    });
  }
  assertRefineOperations(parsed.data.operations, ctx);
  return parsed.data;
}

/** Apply refine operations onto a scene object list (server-side validation aid). */
export function applyDesignOperations(
  objects: EditableDesignScene["objects"],
  operations: DesignOperation[],
): EditableDesignScene["objects"] {
  let next = [...objects];
  for (const op of operations) {
    if (op.type === "create") {
      const candidate = editableDesignObjectSchema.safeParse(op.object);
      if (!candidate.success) continue;
      next.push(candidate.data);
    } else if (op.type === "delete") {
      next = next.filter((o) => o.id !== op.objectId);
    } else if (op.type === "reorder") {
      next = next.map((o) =>
        o.id === op.objectId ? { ...o, layerIndex: op.layerIndex } : o,
      );
    } else if (op.type === "update") {
      next = next.map((o) => {
        if (o.id !== op.objectId) return o;
        const patch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(op.changes)) {
          if (value !== null) patch[key] = value;
        }
        const merged = { ...o, ...patch, id: o.id, type: o.type };
        const check = editableDesignObjectSchema.safeParse(merged);
        return check.success ? check.data : o;
      });
    }
  }
  return next;
}
