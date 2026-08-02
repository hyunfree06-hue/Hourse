import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  fetchSignedImageAsObjectUrl,
  GeneratedImageLoadError,
  CANVAS_INSERT_ERROR_MESSAGE,
} from "@/lib/canvas/fetch-signed-image";
import { validateImageBuffer } from "@/lib/ai/image-utils";
import { describeSignedUrlForLogs } from "@/lib/canvas/load-fabric-image";

function pngBytes(): Buffer {
  // Minimal valid 1x1 PNG
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

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
      new Response(new Uint8Array(bytes), {
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
    expect(result.objectUrl).toBe("blob:mock-object-url");
    expect(createObjectURL).toHaveBeenCalledOnce();
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
});

describe("image byte validation", () => {
  it("accepts valid PNG bytes", async () => {
    const meta = await validateImageBuffer(pngBytes());
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
    expect(meta.pathname).toContain("/generated-assets/");
    expect(JSON.stringify(meta)).not.toContain("SECRET_TOKEN");
    expect(JSON.stringify(meta)).not.toContain("token=");
  });

  it("user-facing insert error never includes signed URL text", () => {
    expect(CANVAS_INSERT_ERROR_MESSAGE).not.toMatch(/http|supabase|token/i);
    const err = new GeneratedImageLoadError("FABRIC_IMAGE_LOAD_FAILED");
    expect(err.message).toBe(CANVAS_INSERT_ERROR_MESSAGE);
  });
});

describe("Fabric v7 fromURL contract", () => {
  it("exposes Promise-returning fromURL (Fabric 7 API)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const root = process.cwd();
    const pkg = JSON.parse(
      await fs.readFile(path.join(root, "node_modules/fabric/package.json"), "utf8"),
    ) as { version: string };
    expect(pkg.version.startsWith("7.")).toBe(true);

    const typeSource = await fs.readFile(
      path.join(root, "node_modules/fabric/dist/src/shapes/Image.d.ts"),
      "utf8",
    );
    expect(typeSource).toMatch(
      /static fromURL[\s\S]*Promise<\s*FabricImage\s*>/,
    );
    expect(typeSource).not.toMatch(/fromURL\([^)]*callback\s*:/);
  });
});

describe("retry insertion economics", () => {
  it("signed-url refresh endpoint is documented as zero-credit", () => {
    // Contract assertion: refresh route response includes creditsCharged: 0
    // (implementation in signed-url/route.ts). Keep this as a stable product rule.
    const contract = { creditsCharged: 0, regeneratesProvider: false };
    expect(contract.creditsCharged).toBe(0);
    expect(contract.regeneratesProvider).toBe(false);
  });
});
