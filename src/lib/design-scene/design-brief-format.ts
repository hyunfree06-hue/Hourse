import { zodTextFormat } from "openai/helpers/zod";
import { DesignBriefSchema } from "@/lib/design-scene/design-brief-schema";

export type DesignBriefResponseFormat = {
  type: "json_schema";
  name: string;
  strict: true;
  schema: Record<string, unknown>;
};

/**
 * Build the OpenAI Responses text.format from the same DesignBriefSchema
 * instance used for local safeParse.
 */
export function createDesignBriefResponseFormat(): DesignBriefResponseFormat {
  const format = zodTextFormat(DesignBriefSchema, "design_brief");
  const schema = {
    ...(format.schema as Record<string, unknown>),
  };
  // OpenAI strict preflight does not need the draft meta key.
  delete schema.$schema;
  return {
    type: "json_schema",
    name: "design_brief",
    strict: true,
    schema,
  };
}

export function getDesignBriefJsonSchemaFromFormat(): Record<string, unknown> {
  return createDesignBriefResponseFormat().schema;
}
