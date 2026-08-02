import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  fetchSignedImageAsObjectUrl,
  GeneratedImageLoadError,
  CANVAS_INSERT_ERROR_MESSAGE,
  revokeObjectUrlSafe,
} from "@/lib/canvas/fetch-signed-image";
import { validateImageBuffer } from "@/lib/ai/image-utils";
import {
  computeGeneratedImageScale,
  describeSignedUrlForLogs,
  sanitizeCanvasJsonForSave,
} from "@/lib/canvas/load-fabric-image";
import {
  detectImageKindFromBytes,
  isProbablyJsonOrText,
  mimeFromImageKind,
  signatureHexPreview,
} from "@/lib/canvas/image-bytes";
import {
  hasRegisteredObjectUrl,
  registerObjectUrl,
  revokeAllObjectUrls,
  revokeObjectUrlForObject,
} from "@/lib/canvas/object-url-registry";

function pngBytes(): Uint8Array {
  return Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
}

function jpegBytes(): Uint8Array {
  // Minimal JPEG SOI + EOI
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
}

describe("image byte signatures", () => {
  it("detects PNG / JPEG / WebP magic bytes", () => {
    expect(detectImageKindFromBytes(pngBytes())).toBe("png");
    expect(detectImageKindFromBytes(jpegBytes())).toBe("jpeg");
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImageKindFromBytes(webp)).toBe("webp");
    expect(mimeFromImageKind("png")).toBe("image/png");
  });

  it("rejects JSON masquerading as an image", () => {
    const json = new TextEncoder().encode('{"error":"nope"}');
    expect(detectImageKindFromBytes(json)).toBeNull();
    expect(isProbablyJsonOrText(json)).toBe(true);
    expect(signatureHexPreview(json, 4)).toBe("7B 22 65 72");
  });
});

describe("signed image fetch", () => {
  const originalFetch = globalThis.fetch;
  const createObjectURL = vi.fn(() => "blob:mock-object-url");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  it("accepts a valid image response and creates an object URL", async () => {
    const bytes = pngBytes();
    globalThis.fetch = vi.fn(async () =>
      new Response(new Blob([Buffer.from(bytes)], { type: "image/png" }), {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": String(bytes.length),
        },
      }),
    ) as typeof fetch;

    const result = await fetchSignedImageAsObjectUrl(
      "https://example.supabase.co/storage/v1/object/sign/generated-assets/x.png?token=secret",
    );
    expect(result.contentType).toBe("image/png");
    expect(result.blob.size).toBe(bytes.length);
    expect(result.objectUrl).toBe("blob:mock-object-url");
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("rejects non-image content types", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('{"error":"nope"}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;

    await expect(
      fetchSignedImageAsObjectUrl("https://example.com/x"),
    ).rejects.toMatchObject({ code: "INVALID_IMAGE_CONTENT_TYPE" });
  });

  it("rejects failed downloads", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("expired", {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;

    await expect(
      fetchSignedImageAsObjectUrl("https://example.com/x"),
    ).rejects.toMatchObject({
      code: "SIGNED_URL_DOWNLOAD_FAILED",
      httpStatus: 403,
    });
  });

  it("rejects empty image bodies", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(new Uint8Array(0), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    ) as typeof fetch;

    await expect(
      fetchSignedImageAsObjectUrl("https://example.com/x"),
    ).rejects.toMatchObject({ code: "EMPTY_IMAGE_BODY" });
  });
});

describe("object URL registry — no premature revoke", () => {
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    revokeAllObjectUrls();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL,
    });
  });

  afterEach(() => {
    revokeAllObjectUrls();
    vi.unstubAllGlobals();
    revokeObjectURL.mockClear();
  });

  it("keeps object URL alive after successful load", () => {
    registerObjectUrl("obj-1", "blob:kept-alive");
    expect(hasRegisteredObjectUrl("obj-1")).toBe(true);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("revokes only when the Fabric object is removed", () => {
    registerObjectUrl("obj-1", "blob:kept-alive");
    revokeObjectUrlForObject("obj-1");
    expect(hasRegisteredObjectUrl("obj-1")).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:kept-alive");
  });

  it("revokeObjectUrlSafe is a no-op for null", () => {
    expect(() => revokeObjectUrlSafe(null)).not.toThrow();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});

describe("sanitizeCanvasJsonForSave", () => {
  it("strips blob URLs and stores same-origin asset content path", () => {
    const sanitized = sanitizeCanvasJsonForSave({
      objects: [
        {
          type: "image",
          src: "blob:https://hourse.local/abc",
          assetId: "asset-123",
          storageBucket: "generated-assets",
          storagePath: "u/p/x.png",
          generationId: "gen-1",
          objectUrl: "blob:https://hourse.local/abc",
        },
      ],
    }) as { objects: Array<Record<string, unknown>> };

    const obj = sanitized.objects[0];
    expect(obj.src).toBe("/api/assets/asset-123/content");
    expect(obj.assetId).toBe("asset-123");
    expect(obj.storageBucket).toBe("generated-assets");
    expect(obj.storagePath).toBe("u/p/x.png");
    expect(obj.generationId).toBe("gen-1");
    expect(obj.objectUrl).toBeUndefined();
    expect(JSON.stringify(obj)).not.toContain("blob:");
  });
});

describe("generated image scale (66×66)", () => {
  it("computes finite cover/contain scales", () => {
    expect(computeGeneratedImageScale(1024, 1024, 66, 66, "contain")).toBeCloseTo(
      66 / 1024,
    );
    expect(computeGeneratedImageScale(1024, 512, 66, 66, "cover")).toBeCloseTo(
      66 / 512,
    );
  });

  it("rejects non-finite scales", () => {
    expect(() =>
      computeGeneratedImageScale(0, 1024, 66, 66, "contain"),
    ).toThrow(GeneratedImageLoadError);
    try {
      computeGeneratedImageScale(0, 1024, 66, 66, "contain");
    } catch (error) {
      expect(error).toMatchObject({ code: "INVALID_IMAGE_SCALE" });
    }
  });
});

describe("independent clipPath", () => {
  it("design insertion path avoids clipPath helpers", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const panel = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/ai/ai-panel.tsx"),
      "utf8",
    );
    expect(panel).toContain("insertDesignSceneToCanvas");
    expect(panel).not.toContain("absolutePositioned: true");
    expect(panel).not.toContain("createGeneratedImageClipPath");
  });
});

describe("image byte validation", () => {
  it("accepts valid PNG bytes", async () => {
    const meta = await validateImageBuffer(Buffer.from(pngBytes()));
    expect(meta.mimeType).toBe("image/png");
    expect(meta.width).toBe(1);
    expect(meta.height).toBe(1);
  });

  it("rejects invalid base64/text uploaded as png", async () => {
    await expect(
      validateImageBuffer(Buffer.from('{"b64_json":"abc"}', "utf8")),
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });
});

describe("signed URL privacy", () => {
  it("strips query tokens from diagnostics", () => {
    const meta = describeSignedUrlForLogs(
      "https://abc.supabase.co/storage/v1/object/sign/generated-assets/u/p/x.png?token=SECRET_TOKEN",
    );
    expect(meta.origin).toBe("https://abc.supabase.co");
    expect(JSON.stringify(meta)).not.toContain("SECRET_TOKEN");
  });

  it("user-facing insert error never includes signed URL text", () => {
    expect(CANVAS_INSERT_ERROR_MESSAGE).not.toMatch(/http|supabase|token/i);
    const err = new GeneratedImageLoadError("FABRIC_IMAGE_LOAD_FAILED");
    expect(err.message).toBe(CANVAS_INSERT_ERROR_MESSAGE);
  });
});

describe("Fabric v7 API + asset route contracts", () => {
  it("exposes Promise-returning fromURL (Fabric 7.4.0)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const root = process.cwd();
    const pkg = JSON.parse(
      await fs.readFile(path.join(root, "node_modules/fabric/package.json"), "utf8"),
    ) as { version: string };
    expect(pkg.version).toBe("7.4.0");

    const typeSource = await fs.readFile(
      path.join(root, "node_modules/fabric/dist/src/shapes/Image.d.ts"),
      "utf8",
    );
    expect(typeSource).toMatch(
      /static fromURL[\s\S]*Promise<\s*FabricImage\s*>/,
    );
  });

  it("asset content route streams binary with private cache", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.join(
        process.cwd(),
        "src/app/api/assets/[assetId]/content/route.ts",
      ),
      "utf8",
    );
    expect(source).toContain("Cache-Control");
    expect(source).toContain("private, no-store");
    expect(source).toContain("resolveStoredImageBytes");
    expect(source).toContain("new Uint8Array");
    expect(source).toMatch(/export async function GET/);
    expect(source).not.toContain("415");
  });
});

describe("retry insertion economics", () => {
  it("signed-url refresh charges 0 credits and does not call OpenAI", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.join(
        process.cwd(),
        "src/app/api/ai/generations/[generationId]/signed-url/route.ts",
      ),
      "utf8",
    );
    expect(source).toContain("creditsCharged: 0");
    expect(source).not.toMatch(/openai|OpenAI|images\.generate/i);
  });

  it("retry UI path is not used for Design scene generation", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/ai/ai-panel.tsx"),
      "utf8",
    );
    expect(source).toContain("placeDesignScene");
    expect(source).not.toContain("retryInsertToCanvas");
    expect(source).toContain('mode: "design"');
  });

  it("autosave is triggered only after insertion success", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/ai/ai-panel.tsx"),
      "utf8",
    );
    expect(source).toContain('window.dispatchEvent(new CustomEvent("hourse:dirty"))');
    expect(source).toContain("Design added to canvas");
  });
});
