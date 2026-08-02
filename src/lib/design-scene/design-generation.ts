import OpenAI from "openai";
import { getServerEnv } from "@/lib/validation/env.server";
import { AppError } from "@/lib/utils/errors";
import {
  createDesignBriefResponseFormat,
  createDesignOperationsResponseFormat,
  createDesignResponseFormats,
  createDesignSceneResponseFormat,
  designBriefSchema,
  designOperationsSchema,
  editableDesignObjectSchema,
  type DesignBrief,
  type DesignOperation,
  type EditableDesignScene,
} from "@/lib/design-scene/schema";
import { validateDesignScene } from "@/lib/design-scene/validate-scene";
import { normalizeDesignScene } from "@/lib/design-scene/normalize-scene";
import { designFonts } from "@/lib/design-scene/font-registry";

export function resolveOpenAiDesignModel(): string {
  const env = getServerEnv();
  const configured = env.OPENAI_DESIGN_MODEL?.trim();
  if (configured) return configured;
  throw new AppError(
    "DESIGN_MODEL_NOT_CONFIGURED",
    "Design generation is temporarily unavailable. Your credits were restored.",
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
      "Design generation is temporarily unavailable. Your credits were restored.",
      503,
      { stage: "structured_output_schema", detail },
    );
  }
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

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new AppError(
      "DESIGN_PARSE_FAILED",
      "We couldn't create this design. Your credits were restored.",
      422,
    );
  }
}

function mapProviderSchemaError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /optional\(\)|nullish\(\)|not supported by the API|Structured Outputs schema|invalid_json_schema|schema field at/i.test(
      message,
    )
  ) {
    throw new AppError(
      "DESIGN_SCHEMA_INVALID",
      "Design generation is temporarily unavailable. Your credits were restored.",
      503,
      { stage: "structured_output_schema", detail: message },
    );
  }
  throw error instanceof AppError
    ? error
    : new AppError(
        "PROVIDER_REQUEST_FAILED",
        "We couldn't create this design. Your credits were restored.",
        422,
        { detail: message },
      );
}

export type DesignGenerationInput = {
  prompt: string;
  width: number;
  height: number;
  quality: "fast" | "standard" | "high";
  requestId: string;
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

async function generateBrief(
  client: OpenAI,
  model: string,
  input: DesignGenerationInput,
  briefFormat: ReturnType<typeof createDesignBriefResponseFormat>,
): Promise<DesignBrief> {
  let response: OpenAI.Responses.Response;
  try {
    response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "You are a senior brand designer. Produce a concise internal design brief as structured JSON only. No chain-of-thought.",
        },
        {
          role: "user",
          content: [
            `User request: ${input.prompt}`,
            `Frame size: ${Math.round(input.width)}x${Math.round(input.height)}`,
            `Quality: ${input.quality}`,
            "Cover hierarchy, layout, typography roles, palette, spacing rhythm, required objects, alignment, category, and tone.",
          ].join("\n"),
        },
      ],
      text: { format: briefFormat },
    });
  } catch (error) {
    mapProviderSchemaError(error);
  }

  const parsed = designBriefSchema.safeParse(
    parseJsonObject(extractOutputText(response)),
  );
  if (!parsed.success) {
    throw new AppError(
      "DESIGN_BRIEF_INVALID",
      "We couldn't create this design. Your credits were restored.",
      422,
    );
  }
  return parsed.data;
}

async function generateSceneFromBrief(
  client: OpenAI,
  model: string,
  input: DesignGenerationInput,
  brief: DesignBrief,
  sceneFormat: ReturnType<typeof createDesignSceneResponseFormat>,
): Promise<EditableDesignScene> {
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
            "Text must remain editable text objects. Logo symbols should be vector shapes/paths/groups, separate from wordmarks.",
            "Use only these fonts:",
            designFonts.join(", "),
            "Prefer Noto Sans KR for Korean text. Prefer Inter/Geist/IBM Plex Sans/Space Grotesk for Latin sans.",
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
          ].join("\n"),
        },
      ],
      text: { format: sceneFormat },
    });
  } catch (error) {
    mapProviderSchemaError(error);
  }

  const raw = parseJsonObject(extractOutputText(response));
  if (raw && typeof raw === "object" && !("version" in (raw as object))) {
    (raw as { version: number }).version = 1;
  }

  const validated = validateDesignScene(raw);
  return normalizeDesignScene(validated);
}

export async function generateEditableDesign(
  input: DesignGenerationInput,
): Promise<{ brief: DesignBrief; scene: EditableDesignScene }> {
  const client = await createClient();
  const formats = input.formats ?? createDesignResponseFormats();
  const model = input.model ?? resolveOpenAiDesignModel();
  const brief = await generateBrief(client, model, input, formats.brief);
  const scene = await generateSceneFromBrief(
    client,
    model,
    input,
    brief,
    formats.scene,
  );
  const sized = normalizeDesignScene({
    ...scene,
    canvas: {
      ...scene.canvas,
      width: Math.round(input.width),
      height: Math.round(input.height),
    },
  });
  return { brief, scene: sized };
}

export async function refineEditableDesign(
  input: DesignRefineInput,
): Promise<{ operations: DesignOperation[] }> {
  const client = await createClient();
  const formats = input.formats ?? createDesignResponseFormats();
  const model = input.model ?? resolveOpenAiDesignModel();

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
    mapProviderSchemaError(error);
  }

  const raw = parseJsonObject(extractOutputText(response));
  const parsed = designOperationsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(
      "DESIGN_REFINE_INVALID",
      "We couldn't create this design. Your credits were restored.",
      422,
    );
  }
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
