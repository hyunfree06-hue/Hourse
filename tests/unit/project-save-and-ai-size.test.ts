import { describe, expect, it } from "vitest";
import { saveProjectSchema, timestampSchema } from "@/lib/validation/schemas";
import {
  normalizeOpenAiImageSize,
  normalizeBflImageSize,
} from "@/lib/ai/size";
import { AppError, toErrorResponse } from "@/lib/utils/errors";

describe("project save timestamp validation", () => {
  it("accepts supabase timestamptz with microseconds and offset", () => {
    const samples = [
      "2026-08-02T00:00:00.123456+00:00",
      "2026-08-02T09:12:33.49121+09:00",
      "2026-08-02T00:00:00Z",
    ];
    for (const value of samples) {
      expect(timestampSchema.safeParse(value).success).toBe(true);
    }
  });

  it("accepts autosave payload with expectedUpdatedAt", () => {
    const parsed = saveProjectSchema.parse({
      canvasJson: { version: "6", objects: [] },
      canvasWidth: 1920,
      canvasHeight: 1080,
      backgroundColor: "#ffffff",
      expectedUpdatedAt: "2026-08-02T00:00:00.123456+00:00",
    });
    expect(parsed.expectedUpdatedAt).toContain("2026-08-02");
  });

  it("accepts legacy updatedAt field", () => {
    const parsed = saveProjectSchema.parse({
      canvasJson: { objects: [] },
      updatedAt: "2026-08-02T00:00:00.123456+00:00",
    });
    expect(parsed.updatedAt).toBeTruthy();
  });
});

describe("OpenAI size normalization", () => {
  it("maps 66×66 to 1024x1024", () => {
    expect(normalizeOpenAiImageSize(66, 66)).toEqual({
      size: "1024x1024",
      width: 1024,
      height: 1024,
    });
  });

  it("maps landscape selection to 1536x1024", () => {
    expect(normalizeOpenAiImageSize(480, 220).size).toBe("1536x1024");
  });

  it("maps portrait selection to 1024x1536", () => {
    expect(normalizeOpenAiImageSize(220, 480).size).toBe("1024x1536");
  });

  it("never emits raw selection dimensions as size strings", () => {
    const sizes = [
      normalizeOpenAiImageSize(66, 66),
      normalizeOpenAiImageSize(480, 220),
      normalizeOpenAiImageSize(1920, 1080),
    ];
    for (const s of sizes) {
      expect(["1024x1024", "1536x1024", "1024x1536"]).toContain(s.size);
    }
  });
});

describe("BFL size normalization", () => {
  it("snaps to multiples of 16 within bounds", () => {
    const size = normalizeBflImageSize(66, 66);
    expect(size.width % 16).toBe(0);
    expect(size.height % 16).toBe(0);
    expect(size.width).toBeGreaterThanOrEqual(64);
  });
});

describe("error responses", () => {
  it("includes requestId without secrets for AppError", () => {
    const res = toErrorResponse(
      new AppError(
        "PROJECT_SAVE_FAILED",
        "We couldn't save this project.",
        500,
        undefined,
        "req-123",
      ),
    );
    expect(res.body.error.code).toBe("PROJECT_SAVE_FAILED");
    expect(res.body.error.requestId).toBe("req-123");
    expect(JSON.stringify(res.body)).not.toMatch(/service_role|api_key|cookie/i);
  });
});
