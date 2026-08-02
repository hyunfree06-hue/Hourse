import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Client-side insert pipeline: asset GET 200 → validate bytes → browser decode → Fabric.
 * Mocks Fabric + Image so we can assert stages without a real canvas.
 */

const pngBytes = () =>
  Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );

describe("loadFabricImageForAsset same-origin pipeline", () => {
  const originalFetch = globalThis.fetch;
  const stages: string[] = [];

  beforeEach(() => {
    stages.length = 0;
    vi.resetModules();

    class MockImage {
      width = 1;
      height = 1;
      naturalWidth = 1;
      naturalHeight = 1;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
      decode() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal("createImageBitmap", async () => ({
      close() {},
      width: 1,
      height: 1,
    }));
    const createObjectURL = vi.fn(() => "blob:test-object-url");
    const revokeObjectURL = vi.fn();
    // Preserve URL constructor used by diagnostics / absolute URL parsing.
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectURL,
    });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    });

    vi.doMock("fabric", () => {
      class FabricImage {
        width = 1;
        height = 1;
        constructor(..._args: unknown[]) {
          void _args;
        }
        set() {
          return this;
        }
        getElement() {
          return new MockImage();
        }
        static async fromURL() {
          return new FabricImage();
        }
      }
      return { FabricImage };
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("loads PNG bytes from same-origin asset route without revoking early", async () => {
    const bytes = pngBytes();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/api/assets/asset-1/content");
      return new Response(new Blob([Buffer.from(bytes)], { type: "image/png" }), {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": String(bytes.length),
        },
      });
    }) as typeof fetch;

    const { loadFabricImageForAsset } = await import(
      "@/lib/canvas/load-fabric-image"
    );
    const { hasRegisteredObjectUrl, revokeAllObjectUrls } = await import(
      "@/lib/canvas/object-url-registry"
    );

    const loaded = await loadFabricImageForAsset({
      assetId: "asset-1",
      preferSameOrigin: true,
      generationId: "gen-1",
      onStage: (stage) => stages.push(stage),
    });

    expect(loaded.source).toBe("same-origin-blob");
    expect(loaded.contentType).toBe("image/png");
    expect(loaded.blobSize).toBe(bytes.length);
    expect(loaded.objectUrl).toBe("blob:test-object-url");
    expect(hasRegisteredObjectUrl(loaded.objectId)).toBe(true);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(stages).toContain("asset_fetch");
    expect(stages).toContain("asset_blob_validation");
    expect(stages).toContain("browser_decode");
    expect(stages).toContain("fabric_decode");

    revokeAllObjectUrls();
  });

  it("rejects JSON body even when Content-Type claims image/png", async () => {
    const json = new TextEncoder().encode('{"error":"not an image"}');
    globalThis.fetch = vi.fn(async () =>
      new Response(json, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    ) as typeof fetch;

    const { loadFabricImageForAsset, GeneratedImageLoadError } = await import(
      "@/lib/canvas/load-fabric-image"
    );

    await expect(
      loadFabricImageForAsset({
        assetId: "asset-bad",
        preferSameOrigin: true,
      }),
    ).rejects.toBeInstanceOf(GeneratedImageLoadError);
  });
});
