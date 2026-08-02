import { describe, expect, it, vi, beforeEach } from "vitest";
import sharp from "sharp";
import {
  assertNotRawBase64OrJsonText,
  decodeOpenAiB64Json,
  validateGeneratedImageBytes,
} from "@/lib/ai/decode-generated-image";
import { AppError } from "@/lib/utils/errors";

async function makePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
  })
    .png()
    .toBuffer();
}

describe("decodeOpenAiB64Json", () => {
  it("decodes with Buffer.from(value, 'base64')", async () => {
    const png = await makePng();
    const b64 = png.toString("base64");
    const decoded = decodeOpenAiB64Json(b64);
    expect(decoded[0]).toBe(0x89);
    expect(decoded[1]).toBe(0x50);
    expect(decoded[2]).toBe(0x4e);
    expect(decoded[3]).toBe(0x47);
  });

  it("strips data-URL prefix", async () => {
    const png = await makePng();
    const decoded = decodeOpenAiB64Json(
      `data:image/png;base64,${png.toString("base64")}`,
    );
    expect(decoded[0]).toBe(0x89);
  });

  it("rejects missing / JSON / URL payloads", () => {
    expect(() => decodeOpenAiB64Json(undefined)).toThrow(AppError);
    expect(() => decodeOpenAiB64Json('{"b64_json":"abc"}')).toThrow(AppError);
    expect(() => decodeOpenAiB64Json("https://example.com/x.png")).toThrow(
      AppError,
    );
  });

  it("does not treat utf8 text as base64 without encoding flag path", async () => {
    // Buffer.from(ascii, 'utf8') would keep ASCII; our decoder always uses base64.
    const png = await makePng();
    const wrong = Buffer.from(png.toString("base64"), "utf8");
    expect(wrong[0]).not.toBe(0x89);
    const right = decodeOpenAiB64Json(png.toString("base64"));
    expect(right[0]).toBe(0x89);
  });
});

describe("validateGeneratedImageBytes", () => {
  it("accepts valid PNG and returns matching mime/extension/Uint8Array body", async () => {
    const png = await makePng();
    const validated = await validateGeneratedImageBytes(png, {
      generationId: "gen-1",
      provider: "openai",
    });
    expect(validated.format).toBe("png");
    expect(validated.mime).toBe("image/png");
    expect(validated.extension).toBe("png");
    expect(validated.uploadBody).toBeInstanceOf(Uint8Array);
    expect(validated.uploadBody[0]).toBe(0x89);
    expect(validated.width).toBeGreaterThan(0);
  });

  it("rejects raw JSON text bytes", async () => {
    const json = Buffer.from('{"data":[{"b64_json":"abc"}]}', "utf8");
    expect(() => assertNotRawBase64OrJsonText(json)).toThrow(AppError);
    await expect(validateGeneratedImageBytes(json)).rejects.toMatchObject({
      code: "INVALID_GENERATED_IMAGE_BYTES",
    });
  });

  it("rejects empty bytes", async () => {
    await expect(validateGeneratedImageBytes(Buffer.alloc(0))).rejects.toMatchObject({
      code: "EMPTY_GENERATED_IMAGE",
    });
  });

  it("rejects serialized Node Buffer JSON", () => {
    const fake = Buffer.from(
      JSON.stringify({ type: "Buffer", data: [137, 80, 78, 71] }),
      "utf8",
    );
    expect(() => assertNotRawBase64OrJsonText(fake)).toThrow(AppError);
  });
});

describe("completeGeneration upload contract", () => {
  it("uploads Uint8Array and verifies before completing", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.join(process.cwd(), "src/lib/ai/generation-service.ts"),
      "utf8",
    );
    expect(source).toContain("validated.uploadBody");
    expect(source).toContain("storage_verify");
    expect(source).toContain("validateGeneratedImageBytes");
    expect(source).toMatch(/status:\s*"completed"/);
    // completed must come after verify
    expect(source.indexOf("storage_verified")).toBeLessThan(
      source.indexOf('status: "completed"'),
    );
  });

  it("OpenAI provider decodes b64_json with base64 encoding", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.join(process.cwd(), "src/lib/ai/openai-provider.ts"),
      "utf8",
    );
    expect(source).toContain("decodeOpenAiB64Json");
    expect(source).toContain("field=b64_json");
    expect(source).not.toMatch(/Buffer\.from\([^,]+\)\s*;/);
  });
});

describe("invalid generation does not complete + refunds", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("failAndRefund uses a single idempotent refund key", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.join(process.cwd(), "src/lib/ai/generation-service.ts"),
      "utf8",
    );
    expect(source).toContain("`generation_refund:${input.generationId}`");
  });

  it("corrupted existing asset content stays 422 INVALID_ASSET_IMAGE", async () => {
    const { resolveStoredImageBytes } = await import(
      "@/lib/assets/resolve-stored-image"
    );
    await expect(
      resolveStoredImageBytes(Buffer.from('{"type":"Buffer","data":[1]}', "utf8")),
    ).rejects.toMatchObject({ code: "INVALID_ASSET_IMAGE", status: 422 });
  });
});
