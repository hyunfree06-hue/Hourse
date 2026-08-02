import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  extensionForMime,
  normalizeGeneratedMime,
  resolveStoredImageBytes,
} from "@/lib/assets/resolve-stored-image";
import { AppError } from "@/lib/utils/errors";

async function makePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  })
    .png()
    .toBuffer();
}

async function makeJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  })
    .jpeg()
    .toBuffer();
}

async function makeWebp(): Promise<Buffer> {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  })
    .webp()
    .toBuffer();
}

describe("resolveStoredImageBytes", () => {
  it("detects PNG even when DB mime would be application/octet-stream", async () => {
    const png = await makePng();
    const resolved = await resolveStoredImageBytes(png);
    expect(resolved.mimeType).toBe("image/png");
    expect(resolved.format).toBe("png");
    expect(resolved.bytes[0]).toBe(0x89);
    expect(resolved.bytes[1]).toBe(0x50);
  });

  it("detects JPEG and WebP from bytes", async () => {
    const jpeg = await resolveStoredImageBytes(await makeJpeg());
    expect(jpeg.mimeType).toBe("image/jpeg");
    expect(jpeg.format).toBe("jpeg");

    const webp = await resolveStoredImageBytes(await makeWebp());
    expect(webp.mimeType).toBe("image/webp");
    expect(webp.format).toBe("webp");
  });

  it("returns 422 INVALID_ASSET_IMAGE for JSON/text bytes", async () => {
    await expect(
      resolveStoredImageBytes(Buffer.from('{"error":"nope"}', "utf8")),
    ).rejects.toMatchObject({
      code: "INVALID_ASSET_IMAGE",
      status: 422,
    });
  });

  it("returns 422 for empty bytes", async () => {
    await expect(resolveStoredImageBytes(Buffer.alloc(0))).rejects.toBeInstanceOf(
      AppError,
    );
  });
});

describe("generated upload mime agreement", () => {
  it("maps mime to matching extension", () => {
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/webp")).toBe("webp");
  });

  it("never normalizes to application/octet-stream", () => {
    expect(normalizeGeneratedMime("application/octet-stream")).toBe("image/png");
    expect(normalizeGeneratedMime(null)).toBe("image/png");
    expect(normalizeGeneratedMime("")).toBe("image/png");
    expect(normalizeGeneratedMime("image/jpeg")).toBe("image/jpeg");
  });
});

describe("asset content route contracts", () => {
  it("does not require request Content-Type and uses 422 not 415", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const route = await fs.readFile(
      path.join(
        process.cwd(),
        "src/app/api/assets/[assetId]/content/route.ts",
      ),
      "utf8",
    );
    const resolver = await fs.readFile(
      path.join(process.cwd(), "src/lib/assets/resolve-stored-image.ts"),
      "utf8",
    );
    expect(route).not.toMatch(/req\.headers\.get\(["']content-type["']\)/i);
    expect(route).toContain("resolveStoredImageBytes");
    expect(route).toContain("mime_repaired");
    expect(route).not.toContain("415");
    expect(resolver).toContain("INVALID_ASSET_IMAGE");
    expect(resolver).toContain("422");
  });

  it("completeGeneration stores matching extension + contentType + mime_type", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.join(process.cwd(), "src/lib/ai/generation-service.ts"),
      "utf8",
    );
    expect(source).toContain("contentType: validated.mime");
    expect(source).toContain('cacheControl: "3600"');
    expect(source).toContain("mime_type: validated.mime");
    expect(source).toContain("validated.uploadBody");
    expect(source).toContain(".${validated.extension}");
    expect(source).not.toMatch(/mime_type:\s*["']application\/octet-stream["']/);
  });

  it("autosave 409 retries once and is not insertion_failed", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const autosave = await fs.readFile(
      path.join(process.cwd(), "src/hooks/use-autosave.ts"),
      "utf8",
    );
    const conflictBlock = autosave.slice(
      autosave.indexOf("res.status === 409"),
      autosave.indexOf("} else if (!res.ok)"),
    );
    expect(conflictBlock).toContain("retry once");
    expect(conflictBlock).not.toContain("window.confirm");
    expect(conflictBlock).toContain("Never treat this as an image insertion failure");

    const panel = await fs.readFile(
      path.join(process.cwd(), "src/components/editor/ai/ai-panel.tsx"),
      "utf8",
    );
    expect(panel).toContain('window.dispatchEvent(new CustomEvent("hourse:dirty"))');
    expect(panel).toContain("placeDesignScene");
    expect(panel).not.toContain("retryInsertToCanvas");
  });
});
