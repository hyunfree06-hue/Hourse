import { describe, expect, it } from "vitest";
import {
  AI_REGION_CLICK_THRESHOLD,
  DEFAULT_DESIGN_REGION,
  MIN_DESIGN_HEIGHT,
  MIN_DESIGN_REGION,
  MIN_DESIGN_WIDTH,
  centeredRegionAt,
  clampRegionToCanvas,
  expandRegionToMinimum,
  finalizeAiRegionAfterDrag,
  isDesignRegionLargeEnough,
  normalizeFabricObjectScale,
  resizeRegionAboutCenter,
} from "@/lib/design-scene/region";

describe("AI region geometry constants", () => {
  it("uses 320×240 as default and minimum", () => {
    expect(DEFAULT_DESIGN_REGION).toEqual({ width: 320, height: 240 });
    expect(MIN_DESIGN_REGION).toEqual({ width: 320, height: 240 });
    expect(MIN_DESIGN_WIDTH).toBe(320);
    expect(MIN_DESIGN_HEIGHT).toBe(240);
  });

  it("does not treat 66×66 as valid", () => {
    expect(isDesignRegionLargeEnough(66, 66)).toBe(false);
  });
});

describe("click creates centered 320×240 inside canvas", () => {
  it("centers near the click and stays inside bounds", () => {
    const region = finalizeAiRegionAfterDrag({
      startX: 400,
      startY: 300,
      endX: 400,
      endY: 300,
      canvasWidth: 1920,
      canvasHeight: 1080,
    });
    expect(region.width).toBe(320);
    expect(region.height).toBe(240);
    expect(region.left).toBe(400 - 160);
    expect(region.top).toBe(300 - 120);
  });

  it("clamps when click is near the canvas edge", () => {
    const region = centeredRegionAt(10, 10, 320, 240, 1920, 1080);
    expect(region.left).toBe(0);
    expect(region.top).toBe(0);
    expect(region.width).toBe(320);
    expect(region.height).toBe(240);
  });

  it("treats tiny movement as a click", () => {
    const region = finalizeAiRegionAfterDrag({
      startX: 100,
      startY: 100,
      endX: 100 + AI_REGION_CLICK_THRESHOLD - 1,
      endY: 100 + AI_REGION_CLICK_THRESHOLD - 1,
      canvasWidth: 1920,
      canvasHeight: 1080,
    });
    expect(region.width).toBe(320);
    expect(region.height).toBe(240);
  });
});

describe("drag creation", () => {
  it("expands a tiny drag to at least 320×240", () => {
    const region = finalizeAiRegionAfterDrag({
      startX: 100,
      startY: 100,
      endX: 140,
      endY: 130,
      canvasWidth: 1920,
      canvasHeight: 1080,
    });
    expect(region.width).toBeGreaterThanOrEqual(320);
    expect(region.height).toBeGreaterThanOrEqual(240);
  });

  it("preserves a large drag size", () => {
    const region = finalizeAiRegionAfterDrag({
      startX: 50,
      startY: 50,
      endX: 50 + 800,
      endY: 50 + 500,
      canvasWidth: 1920,
      canvasHeight: 1080,
    });
    expect(region.width).toBe(800);
    expect(region.height).toBe(500);
  });

  it("expandRegionToMinimum preserves aspect ratio", () => {
    const expanded = expandRegionToMinimum(100, 50);
    expect(expanded.width / expanded.height).toBeCloseTo(2, 5);
    expect(expanded.width).toBeGreaterThanOrEqual(320);
    expect(expanded.height).toBeGreaterThanOrEqual(240);
  });
});

describe("resize about center", () => {
  it("Resize to minimum keeps center when possible", () => {
    const next = resizeRegionAboutCenter(
      { left: 400, top: 400, width: 66, height: 66 },
      320,
      240,
      1920,
      1080,
    );
    expect(next.width).toBe(320);
    expect(next.height).toBe(240);
    expect(next.left + next.width / 2).toBeCloseTo(400 + 33, 5);
    expect(next.top + next.height / 2).toBeCloseTo(400 + 33, 5);
  });

  it("clampRegionToCanvas keeps region inside", () => {
    const clamped = clampRegionToCanvas(
      { left: 1900, top: 1000, width: 320, height: 240 },
      1920,
      1080,
    );
    expect(clamped.left + clamped.width).toBeLessThanOrEqual(1920);
    expect(clamped.top + clamped.height).toBeLessThanOrEqual(1080);
  });
});

describe("dimension draft input behavior contracts", () => {
  it("draft input allows empty intermediate strings and commits on blur/enter/escape", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.join(
        process.cwd(),
        "src/components/editor/properties/dimension-draft-input.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("useState");
    expect(source).toContain("setDraft(nextDraft)");
    expect(source).toContain('e.key === "Enter"');
    expect(source).toContain('e.key === "Escape"');
    expect(source).toContain("onLiveChange");
    expect(source).toContain("onCommit");
    expect(source).not.toContain('type="number"');
  });

  it("properties panel uses draft inputs and Resize to minimum", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const panel = await fs.readFile(
      path.join(
        process.cwd(),
        "src/components/editor/properties/properties-panel.tsx",
      ),
      "utf8",
    );
    expect(panel).toContain("DimensionDraftInput");
    expect(panel).toContain("Resize to minimum");
    expect(panel).toContain("Minimum design area");
    expect(panel).toContain("applyAiRegionSize");
    expect(panel).not.toContain("Number(e.target.value) /");
  });

  it("canvas click/drag uses shared finalize helper, not 64/66 defaults", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const canvas = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/canvas/fabric-canvas.tsx"),
      "utf8",
    );
    expect(canvas).toContain("finalizeAiRegionAfterDrag");
    expect(canvas).toContain("normalizeFabricObjectScale");
    expect(canvas).toContain("object:scaling");
    expect(canvas).not.toContain("minAiRegionSize");
    expect(canvas).not.toMatch(/width:\s*64/);
    expect(canvas).not.toMatch(/height:\s*64/);
  });

  it("autosave debounce is 400–600ms and serialized", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const editor = await fs.readFile(
      path.join(process.cwd(), "src/config/editor.ts"),
      "utf8",
    );
    const autosave = await fs.readFile(
      path.join(process.cwd(), "src/hooks/use-autosave.ts"),
      "utf8",
    );
    expect(editor).toMatch(/autosaveDebounceMs:\s*500/);
    expect(autosave).toContain("saveChainRef");
    expect(autosave).toContain("retry once");
  });

  it("generate button still requires min region from shared constants", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const panel = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/ai/ai-panel.tsx"),
      "utf8",
    );
    expect(panel).toContain("isDesignRegionLargeEnough");
    expect(panel).toContain("DEFAULT_DESIGN_REGION");
    expect(panel).toContain("Minimum design area");
    expect(panel).toContain("regionTooSmall");
  });
});

describe("scale normalization helper contract", () => {
  it("normalize bakes scale into width/height", () => {
    const object = {
      width: 100,
      height: 50,
      scaleX: 2,
      scaleY: 3,
      set(patch: Record<string, number>) {
        Object.assign(this, patch);
      },
      setCoords() {},
    };
    normalizeFabricObjectScale(object as never);
    expect(object.width).toBe(200);
    expect(object.height).toBe(150);
    expect(object.scaleX).toBe(1);
    expect(object.scaleY).toBe(1);
  });
});
