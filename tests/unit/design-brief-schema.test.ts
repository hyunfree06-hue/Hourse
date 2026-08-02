import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import {
  DesignBriefSchema,
  designBriefSchema,
  normalizeDesignBrief,
  summarizeUnknownValue,
  summarizeZodIssue,
} from "@/lib/design-scene/design-brief-schema";
import {
  assertOpenAiStrictJsonSchema,
  createDesignBriefResponseFormat,
  getDesignBriefJsonSchema,
} from "@/lib/design-scene/schema";

const validBrief = {
  category: "logo",
  tone: "modern",
  hierarchy: "symbol then wordmark",
  layout: "centered",
  typography: "sans wordmark",
  paletteNotes: "black and white",
  requiredObjects: ["symbol", "wordmark"],
  spacingRhythm: [4, 8, 12, 16, 24, 32],
  spacingNotes: "Use the rhythm consistently.",
};

describe("DesignBriefSchema spacingRhythm", () => {
  it("accepts numeric spacingRhythm arrays", () => {
    const parsed = DesignBriefSchema.safeParse(validBrief);
    expect(parsed.success).toBe(true);
  });

  it("rejects string spacingRhythm", () => {
    const parsed = DesignBriefSchema.safeParse({
      ...validBrief,
      spacingRhythm: "4, 8, 12",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toContain("spacingRhythm");
      const summary = summarizeZodIssue(parsed.error.issues[0]!, {
        ...validBrief,
        spacingRhythm: "4, 8, 12",
      });
      expect(summary.receivedType).toBe("string");
      expect(summary.issuePath).toBe("spacingRhythm");
    }
  });

  it("rejects null spacingRhythm", () => {
    const parsed = DesignBriefSchema.safeParse({
      ...validBrief,
      spacingRhythm: null,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects missing spacingRhythm", () => {
    const rest = { ...validBrief } as Record<string, unknown>;
    delete rest.spacingRhythm;
    const parsed = DesignBriefSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
  });

  it("DesignBriefSchema and designBriefSchema are the same instance", () => {
    expect(designBriefSchema).toBe(DesignBriefSchema);
  });
});

describe("schema parity with OpenAI zodTextFormat", () => {
  it("uses the same schema for format + local parse", () => {
    const format = zodTextFormat(DesignBriefSchema, "design_brief");
    const production = createDesignBriefResponseFormat();

    expect(production.type).toBe("json_schema");
    expect(production.name).toBe("design_brief");
    expect(production.strict).toBe(true);
    expect(production.schema.type).toBe("object");
    expect(
      (production.schema.properties as Record<string, unknown>).spacingRhythm,
    ).toMatchObject({
      type: "array",
      items: { type: "number" },
    });
    expect(production.schema.required).toEqual(
      expect.arrayContaining([
        "spacingRhythm",
        "spacingNotes",
        "requiredObjects",
      ]),
    );

    // Format helper and production builder share the same Zod source.
    const fromHelper = { ...(format.schema as Record<string, unknown>) };
    delete fromHelper.$schema;
    expect(production.schema.properties).toEqual(fromHelper.properties);
    expect(production.schema.required).toEqual(fromHelper.required);

    assertOpenAiStrictJsonSchema(production.schema, "design_brief");
    expect(getDesignBriefJsonSchema()).toEqual(production.schema);

    const parsed = DesignBriefSchema.parse(validBrief);
    expect(parsed.spacingRhythm).toEqual([4, 8, 12, 16, 24, 32]);
  });

  it("preflight createDesignBriefResponseFormat succeeds", () => {
    expect(() => createDesignBriefResponseFormat()).not.toThrow();
  });
});

describe("normalizeDesignBrief", () => {
  it("dedupes and sorts spacing rhythm", () => {
    const normalized = normalizeDesignBrief({
      ...validBrief,
      spacingRhythm: [16, 4, 4, 8, Number.NaN, -1],
    });
    expect(normalized.spacingRhythm).toEqual([4, 8, 16]);
  });
});

describe("mismatch logging helpers", () => {
  it("summarizes array vs string received types", () => {
    expect(summarizeUnknownValue([4, 8, 12])).toEqual({
      receivedType: "array",
      arrayLength: 3,
      missing: false,
    });
    expect(summarizeUnknownValue("4, 8")).toEqual({
      receivedType: "string",
      arrayLength: null,
      missing: false,
    });
  });
});
