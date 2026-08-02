import { describe, expect, it } from "vitest";
import { resolveDesignFont, preferFontForText } from "@/lib/design-scene/font-registry";
import { validateDesignScene, DesignSceneValidationError } from "@/lib/design-scene/validate-scene";
import { normalizeDesignScene } from "@/lib/design-scene/normalize-scene";
import { calculateCreditCost, creditCostTable } from "@/config/credits";
import { applyDesignOperations } from "@/lib/design-scene/design-generation";
import {
  assertOpenAiStrictJsonSchema,
  createDesignResponseFormat,
  editableDesignObjectSchema,
  editableDesignSceneSchema,
  type EditableDesignScene,
} from "@/lib/design-scene/schema";

function sampleScene(overrides?: Partial<EditableDesignScene>): EditableDesignScene {
  return {
    version: 1,
    title: "Brand mark",
    canvas: { width: 800, height: 600, background: "#ffffff" },
    palette: {
      primary: "#111111",
      secondary: "#666666",
      accent: "#0f766e",
      background: "#ffffff",
      text: "#111111",
    },
    objects: [
      {
        id: "bg",
        name: "Background",
        type: "rect",
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        angle: 0,
        opacity: 1,
        visible: true,
        locked: false,
        layerIndex: 0,
        parentId: null,
        semanticRole: null,
        fill: "#ffffff",
        stroke: null,
        strokeWidth: 0,
        cornerRadius: 0,
      },
      {
        id: "symbol",
        name: "Primary symbol",
        type: "path",
        left: 80,
        top: 120,
        width: 96,
        height: 96,
        angle: 0,
        opacity: 1,
        visible: true,
        locked: false,
        layerIndex: 1,
        parentId: null,
        pathData: "M10 10 H90 V90 H10 Z",
        fill: "#0f766e",
        stroke: null,
        strokeWidth: 0,
        strokeLineCap: "round",
        strokeLineJoin: "round",
        semanticRole: "symbol",
      },
      {
        id: "kr",
        name: "Korean wordmark",
        type: "text",
        left: 200,
        top: 140,
        width: 320,
        height: 48,
        angle: 0,
        opacity: 1,
        visible: true,
        locked: false,
        layerIndex: 2,
        parentId: null,
        text: "프라이머리시스템",
        fontFamily: "Noto Sans KR",
        fontSize: 36,
        fontWeight: 700,
        fontStyle: "normal",
        lineHeight: 1.2,
        letterSpacing: 0,
        textAlign: "left",
        fill: "#111111",
        stroke: null,
        strokeWidth: 0,
        underline: false,
        uppercase: false,
        semanticRole: "wordmark-ko",
      },
      {
        id: "en",
        name: "English wordmark",
        type: "text",
        left: 200,
        top: 190,
        width: 320,
        height: 48,
        angle: 0,
        opacity: 1,
        visible: true,
        locked: false,
        layerIndex: 3,
        parentId: null,
        text: "PRIMARY SYSTEM",
        fontFamily: "Inter",
        fontSize: 18,
        fontWeight: 500,
        fontStyle: "normal",
        lineHeight: 1.2,
        letterSpacing: 2,
        textAlign: "left",
        fill: "#444444",
        stroke: null,
        strokeWidth: 0,
        underline: false,
        uppercase: true,
        semanticRole: "wordmark-en",
      },
    ],
    ...overrides,
  };
}

describe("design scene validation", () => {
  it("accepts a strict valid scene", () => {
    const scene = validateDesignScene(sampleScene());
    expect(scene.objects).toHaveLength(4);
  });

  it("accepts required nullable fields", () => {
    const parsed = editableDesignObjectSchema.safeParse({
      id: "img",
      name: "Product image",
      type: "image",
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      angle: 0,
      opacity: 1,
      visible: true,
      locked: false,
      layerIndex: 0,
      parentId: null,
      semanticRole: null,
      prompt: "soft product photo",
      fit: "cover",
      cornerRadius: 0,
      assetId: null,
      stroke: null,
    });
    // image schema has no stroke — ensure nullable keys parse on a rect
    expect(
      editableDesignObjectSchema.safeParse({
        id: "r",
        name: "Accent",
        type: "rect",
        left: 0,
        top: 0,
        width: 10,
        height: 10,
        angle: 0,
        opacity: 1,
        visible: true,
        locked: false,
        layerIndex: 0,
        parentId: null,
        semanticRole: null,
        fill: "#111111",
        stroke: null,
        strokeWidth: 0,
        cornerRadius: 0,
      }).success,
    ).toBe(true);
    expect(parsed.success).toBe(true);
  });

  it("rejects omitting semanticRole / parentId / stroke / assetId", () => {
    expect(
      editableDesignObjectSchema.safeParse({
        id: "r",
        name: "Accent",
        type: "rect",
        left: 0,
        top: 0,
        width: 10,
        height: 10,
        angle: 0,
        opacity: 1,
        visible: true,
        locked: false,
        layerIndex: 0,
        // parentId omitted
        semanticRole: null,
        fill: "#111111",
        stroke: null,
        strokeWidth: 0,
        cornerRadius: 0,
      }).success,
    ).toBe(false);

    expect(
      editableDesignObjectSchema.safeParse({
        id: "r",
        name: "Accent",
        type: "rect",
        left: 0,
        top: 0,
        width: 10,
        height: 10,
        angle: 0,
        opacity: 1,
        visible: true,
        locked: false,
        layerIndex: 0,
        parentId: null,
        // semanticRole omitted
        fill: "#111111",
        stroke: null,
        strokeWidth: 0,
        cornerRadius: 0,
      }).success,
    ).toBe(false);

    expect(
      editableDesignObjectSchema.safeParse({
        id: "img",
        name: "Product image",
        type: "image",
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        angle: 0,
        opacity: 1,
        visible: true,
        locked: false,
        layerIndex: 0,
        parentId: null,
        semanticRole: null,
        prompt: "soft product photo",
        fit: "cover",
        cornerRadius: 0,
        // assetId omitted
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported object types", () => {
    expect(() =>
      validateDesignScene({
        ...sampleScene(),
        objects: [
          {
            id: "x",
            name: "Bad",
            type: "html",
            left: 0,
            top: 0,
            width: 10,
            height: 10,
            layerIndex: 0,
          },
        ],
      }),
    ).toThrow(DesignSceneValidationError);
  });

  it("rejects invalid colors", () => {
    expect(() =>
      validateDesignScene({
        ...sampleScene(),
        canvas: { width: 100, height: 100, background: "url(javascript:alert(1))" },
      }),
    ).toThrow();
  });

  it("rejects NaN and Infinity", () => {
    expect(() =>
      validateDesignScene({
        ...sampleScene(),
        objects: [{ ...sampleScene().objects[0], left: Number.NaN }],
      }),
    ).toThrow();
    expect(() =>
      validateDesignScene({
        ...sampleScene(),
        objects: [
          { ...sampleScene().objects[0], width: Number.POSITIVE_INFINITY },
        ],
      }),
    ).toThrow();
  });

  it("rejects negative width", () => {
    expect(() =>
      validateDesignScene({
        ...sampleScene(),
        objects: [{ ...sampleScene().objects[0], width: -10 }],
      }),
    ).toThrow();
  });

  it("rejects external URLs in image prompts", () => {
    expect(() =>
      validateDesignScene({
        ...sampleScene(),
        objects: [
          {
            id: "img",
            name: "Product image",
            type: "image",
            left: 0,
            top: 0,
            width: 100,
            height: 100,
            angle: 0,
            opacity: 1,
            visible: true,
            locked: false,
            layerIndex: 0,
            parentId: null,
            semanticRole: null,
            prompt: "see https://evil.example/x",
            fit: "cover",
            cornerRadius: 0,
            assetId: null,
          },
        ],
      }),
    ).toThrow(DesignSceneValidationError);
  });
});

describe("OpenAI Structured Outputs preflight", () => {
  it("createDesignResponseFormat does not throw", () => {
    expect(() => createDesignResponseFormat()).not.toThrow();
  });

  it("root schemas are objects with required properties and no optionals", () => {
    const formats = createDesignResponseFormat();
    for (const [name, format] of Object.entries(formats)) {
      expect(format.type).toBe("json_schema");
      expect(format.strict).toBe(true);
      expect(format.schema.type).toBe("object");
      expect(format.schema.anyOf).toBeUndefined();
      expect(() =>
        assertOpenAiStrictJsonSchema(format.schema, name),
      ).not.toThrow();
    }
  });

  it("scene graph JSON schema requires semanticRole as nullable", () => {
    const { scene } = createDesignResponseFormat();
    const objects = (scene.schema.properties as Record<string, unknown>)
      .objects as { items: { anyOf: Array<Record<string, unknown>> } };
    for (const branch of objects.items.anyOf) {
      const required = branch.required as string[];
      expect(required).toContain("semanticRole");
      expect(required).toContain("parentId");
      const props = branch.properties as Record<string, { type: unknown }>;
      expect(props.semanticRole.type).toEqual(["string", "null"]);
      expect(props.parentId.type).toEqual(["string", "null"]);
    }
  });
});

describe("font registry", () => {
  it("falls back unavailable fonts", () => {
    expect(resolveDesignFont("Comic Sans MS")).toBe("Inter");
    expect(resolveDesignFont("Helvetica Neue")).toBe("Inter");
    expect(resolveDesignFont("Playfair")).toBe("Playfair Display");
  });

  it("prefers Noto Sans KR for Korean text", () => {
    expect(preferFontForText("한글 로고", "Inter")).toBe("Noto Sans KR");
    expect(preferFontForText("PRIMARY", "Inter")).toBe("Inter");
  });
});

describe("normalize scene", () => {
  it("keeps Korean and English as separate editable text objects", () => {
    const normalized = normalizeDesignScene(sampleScene());
    const texts = normalized.objects.filter((o) => o.type === "text");
    expect(texts).toHaveLength(2);
    expect(texts.some((t) => t.type === "text" && t.text.includes("프라이머리"))).toBe(
      true,
    );
    expect(texts.some((t) => t.type === "text" && t.text.includes("PRIMARY"))).toBe(
      true,
    );
    expect(normalized.objects.some((o) => o.type === "path")).toBe(true);
  });

  it("replaces unavailable fonts during normalize", () => {
    const scene = sampleScene();
    const text = scene.objects.find((o) => o.id === "en");
    if (text && text.type === "text") {
      text.fontFamily = "Totally Fake Font";
    }
    const normalized = normalizeDesignScene(scene);
    const en = normalized.objects.find((o) => o.id === "en");
    expect(en && en.type === "text" ? en.fontFamily : null).toBe("Inter");
  });
});

describe("design credits", () => {
  it("charges design once from central config", () => {
    expect(
      calculateCreditCost({
        provider: "openai",
        quality: "standard",
        mode: "design",
      }),
    ).toBe(creditCostTable.design.standard);
  });
});

describe("design operations", () => {
  it("updates and deletes selected objects only", () => {
    const scene = sampleScene();
    const nullPatch = {
      name: null,
      left: null,
      top: null,
      width: null,
      height: null,
      angle: null,
      opacity: null,
      visible: null,
      locked: null,
      layerIndex: null,
      parentId: null,
      semanticRole: null,
      text: null,
      fontFamily: null,
      fontSize: null,
      fontWeight: null,
      fontStyle: null,
      lineHeight: null,
      letterSpacing: null,
      textAlign: null,
      fill: "#000000" as string | null,
      stroke: null,
      strokeWidth: null,
      underline: null,
      uppercase: null,
      cornerRadius: null,
      pathData: null,
      strokeLineCap: null,
      strokeLineJoin: null,
      prompt: null,
      fit: null,
    };
    const next = applyDesignOperations(scene.objects, [
      { type: "update", objectId: "en", changes: nullPatch },
      { type: "delete", objectId: "symbol" },
      { type: "reorder", objectId: "kr", layerIndex: 9 },
    ]);
    expect(next.find((o) => o.id === "symbol")).toBeUndefined();
    const en = next.find((o) => o.id === "en");
    expect(en && en.type === "text" ? en.fill : null).toBe("#000000");
    expect(next.find((o) => o.id === "kr")?.layerIndex).toBe(9);
  });
});

describe("design UI contracts", () => {
  it("ai panel exposes a single Design workflow without mode selector", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const panel = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/ai/ai-panel.tsx"),
      "utf8",
    );
    expect(panel).toContain("Generate design");
    expect(panel).toContain("Refine selection");
    expect(panel).toContain('mode: "design"');
    expect(panel).toMatch(/objectRole[\s\S]{0,80}ai-region/);
    expect(panel).not.toContain("MODE_LABELS");
    expect(panel).not.toContain("createBakedGeneratedFabricImage");
  });

  it("generations route preflights schema before credits", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const route = await fs.readFile(
      path.join(process.cwd(), "src/app/api/ai/generations/route.ts"),
      "utf8",
    );
    const postStart = route.indexOf("export async function POST");
    const body = route.slice(postStart);
    const preflightAt = body.indexOf("preflightDesignStructuredOutputs");
    const creditAt = body.indexOf("consumeCreditsAtomic");
    expect(preflightAt).toBeGreaterThan(0);
    expect(creditAt).toBeGreaterThan(preflightAt);
    expect(route).toContain("structured_output_schema");
    expect(route).toContain("DESIGN_SCHEMA_INVALID");
  });

  it("schema source has no optional/nullish for OpenAI fields", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.join(process.cwd(), "src/lib/design-scene/schema.ts"),
      "utf8",
    );
    const withoutComments = source
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        return !(
          t.startsWith("*") ||
          t.startsWith("//") ||
          t.startsWith("/*") ||
          t.startsWith("*/")
        );
      })
      .join("\n");
    expect(withoutComments).not.toMatch(/\.nullish\(/);
    expect(withoutComments).not.toMatch(/\.partial\(/);
    expect(withoutComments).not.toMatch(/deepPartial/);
    expect(withoutComments).not.toMatch(/:\s*z\.[^;\n]+\.optional\(/);
  });
});

describe("scene schema still validates after parse", () => {
  it("editableDesignSceneSchema accepts sample", () => {
    expect(editableDesignSceneSchema.safeParse(sampleScene()).success).toBe(true);
  });
});
