import { describe, expect, it } from "vitest";
import {
  computeGeneratedImagePlacement,
  createGeneratedImageClipPath,
  isAbsoluteClipPath,
} from "@/lib/canvas/place-generated-image";

describe("generated image placement + relative clipPath", () => {
  const target = { left: 100, top: 200, width: 66, height: 66 };

  it("places cover fit centered on the AI region with local clip sizes", () => {
    const placement = computeGeneratedImagePlacement(1024, 1024, target, "cover");
    expect(placement.originX).toBe("center");
    expect(placement.originY).toBe("center");
    expect(placement.left).toBe(100 + 33);
    expect(placement.top).toBe(200 + 33);
    expect(placement.scaleX).toBeCloseTo(66 / 1024);
    expect(placement.localClipWidth).toBeCloseTo(1024);
    expect(placement.localClipHeight).toBeCloseTo(1024);
  });

  it("cover on wide image crops width in local coords", () => {
    const placement = computeGeneratedImagePlacement(2048, 1024, target, "cover");
    // scale = max(66/2048, 66/1024) = 66/1024
    expect(placement.scaleX).toBeCloseTo(66 / 1024);
    expect(placement.localClipWidth).toBeCloseTo(1024);
    expect(placement.localClipHeight).toBeCloseTo(1024);
  });

  it("moving object + relative clip stay coupled (math invariant)", () => {
    const placement = computeGeneratedImagePlacement(1024, 1024, target, "cover");
    const movedLeft = placement.left + 200;
    const movedTop = placement.top + 200;
    // Relative clip is centered at 0,0 in object space — canvas offset does not change local clip.
    expect(placement.localClipWidth * placement.scaleX).toBeCloseTo(target.width);
    expect(placement.localClipHeight * placement.scaleY).toBeCloseTo(target.height);
    expect(movedLeft).toBe(placement.left + 200);
    expect(movedTop).toBe(placement.top + 200);
  });

  it("scaling to 200% keeps crop proportional", () => {
    const placement = computeGeneratedImagePlacement(1024, 1024, target, "cover");
    const newScale = placement.scaleX * 2;
    expect(placement.localClipWidth * newScale).toBeCloseTo(target.width * 2);
    expect(placement.localClipHeight * newScale).toBeCloseTo(target.height * 2);
  });

  it("creates relative clipPath (not absolutePositioned)", () => {
    const clip = createGeneratedImageClipPath(100, 80);
    expect(clip.absolutePositioned).toBeFalsy();
    expect(clip.originX).toBe("center");
    expect(clip.originY).toBe("center");
    expect(clip.left).toBe(0);
    expect(clip.top).toBe(0);
    expect(clip.width).toBe(100);
    expect(clip.height).toBe(80);
    expect(isAbsoluteClipPath(clip)).toBe(false);
  });

  it("rejects invalid dimensions", () => {
    expect(() =>
      computeGeneratedImagePlacement(0, 1024, target, "cover"),
    ).toThrow();
    expect(() =>
      computeGeneratedImagePlacement(1024, 1024, { ...target, width: 0 }, "contain"),
    ).toThrow();
  });
});

describe("ai-panel clip contracts", () => {
  it("does not use absolutePositioned clip or reuse AI region as clipPath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const panel = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/ai/ai-panel.tsx"),
      "utf8",
    );
    expect(panel).toContain("computeGeneratedImagePlacement");
    expect(panel).toContain("applyGeneratedImagePlacement");
    expect(panel).toContain("ai_region_removed");
    expect(panel).not.toContain("absolutePositioned: true");
    expect(panel).not.toMatch(/clipPath:\s*aiRegion/);
  });

  it("AI region is excludeFromExport", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const canvas = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/canvas/fabric-canvas.tsx"),
      "utf8",
    );
    expect(canvas).toContain('objectRole: "ai-region"');
    expect(canvas).toContain("excludeFromExport: true");
  });
});
