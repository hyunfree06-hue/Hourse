import { zodTextFormat } from "openai/helpers/zod";
import {
  assertOpenAiStrictJsonSchema,
  EditableDesignSceneSchema,
  type DesignResponseFormat,
} from "@/lib/design-scene/schema";

/**
 * Build OpenAI Responses text.format from the same EditableDesignSceneSchema
 * instance used for local safeParse / persistence / tests.
 */
export function createDesignSceneResponseFormatFromZod(): DesignResponseFormat {
  const format = zodTextFormat(
    EditableDesignSceneSchema,
    "editable_design_scene",
  );
  const schema = {
    ...(format.schema as Record<string, unknown>),
  };
  delete schema.$schema;
  if (schema.type !== "object") {
    throw new Error('Root schema "editable_design_scene" must be type object');
  }
  assertOpenAiStrictJsonSchema(schema, "editable_design_scene");
  return {
    type: "json_schema",
    name: "editable_design_scene",
    strict: true,
    schema,
  };
}

export function getDesignSceneJsonSchemaFromFormat(): Record<string, unknown> {
  return createDesignSceneResponseFormatFromZod().schema;
}
