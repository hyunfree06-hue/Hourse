import { describe, expect, it, vi } from "vitest";
import {
  getEditableSelection,
  isEditableDesignObject,
} from "@/lib/canvas/editable-selection";
import {
  DesignApplyError,
  applyDesignOperationsToCanvas,
  mapPolygonPointsSafe,
} from "@/lib/design-scene/apply-operations";
import { filterEditableRefinementObjects } from "@/lib/design-scene/refinement-selection";

function fakeObject(props: Record<string, unknown>) {
  const store = { ...props };
  return {
    ...store,
    type: props.type ?? "rect",
    get(key: string) {
      return store[key];
    },
    set(patch: Record<string, unknown>) {
      Object.assign(store, patch);
      Object.assign(this, patch);
    },
    setCoords: vi.fn(),
    getScaledWidth: () => Number(store.width ?? 10),
    getScaledHeight: () => Number(store.height ?? 10),
    left: Number(store.left ?? 0),
    top: Number(store.top ?? 0),
  };
}

describe("editable selection classification", () => {
  it("excludes AI region from editable selection", () => {
    const region = fakeObject({
      objectId: "region-1",
      objectRole: "ai-region",
      excludeFromExport: true,
      name: "AI region",
      sourceType: "ai-region",
    });
    expect(isEditableDesignObject(region as never)).toBe(false);

    const design = fakeObject({
      objectId: "obj-1",
      objectRole: "design",
      sourceType: "ai-design",
      name: "Korean wordmark",
    });
    expect(isEditableDesignObject(design as never)).toBe(true);
  });

  it("AI region alone is not a refinement selection", () => {
    const region = fakeObject({
      objectId: "region-1",
      objectRole: "ai-region",
      excludeFromExport: true,
      name: "AI region",
    });
    const canvas = {
      getActiveObjects: () => [region as never],
      getActiveObject: () => region as never,
    };
    expect(getEditableSelection(canvas)).toHaveLength(0);
  });

  it("real selected object counts as refinement", () => {
    const design = fakeObject({
      objectId: "obj-1",
      objectRole: "design",
      sourceType: "ai-design",
      name: "Symbol",
    });
    const canvas = {
      getActiveObjects: () => [design as never],
    };
    expect(getEditableSelection(canvas)).toHaveLength(1);
  });
});

describe("server refinement selection filter", () => {
  it("rejects AI region payloads before credit consumption", () => {
    const filtered = filterEditableRefinementObjects(
      [
        {
          id: "region-1",
          name: "AI region",
          objectRole: "ai-region",
          type: "rect",
        },
      ],
      ["region-1"],
    );
    expect(filtered.ids).toEqual([]);
    expect(filtered.objects).toEqual([]);
  });

  it("keeps real editable objects", () => {
    const filtered = filterEditableRefinementObjects(
      [
        {
          id: "obj-1",
          name: "Korean wordmark",
          type: "text",
          sourceType: "ai-design",
        },
      ],
      ["obj-1"],
    );
    expect(filtered.ids).toEqual(["obj-1"]);
  });
});

describe("polygon point safety (t.x crash guard)", () => {
  it("filters null points instead of reading .x on null", () => {
    const points = mapPolygonPointsSafe(
      [{ x: 1, y: 2 }, null, undefined, { x: 3, y: 4 }, { x: 5, y: 6 }],
      2,
      2,
    );
    expect(points).toEqual([
      { x: 2, y: 4 },
      { x: 6, y: 8 },
      { x: 10, y: 12 },
    ]);
  });
});

describe("apply operations safety", () => {
  it("missing update target does not dereference null", async () => {
    const canvas = {
      getObjects: () => [],
      add: vi.fn(),
      remove: vi.fn(),
      moveObjectTo: vi.fn(),
      setActiveObject: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };

    await expect(
      applyDesignOperationsToCanvas(
        canvas as never,
        [
          {
            type: "update",
            objectId: "missing",
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
        ],
        { generationId: "g1" },
      ),
    ).rejects.toMatchObject({ code: "UPDATE_TARGET_NOT_FOUND" });
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
  });

  it("zero created objects discards selection instead of ActiveSelection([])", async () => {
    const canvas = {
      getObjects: () => [],
      add: vi.fn(),
      remove: vi.fn(),
      moveObjectTo: vi.fn(),
      setActiveObject: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };

    // Image create is skipped → zero created fabric objects
    await applyDesignOperationsToCanvas(
      canvas as never,
      [
        {
          type: "create",
          object: {
            id: "img-1",
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
            prompt: "product",
            fit: "cover",
            cornerRadius: 0,
            assetId: null,
          },
        },
      ],
      { generationId: "g1" },
    );

    expect(canvas.discardActiveObject).toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
  });

  it("rejects invalid create geometry", async () => {
    const canvas = {
      getObjects: () => [],
      add: vi.fn(),
      remove: vi.fn(),
      setActiveObject: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    await expect(
      applyDesignOperationsToCanvas(
        canvas as never,
        [
          {
            type: "create",
            object: {
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
              fill: "#fff",
              stroke: null,
              strokeWidth: 0,
              cornerRadius: 0,
            },
          },
        ],
        { generationId: "g1" },
      ),
    ).rejects.toBeInstanceOf(DesignApplyError);
  });
});

describe("UI contracts for selection + retry", () => {
  it("AI panel uses shared editable selection and retry apply", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const panel = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/ai/ai-panel.tsx"),
      "utf8",
    );
    expect(panel).toContain("getEditableSelection");
    expect(panel).toContain("Generate design");
    expect(panel).toContain("Refine selection");
    expect(panel).toContain("Retry adding design");
    expect(panel).toContain(
      "The design was created, but we couldn't add it to the canvas.",
    );
    expect(panel).toMatch(/safeMessage/);
    // Retry loads completed generation — no new POST generations
    const retryFn = panel.slice(
      panel.indexOf("async function retryApplyToCanvas"),
      panel.indexOf("async function handleGenerate"),
    );
    expect(retryFn).toContain(
      "`/api/ai/generations/${pendingApply.generationId}`",
    );
    expect(retryFn).not.toContain('method: "POST"');
  });

  it("route rejects invalid refinement before credits", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const route = await fs.readFile(
      path.join(process.cwd(), "src/app/api/ai/generations/route.ts"),
      "utf8",
    );
    const body = route.slice(route.indexOf("export async function POST"));
    const invalidAt = body.indexOf("INVALID_REFINEMENT_SELECTION");
    const creditAt = body.indexOf("consumeCreditsAtomic");
    expect(invalidAt).toBeGreaterThan(0);
    expect(creditAt).toBeGreaterThan(invalidAt);
  });
});
