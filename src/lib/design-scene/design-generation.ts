import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { getServerEnv } from "@/lib/validation/env.server";
import { AppError } from "@/lib/utils/errors";
import {
  designBriefSchema,
  designOperationsSchema,
  editableDesignObjectSchema,
  getDesignBriefJsonSchema,
  getDesignSceneJsonSchema,
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
  // No separate text-model env exists in this project; require explicit config.
  throw new AppError(
    "DESIGN_MODEL_NOT_CONFIGURED",
    "Design generation is not configured.",
    503,
  );
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

export type DesignGenerationInput = {
  prompt: string;
  width: number;
  height: number;
  quality: "fast" | "standard" | "high";
  requestId: string;
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
): Promise<DesignBrief> {
  const response = await client.responses.create({
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
    text: {
      format: {
        type: "json_schema",
        name: "design_brief",
        strict: true,
        schema: getDesignBriefJsonSchema(),
      },
    },
  });

  const parsed = designBriefSchema.safeParse(parseJsonObject(extractOutputText(response)));
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
): Promise<EditableDesignScene> {
  const response = await client.responses.create({
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
    text: {
      format: {
        type: "json_schema",
        name: "editable_design_scene",
        strict: false,
        schema: getDesignSceneJsonSchema(),
      },
    },
  });

  const raw = parseJsonObject(extractOutputText(response));
  // Soft-coerce version if model omits it
  if (raw && typeof raw === "object" && !("version" in (raw as object))) {
    (raw as { version: number }).version = 1;
  }

  const validated = validateDesignScene(raw);
  return normalizeDesignScene(validated);
}

/**
 * Two-pass Design generation: brief → validated editable scene graph.
 * One user action / one billable charge at the API layer.
 */
export async function generateEditableDesign(
  input: DesignGenerationInput,
): Promise<{ brief: DesignBrief; scene: EditableDesignScene }> {
  const client = await createClient();
  const model = resolveOpenAiDesignModel();
  const brief = await generateBrief(client, model, input);
  const scene = await generateSceneFromBrief(client, model, input, brief);
  // Force canvas size to the requested region frame in local coords.
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
  const model = resolveOpenAiDesignModel();

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          "You refine an existing editable design. Return only structured operations: create, update, delete, reorder. Keep text as text and vectors as vectors. No markdown.",
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
    text: {
      format: zodTextFormat(designOperationsSchema, "design_operations"),
    },
  });

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
        const merged = { ...o, ...op.changes, id: o.id, type: o.type };
        const check = editableDesignObjectSchema.safeParse(merged);
        return check.success ? check.data : o;
      });
    }
  }
  return next;
}
