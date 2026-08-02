import { describe, expect, it } from "vitest";
import {
  EditableDesignSceneSchema,
  MIN_FONT_SIZE,
  editableDesignSceneSchema,
  type EditableDesignScene,
} from "@/lib/design-scene/schema";
import { createDesignResponseFormat } from "@/lib/design-scene/design-response-formats";
import {
  summarizeFirstSceneZodIssue,
  validateDesignScene,
} from "@/lib/design-scene/validate-scene";
import {
  preNormalizeSceneRaw,
  sceneIssuesAreOnlyRecoverableNumeric,
} from "@/lib/design-scene/pre-normalize-scene";

function baseScene(
  objects: EditableDesignScene["objects"],
): EditableDesignScene {
  return {
    version: 1,
    title: "Logo",
    canvas: { width: 800, height: 400, background: "#ffffff" },
    palette: {
      primary: "#111111",
      secondary: "#666666",
      accent: "#0f766e",
      background: "#ffffff",
      text: "#111111",
    },
    objects,
  };
}

function textObject(fontSize: number): EditableDesignScene["objects"][number] {
  return {
    id: "wordmark",
    name: "Wordmark",
    type: "text",
    left: 120,
    top: 160,
    width: 240,
    height: 48,
    angle: 0,
    opacity: 1,
    visible: true,
    locked: false,
    layerIndex: 1,
    parentId: null,
    semanticRole: "wordmark",
    text: "Hourse",
    fontFamily: "Inter",
    fontSize,
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
  };
}

function symbolObject(): EditableDesignScene["objects"][number] {
  return {
    id: "symbol",
    name: "Symbol",
    type: "path",
    left: 40,
    top: 140,
    width: 64,
    height: 64,
    angle: 0,
    opacity: 1,
    visible: true,
    locked: false,
    layerIndex: 0,
    parentId: null,
    semanticRole: "symbol",
    pathData: "M8 8 H56 V56 H8 Z",
    fill: "#0f766e",
    stroke: null,
    strokeWidth: 0,
    strokeLineCap: "round",
    strokeLineJoin: "round",
  };
}

describe("scene schema identity", () => {
  it("uses the same canonical schema for provider and local validation", () => {
    expect(EditableDesignSceneSchema).toBe(editableDesignSceneSchema);
    const { scene } = createDesignResponseFormat();
    const encoded = JSON.stringify(scene.schema);
    expect(encoded).toMatch(/"fontSize":\{[^}]*"minimum":8/);
    expect(encoded).not.toMatch(/"strokeWidth":\{[^}]*"minimum":8/);
  });
});

describe("fontSize min(8) failure diagnostics", () => {
  it("logs the exact failing Zod path and received numeric value", () => {
    const raw = baseScene([symbolObject(), textObject(6)]);
    const parsed = EditableDesignSceneSchema.safeParse(raw);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const first = parsed.error.issues[0];
    const summary = summarizeFirstSceneZodIssue(first, raw);
    expect(summary.path).toBe("objects.1.fontSize");
    expect(summary.code).toBe("too_small");
    expect(summary.minimum).toBe(MIN_FONT_SIZE);
    expect(summary.receivedType).toBe("number");
    expect(summary.receivedValue).toBe(6);
    expect(sceneIssuesAreOnlyRecoverableNumeric(parsed.error.issues)).toBe(
      true,
    );
  });
});

describe("pre-normalize scene numerics", () => {
  it("normalizes fontSize below 8 up to 8 without touching strokeWidth", () => {
    const pathObj = { ...symbolObject(), strokeWidth: 2 };
    const raw = baseScene([pathObj, textObject(6)]);
    const { value, repairs } = preNormalizeSceneRaw(raw);
    expect(repairs).toEqual([
      {
        fieldPath: "objects.1.fontSize",
        originalValue: 6,
        normalizedValue: 8,
      },
    ]);
    const objects = (value as EditableDesignScene).objects;
    expect(objects[1]).toMatchObject({ type: "text", fontSize: 8 });
    expect(objects[0]).toMatchObject({ strokeWidth: 2 });
    expect(validateDesignScene(value).objects[1]).toMatchObject({
      fontSize: 8,
    });
  });

  it("does not force strokeWidth below 8 up to 8", () => {
    const pathObj = { ...symbolObject(), strokeWidth: 2 };
    const raw = baseScene([pathObj, textObject(24)]);
    const { repairs } = preNormalizeSceneRaw(raw);
    expect(repairs).toEqual([]);
    expect(validateDesignScene(raw).objects[0]).toMatchObject({
      strokeWidth: 2,
    });
  });

  it("rejects zero or non-finite dimensions", () => {
    expect(() =>
      validateDesignScene(
        baseScene([
          {
            ...symbolObject(),
            width: 0,
          },
          textObject(24),
        ]),
      ),
    ).toThrow();
    expect(() =>
      validateDesignScene(
        baseScene([
          {
            ...symbolObject(),
            width: Number.NaN,
          },
          textObject(24),
        ]),
      ),
    ).toThrow();
  });

  it("repairs non-positive finite dimensions while preserving center", () => {
    const raw = baseScene([
      {
        ...symbolObject(),
        left: 100,
        width: 0,
      },
      textObject(24),
    ]);
    const { value, repairs } = preNormalizeSceneRaw(raw);
    expect(repairs.some((r) => r.fieldPath === "objects.0.width")).toBe(true);
    const repaired = (value as EditableDesignScene).objects[0];
    expect(repaired.width).toBe(1);
    expect(Number.isFinite(repaired.left)).toBe(true);
  });
});

describe("logo layer quality", () => {
  it("keeps separate symbol and wordmark layers", () => {
    const scene = validateDesignScene(
      baseScene([symbolObject(), textObject(32)]),
    );
    const roles = scene.objects.map((o) => o.semanticRole);
    expect(roles).toContain("symbol");
    expect(roles).toContain("wordmark");
    expect(scene.objects.some((o) => o.type === "path")).toBe(true);
    expect(scene.objects.some((o) => o.type === "text")).toBe(true);
  });
});

describe("scene retry and reveal contracts", () => {
  it("wires one zero-credit scene retry for recoverable numeric failures", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.join(process.cwd(), "src/lib/design-scene/design-generation.ts"),
      "utf8",
    );
    expect(source).toContain("sceneRetry");
    expect(source).toContain("SCENE_RECOVERABLE_NUMERIC_VALIDATION_FAILED");
    expect(source).toContain("zero credits");
    expect(source).toContain("generationId: ctx.generationId");
    expect(source).toContain("preNormalizeSceneRaw");
    // Only one retry wrapper — no loop
    expect(source.match(/generateSceneOnce\(/g)?.length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("Show last completed design only binds successful generations", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const panel = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/ai/ai-panel.tsx"),
      "utf8",
    );
    expect(panel).toContain("lastCompletedGenerationId");
    expect(panel).toContain("Show last completed design");
    expect(panel).toContain("setLastCompletedGenerationId(generationId)");
    expect(panel).not.toMatch(/setLastCompletedGenerationId\(gen\.id\)/);
  });

  it("refund remains after failed retry (route still refunds DESIGN_SCENE_INVALID)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const route = await fs.readFile(
      path.join(process.cwd(), "src/app/api/ai/generations/route.ts"),
      "utf8",
    );
    expect(route).toContain("failAndRefund");
    expect(route).toContain("refund_complete");
  });
});

describe("recoverable retry unit behavior", () => {
  it("fontSize repair avoids the need for a provider retry", () => {
    const raw = baseScene([symbolObject(), textObject(5)]);
    const before = EditableDesignSceneSchema.safeParse(raw);
    expect(before.success).toBe(false);
    const { value } = preNormalizeSceneRaw(raw);
    const after = EditableDesignSceneSchema.safeParse(value);
    expect(after.success).toBe(true);
  });

  it("marks only fontSize/width/height too_small as recoverable", () => {
    expect(
      sceneIssuesAreOnlyRecoverableNumeric([
        {
          code: "too_small",
          path: ["objects", 0, "fontSize"],
          minimum: 8,
        },
      ]),
    ).toBe(true);
    expect(
      sceneIssuesAreOnlyRecoverableNumeric([
        {
          code: "too_small",
          path: ["objects", 0, "strokeWidth"],
          minimum: 8,
        },
      ]),
    ).toBe(false);
  });
});
