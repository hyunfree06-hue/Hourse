import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  computeBakeCropGeometry,
  computeBakeOutputSize,
  computeBakedImagePlacement,
} from "@/lib/canvas/place-generated-image";

describe("baked generated-image crop (no clipPath)", () => {
  const target = { left: 100, top: 200, width: 66, height: 66 };

  it("computes high-res square output for square target", () => {
    const size = computeBakeOutputSize(66, 66);
    expect(size.width).toBe(1024);
    expect(size.height).toBe(1024);
  });

  it("computes cover crop geometry centered on the longer side", () => {
    const geo = computeBakeCropGeometry(2048, 1024, 66, 66, "cover");
    expect(geo.sw).toBeCloseTo(1024);
    expect(geo.sh).toBeCloseTo(1024);
    expect(geo.sx).toBeCloseTo(512);
    expect(geo.sy).toBe(0);
    expect(geo.outWidth).toBe(1024);
    expect(geo.outHeight).toBe(1024);
  });

  it("contain keeps full source inside letterboxed output", () => {
    const geo = computeBakeCropGeometry(1024, 512, 66, 66, "contain");
    expect(geo.sx).toBe(0);
    expect(geo.sy).toBe(0);
    expect(geo.sw).toBe(1024);
    expect(geo.sh).toBe(512);
    expect(geo.dw).toBeLessThanOrEqual(geo.outWidth);
    expect(geo.dh).toBeLessThanOrEqual(geo.outHeight);
  });

  it("places baked image centered on the AI region with finite scales", () => {
    const placement = computeBakedImagePlacement(1024, 1024, target);
    expect(placement.originX).toBe("center");
    expect(placement.originY).toBe("center");
    expect(placement.left).toBe(133);
    expect(placement.top).toBe(233);
    expect(placement.scaleX).toBeCloseTo(66 / 1024);
    expect(placement.scaleY).toBeCloseTo(66 / 1024);
    expect(Number.isFinite(placement.scaleX)).toBe(true);
  });

  it("moving away from original region does not depend on a fixed clip", () => {
    const placement = computeBakedImagePlacement(1024, 1024, target);
    const moved = { ...placement, left: placement.left + 200, top: placement.top + 150 };
    // Visibility is inherent to the bitmap — no canvas-fixed clip coordinates exist.
    expect(moved.left).not.toBe(placement.left);
    expect(placement.scaleX * 1024).toBeCloseTo(target.width);
  });
});

describe("insertion contracts — baked crop, no clipPath", () => {
  it("place-generated-image module no longer creates clipPath helpers for insertion", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.join(process.cwd(), "src/lib/canvas/place-generated-image.ts"),
      "utf8",
    );
    expect(source).toContain("bakeGeneratedImageToBlob");
    expect(source).toContain("migrateClippedGeneratedImages");
    expect(source).not.toContain("createGeneratedImageClipPath");
    expect(source).not.toContain("absolutePositioned: true");
  });

  it("design panel inserts editable scenes without clipPath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const panel = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/ai/ai-panel.tsx"),
      "utf8",
    );
    expect(panel).toContain("insertDesignSceneToCanvas");
    expect(panel).not.toContain("absolutePositioned");
    expect(panel).not.toContain("createGeneratedImageClipPath");
    expect(panel).not.toContain("applyGeneratedImagePlacement");
  });

  it("canvas load migrates legacy clipped generated objects", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const canvas = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/canvas/fabric-canvas.tsx"),
      "utf8",
    );
    expect(canvas).toContain("migrateClippedGeneratedImages");
    expect(canvas).toContain("excludeFromExport: true");
  });
});

describe("bakeGeneratedImageToBlob (jsdom canvas)", () => {
  beforeEach(() => {
    class FakeCanvas {
      width = 0;
      height = 0;
      getContext() {
        return {
          clearRect: vi.fn(),
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          fillStyle: "",
        };
      }
      toBlob(cb: (b: Blob | null) => void) {
        cb(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
      }
    }
    vi.stubGlobal(
      "document",
      {
        createElement: (tag: string) => {
          if (tag === "canvas") return new FakeCanvas();
          return {};
        },
      } as unknown as Document,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a PNG blob using cover geometry", async () => {
    const { bakeGeneratedImageToBlob } = await import(
      "@/lib/canvas/place-generated-image"
    );
    const source = {
      naturalWidth: 1024,
      naturalHeight: 1024,
      width: 1024,
      height: 1024,
    };

    const result = await bakeGeneratedImageToBlob(
      source,
      { width: 66, height: 66 },
      "cover",
    );
    expect(result.blob.type).toBe("image/png");
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
    expect(result.geometry.sw).toBe(1024);
  });
});
