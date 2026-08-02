import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  clampZoom,
  fitAllObjectsInView,
  getContentBounds,
  isBoundsFullyVisible,
  isViewportMetaObject,
  revealObjectsInView,
  unionBounds,
  wheelPanDelta,
} from "@/lib/canvas/viewport";
import {
  clearStoredViewport,
  loadStoredViewport,
  saveStoredViewport,
} from "@/lib/canvas/viewport-storage";
import { scaleSceneToRegion } from "@/lib/design-scene/scene-to-fabric";
import {
  DESIGN_PROMPT_WARN_LENGTH,
  MAX_DESIGN_PROMPT_LENGTH,
} from "@/config/prompt";
import { editorConfig } from "@/config/editor";
import { designPromptSchema } from "@/lib/validation/schemas";
import type { EditableDesignScene } from "@/lib/design-scene/schema";

function mockCanvas(opts?: {
  width?: number;
  height?: number;
  zoom?: number;
  vpt?: number[];
  objects?: Array<Record<string, unknown>>;
  active?: Array<Record<string, unknown>>;
}) {
  let zoom = opts?.zoom ?? 1;
  let vpt = [...(opts?.vpt ?? [1, 0, 0, 1, 0, 0])];
  const objects = opts?.objects ?? [];
  const active = opts?.active ?? [];
  const canvas = {
    getWidth: () => opts?.width ?? 800,
    getHeight: () => opts?.height ?? 600,
    getZoom: () => zoom,
    viewportTransform: vpt,
    setViewportTransform: (next: number[]) => {
      vpt = [...next];
      (canvas as { viewportTransform: number[] }).viewportTransform = vpt;
      zoom = next[0] ?? 1;
    },
    relativePan: vi.fn(),
    zoomToPoint: vi.fn((_p: unknown, z: number) => {
      zoom = z;
    }),
    requestRenderAll: vi.fn(),
    getObjects: () => objects,
    getActiveObjects: () => active,
  };
  return canvas;
}

function mockObject(partial: Record<string, unknown>) {
  return {
    visible: true,
    setCoords: vi.fn(),
    getBoundingRect: () => ({
      left: (partial.left as number) ?? 0,
      top: (partial.top as number) ?? 0,
      width: (partial.width as number) ?? 10,
      height: (partial.height as number) ?? 10,
    }),
    ...partial,
  };
}

describe("zoom clamp", () => {
  it("clamps between 5% and 800%", () => {
    expect(editorConfig.minZoom).toBe(0.05);
    expect(editorConfig.maxZoom).toBe(8);
    expect(clampZoom(0)).toBe(0.05);
    expect(clampZoom(-1)).toBe(0.05);
    expect(clampZoom(Number.NaN)).toBe(0.05);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(0.05);
    expect(clampZoom(12)).toBe(8);
    expect(clampZoom(1)).toBe(1);
  });
});

describe("wheel pan deltas", () => {
  it("pans vertically with mouse wheel", () => {
    const delta = wheelPanDelta({
      deltaX: 0,
      deltaY: 40,
      shiftKey: false,
      deltaMode: 0,
    } as WheelEvent);
    expect(delta).toEqual({ dx: 0, dy: -40 });
  });

  it("maps Shift+wheel to horizontal pan", () => {
    const delta = wheelPanDelta({
      deltaX: 0,
      deltaY: 40,
      shiftKey: true,
      deltaMode: 0,
    } as WheelEvent);
    expect(delta).toEqual({ dx: -40, dy: 0 });
  });

  it("supports trackpad two-axis pan", () => {
    const delta = wheelPanDelta({
      deltaX: 12,
      deltaY: 24,
      shiftKey: false,
      deltaMode: 0,
    } as WheelEvent);
    expect(delta).toEqual({ dx: -12, dy: -24 });
  });
});

describe("fit all exclusions", () => {
  it("excludes temporary AI regions and artboards from Fit all", () => {
    const ai = mockObject({
      objectRole: "ai-region",
      left: 0,
      top: 0,
      width: 9000,
      height: 9000,
      excludeFromExport: true,
      isTemporary: true,
    });
    const artboard = mockObject({
      objectRole: "artboard",
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      excludeFromExport: true,
    });
    const design = mockObject({
      objectRole: "design",
      left: 100,
      top: 50,
      width: 200,
      height: 100,
    });
    expect(isViewportMetaObject(ai as never)).toBe(true);
    expect(isViewportMetaObject(artboard as never)).toBe(true);
    expect(isViewportMetaObject(design as never)).toBe(false);

    const canvas = mockCanvas({ objects: [ai, artboard, design] });
    const bounds = getContentBounds(canvas as never);
    expect(bounds).toEqual({ left: 100, top: 50, width: 200, height: 100 });
  });

  it("Fit all resets viewport when no project objects exist", () => {
    const canvas = mockCanvas({
      objects: [
        mockObject({
          objectRole: "artboard",
          excludeFromExport: true,
          width: 1920,
          height: 1080,
        }),
      ],
      zoom: 2,
      vpt: [2, 0, 0, 2, 40, 40],
    });
    const zoom = fitAllObjectsInView(canvas as never);
    expect(zoom).toBe(1);
    expect(canvas.viewportTransform).toEqual([1, 0, 0, 1, 0, 0]);
  });
});

describe("reveal generated design", () => {
  it("does not move camera when result already fits", () => {
    const obj = mockObject({ left: 200, top: 150, width: 40, height: 40 });
    const canvas = mockCanvas({
      width: 800,
      height: 600,
      zoom: 1,
      vpt: [1, 0, 0, 1, 0, 0],
    });
    const before = [...canvas.viewportTransform];
    const zoom = revealObjectsInView(canvas as never, [obj as never], 64);
    expect(zoom).toBe(1);
    expect(canvas.viewportTransform).toEqual(before);
  });

  it("pans off-screen objects into view without extreme zoom-in", () => {
    const obj = mockObject({ left: 2000, top: 1500, width: 100, height: 80 });
    const canvas = mockCanvas({
      width: 800,
      height: 600,
      zoom: 1,
      vpt: [1, 0, 0, 1, 0, 0],
    });
    expect(
      isBoundsFullyVisible(canvas as never, {
        left: 2000,
        top: 1500,
        width: 100,
        height: 80,
      }),
    ).toBe(false);
    const zoom = revealObjectsInView(canvas as never, [obj as never], 64);
    expect(zoom).toBe(1);
    expect(canvas.viewportTransform[4]).not.toBe(0);
    expect(canvas.viewportTransform[5]).not.toBe(0);
  });
});

describe("scaleSceneToRegion", () => {
  const scene = {
    version: "1",
    canvas: { width: 1000, height: 500, background: "#fff" },
    objects: [],
  } as unknown as EditableDesignScene;

  it("uniformly scales oversized scenes into the region with ~6% padding", () => {
    const fit = scaleSceneToRegion(scene, {
      left: 100,
      top: 50,
      width: 400,
      height: 300,
    });
    expect(fit.scaleX).toBe(fit.scaleY);
    expect(fit.scaleX).toBeLessThan(1);
    const paddedW = 400 * 0.88;
    const paddedH = 300 * 0.88;
    expect(fit.scaleX).toBeCloseTo(Math.min(paddedW / 1000, paddedH / 500), 5);
    const scaledW = 1000 * fit.scaleX;
    const scaledH = 500 * fit.scaleY;
    expect(fit.offsetLeft).toBeCloseTo(100 + (400 - scaledW) / 2, 5);
    expect(fit.offsetTop).toBeCloseTo(50 + (300 - scaledH) / 2, 5);
  });

  it("preserves aspect ratio (no independent stretch)", () => {
    const fit = scaleSceneToRegion(scene, {
      left: 0,
      top: 0,
      width: 800,
      height: 200,
    });
    expect(fit.scaleX).toBe(fit.scaleY);
  });

  it("does not upscale scenes smaller than the region", () => {
    const tiny = {
      ...scene,
      canvas: { width: 100, height: 50, background: "#fff" },
    } as unknown as EditableDesignScene;
    const fit = scaleSceneToRegion(tiny, {
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    });
    expect(fit.scaleX).toBe(1);
    expect(fit.scaleY).toBe(1);
    expect(fit.offsetLeft).toBeCloseTo((800 - 100) / 2, 5);
    expect(fit.offsetTop).toBeCloseTo((600 - 50) / 2, 5);
  });
});

describe("viewport localStorage", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    clearStoredViewport("proj-test");
  });
  afterEach(() => {
    clearStoredViewport("proj-test");
    vi.unstubAllGlobals();
  });

  it("stores and restores validated viewport transforms", () => {
    saveStoredViewport("proj-test", {
      zoom: 1.5,
      viewportTransform: [1.5, 0, 0, 1.5, 20, 40],
    });
    const loaded = loadStoredViewport("proj-test");
    expect(loaded?.zoom).toBe(1.5);
    expect(loaded?.viewportTransform[4]).toBe(20);
  });

  it("rejects invalid stored viewport data", () => {
    localStorage.setItem(
      `${editorConfig.viewportStoragePrefix}proj-test`,
      JSON.stringify({ zoom: Number.NaN, viewportTransform: [0, 0, 0, 0, 0, 0] }),
    );
    expect(loadStoredViewport("proj-test")).toBeNull();
  });
});

describe("prompt limit", () => {
  it("uses shared 8,000 character constant everywhere", async () => {
    expect(MAX_DESIGN_PROMPT_LENGTH).toBe(8000);
    expect(editorConfig.promptMaxLength).toBe(8000);
    expect(DESIGN_PROMPT_WARN_LENGTH).toBe(7200);

    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const panel = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/ai/ai-panel.tsx"),
      "utf8",
    );
    const schema = await fs.readFile(
      path.join(process.cwd(), "src/lib/validation/schemas.ts"),
      "utf8",
    );
    expect(panel).toContain("MAX_DESIGN_PROMPT_LENGTH");
    expect(panel).toContain("metaKey");
    expect(panel).toContain("Show last completed design");
    expect(schema).toContain("MAX_DESIGN_PROMPT_LENGTH");
    expect(panel).not.toMatch(/maxLength=\{2000\}/);
    expect(panel).not.toMatch(/maxLength=\{1000\}/);
    expect(panel).not.toMatch(/maxLength=\{1500\}/);
    expect(panel).not.toMatch(/maxLength=\{4000\}/);
  });

  it("accepts prompts up to 8,000 characters and preserves newlines", () => {
    const prompt = `Line one\nLine two\n${"a".repeat(7980)}`;
    expect(prompt.length).toBeLessThanOrEqual(8000);
    const parsed = designPromptSchema.safeParse(prompt);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toContain("\n");
      expect(parsed.data.length).toBe(prompt.length);
    }
  });

  it("blocks prompts over 8,000 characters", () => {
    const prompt = "x".repeat(8001);
    const parsed = designPromptSchema.safeParse(prompt);
    expect(parsed.success).toBe(false);
  });
});

describe("navigation contracts in fabric-canvas", () => {
  it("wires Space/middle/wheel/keyboard and blur cleanup once", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const canvas = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/canvas/fabric-canvas.tsx"),
      "utf8",
    );
    expect(canvas).toContain("spacePanRef");
    expect(canvas).toContain("button === 1");
    expect(canvas).toContain("wheelPanDelta");
    expect(canvas).toContain("zoomCanvasToPoint");
    expect(canvas).toContain("visibilitychange");
    expect(canvas).toContain('addEventListener("blur"');
    expect(canvas).toContain("clearSpacePan");
    expect(canvas).toContain("persistViewport");
    expect(canvas).toContain("loadStoredViewport");
    expect(canvas).toContain("clearSpacePan");
    expect(canvas).toContain("Viewport-only — never mark project dirty");
    expect(canvas).toContain("fitAllObjectsInView");
    expect(canvas).toContain("fitSelectionInView");
    expect(canvas).toContain("resetViewport");
  });

  it("does not duplicate window listeners outside the projectId effect cleanup", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/canvas/fabric-canvas.tsx"),
      "utf8",
    );
    const keydownAdds = source.match(/addEventListener\("keydown"/g) ?? [];
    const keydownRemoves = source.match(/removeEventListener\("keydown"/g) ?? [];
    expect(keydownAdds.length).toBe(1);
    expect(keydownRemoves.length).toBe(1);
  });
});

describe("union bounds", () => {
  it("unions object bounds for Fit selection", () => {
    expect(
      unionBounds([
        { left: 0, top: 0, width: 100, height: 50 },
        { left: 80, top: 40, width: 40, height: 40 },
      ]),
    ).toEqual({ left: 0, top: 0, width: 120, height: 80 });
  });
});
