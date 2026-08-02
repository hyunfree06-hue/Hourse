import { describe, expect, it } from "vitest";
import { resolveDesignFont, preferFontForText } from "@/lib/design-scene/font-registry";
import { validateDesignScene, DesignSceneValidationError } from "@/lib/design-scene/validate-scene";
import { normalizeDesignScene } from "@/lib/design-scene/normalize-scene";
import { calculateCreditCost, creditCostTable } from "@/config/credits";
import { applyDesignOperations } from "@/lib/design-scene/design-generation";
import type { EditableDesignScene } from "@/lib/design-scene/schema";

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
        height: 32,
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
        objects: [
          {
            ...sampleScene().objects[0],
            left: Number.NaN,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateDesignScene({
        ...sampleScene(),
        objects: [
          {
            ...sampleScene().objects[0],
            width: Number.POSITIVE_INFINITY,
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects negative width", () => {
    expect(() =>
      validateDesignScene({
        ...sampleScene(),
        objects: [
          {
            ...sampleScene().objects[0],
            width: -10,
          },
        ],
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
    expect(
      calculateCreditCost({
        provider: "openai",
        quality: "high",
        mode: "design",
      }),
    ).toBe(creditCostTable.design.high);
  });

  it("design cost is independent of raster provider id", () => {
    expect(
      calculateCreditCost({
        provider: "bfl",
        quality: "standard",
        mode: "design",
      }),
    ).toBe(
      calculateCreditCost({
        provider: "openai",
        quality: "standard",
        mode: "design",
      }),
    );
  });
});

describe("design operations", () => {
  it("updates and deletes selected objects only", () => {
    const scene = sampleScene();
    const next = applyDesignOperations(scene.objects, [
      { type: "update", objectId: "en", changes: { fill: "#000000" } },
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
    expect(panel).toContain("Describe the design you want to create");
    expect(panel).toContain('mode: "design"');
    expect(panel).toContain("insertDesignSceneToCanvas");
    expect(panel).not.toContain("MODE_LABELS");
    expect(panel).not.toContain("PROVIDER_LABELS");
    expect(panel).not.toContain("<option value=\"generate\">");
    expect(panel).not.toContain("createBakedGeneratedFabricImage");
  });

  it("migration adds editable_design support", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const sql = await fs.readFile(
      path.join(
        process.cwd(),
        "supabase/migrations/0005_editable_design_generations.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("'design'");
    expect(sql).toContain("editable_design");
    expect(sql).toContain("scene_graph_json");
  });
});
