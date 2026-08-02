import { describe, expect, it } from "vitest";
import {
  assertDesignRegionSize,
  isDesignRegionLargeEnough,
  MIN_DESIGN_HEIGHT,
  MIN_DESIGN_WIDTH,
} from "@/lib/design-scene/region";
import {
  DesignGenerationError,
  httpStatusForDesignError,
  withCreditsRestoredMessage,
} from "@/lib/design-scene/errors";
import { normalizeDesignSceneWithDiagnostics } from "@/lib/design-scene/normalize-diagnostics";
import {
  assertNormalGenerationOperations,
} from "@/lib/design-scene/design-generation";
import type { EditableDesignScene, DesignOperation } from "@/lib/design-scene/schema";
import { getEditableSelection, isEditableDesignObject } from "@/lib/canvas/editable-selection";

function sampleScene(objects: EditableDesignScene["objects"]): EditableDesignScene {
  return {
    version: 1,
    title: "Test",
    canvas: { width: 800, height: 600, background: "#ffffff" },
    palette: {
      primary: "#111111",
      secondary: "#666666",
      accent: "#2563eb",
      background: "#ffffff",
      text: "#111111",
    },
    objects,
  };
}

describe("design region size gate", () => {
  it("rejects 66×66 before credit consumption", () => {
    expect(isDesignRegionLargeEnough(66, 66)).toBe(false);
    expect(() => assertDesignRegionSize(66, 66)).toThrow(DesignGenerationError);
    try {
      assertDesignRegionSize(66, 66);
    } catch (error) {
      expect(error).toMatchObject({
        code: "DESIGN_REGION_TOO_SMALL",
        status: 400,
      });
    }
  });

  it("accepts minimum valid region", () => {
    expect(
      isDesignRegionLargeEnough(MIN_DESIGN_WIDTH, MIN_DESIGN_HEIGHT),
    ).toBe(true);
    expect(() =>
      assertDesignRegionSize(MIN_DESIGN_WIDTH, MIN_DESIGN_HEIGHT),
    ).not.toThrow();
  });
});

describe("design generation error classification", () => {
  it("maps provider refusal/incomplete to 502", () => {
    expect(httpStatusForDesignError("DESIGN_PROVIDER_REFUSED")).toBe(502);
    expect(httpStatusForDesignError("DESIGN_PROVIDER_INCOMPLETE")).toBe(502);
    expect(httpStatusForDesignError("DESIGN_OUTPUT_PARSE_FAILED")).toBe(502);
  });

  it("maps scene invalid to 422", () => {
    expect(httpStatusForDesignError("DESIGN_SCENE_INVALID")).toBe(422);
    expect(httpStatusForDesignError("DESIGN_OPERATIONS_EMPTY")).toBe(422);
  });

  it("only claims restored credits when refunded is true", () => {
    expect(withCreditsRestoredMessage("The design could not be prepared.", false)).toBe(
      "The design could not be prepared.",
    );
    expect(withCreditsRestoredMessage("The design could not be prepared.", true)).toBe(
      "The design could not be prepared. Your credits were restored.",
    );
  });
});

describe("normalization diagnostics", () => {
  it("returns DESIGN_SCENE_INVALID when all objects are rejected", () => {
    try {
      normalizeDesignSceneWithDiagnostics(
        sampleScene([
          {
            id: "bad",
            name: "Bad",
            type: "rect",
            left: Number.NaN,
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
          },
        ]),
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DesignGenerationError);
      expect((error as DesignGenerationError).code).toBe("DESIGN_SCENE_INVALID");
      expect((error as DesignGenerationError).internalReason).toBe(
        "ALL_GENERATED_OBJECTS_REJECTED",
      );
    }
  });

  it("keeps one valid create object", () => {
    const result = normalizeDesignSceneWithDiagnostics(
      sampleScene([
        {
          id: "ok",
          name: "Ok",
          type: "rect",
          left: 10,
          top: 10,
          width: 100,
          height: 80,
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
        },
      ]),
    );
    expect(result.validObjectCount).toBe(1);
    expect(result.rejectedObjectCount).toBe(0);
  });
});

describe("normal generation operations", () => {
  it("rejects update-only operation sets", () => {
    const ops: DesignOperation[] = [
      {
        type: "update",
        objectId: "x",
        changes: {
          name: null,
          left: 1,
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
          fill: null,
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
        },
      },
    ];
    expect(() =>
      assertNormalGenerationOperations(ops, { requestId: "r1" }),
    ).toThrow(DesignGenerationError);
  });

  it("accepts at least one create operation", () => {
    const ops: DesignOperation[] = [
      {
        type: "create",
        object: {
          id: "c1",
          name: "Rect",
          type: "rect",
          left: 0,
          top: 0,
          width: 40,
          height: 40,
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
        },
      },
    ];
    expect(() =>
      assertNormalGenerationOperations(ops, { requestId: "r1" }),
    ).not.toThrow();
  });
});

describe("AI region vs refinement", () => {
  it("temporary AI region does not trigger refinement", () => {
    const region = {
      objectId: "r1",
      objectRole: "ai-region",
      excludeFromExport: true,
      name: "AI region",
      sourceType: "ai-region",
      get(key: string) {
        return (this as Record<string, unknown>)[key];
      },
    };
    expect(isEditableDesignObject(region as never)).toBe(false);
    expect(
      getEditableSelection({
        getActiveObjects: () => [region as never],
      }),
    ).toHaveLength(0);
  });
});

describe("route contracts for design failure + refund", () => {
  it("rejects small design regions before credit consumption", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const route = await fs.readFile(
      path.join(process.cwd(), "src/app/api/ai/generations/route.ts"),
      "utf8",
    );
    const post = route.slice(route.indexOf("export async function POST"));
    const assertAt = post.indexOf("assertDesignRegionSize");
    const creditAt = post.indexOf("consumeCreditsAtomic");
    expect(assertAt).toBeGreaterThan(0);
    expect(creditAt).toBeGreaterThan(assertAt);
    expect(route).toContain("assertDesignRegionSize");
    expect(route).toContain("refunded");
    expect(route).toContain("creditBalance");
    expect(route).toContain("refund_failed");
  });

  it("UI never claims refund unless refunded === true", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const panel = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/ai/ai-panel.tsx"),
      "utf8",
    );
    expect(panel).toContain("refunded: data.refunded === true");
    expect(panel).toContain("refunded === true");
    expect(panel).toContain("DESIGN_REGION_TOO_SMALL");
    expect(panel).toContain("isDesignRegionLargeEnough");
    expect(panel).toContain("Generate design");
  });

  it("409 project save conflict is independent from Design generation", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const autosave = await fs.readFile(
      path.join(process.cwd(), "src/hooks/use-autosave.ts"),
      "utf8",
    );
    expect(autosave).toContain("Never treat this as a Design insertion failure");
    expect(autosave).toContain("saveChainRef");
    expect(autosave).toContain("retry once");
  });
});
