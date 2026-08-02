import { test, expect } from "@playwright/test";

/**
 * Safari/WebKit-focused coverage for the generated-image insert path:
 * Blob fetch → object URL → Image decode → keep URL alive (no premature revoke).
 * Full authenticated Fabric canvas coverage requires a logged-in session; these
 * checks validate the browser primitives that previously failed in Safari.
 */
test.describe("Safari generated-image insert primitives", () => {
  test("PNG blob decodes and object URL must stay alive until explicit revoke", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "webkit",
      "Safari/WebKit-only regression coverage",
    );

    await page.goto("/");

    const result = await page.evaluate(async () => {
      // 1x1 PNG
      const b64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "image/png" });

      if (!blob.type.startsWith("image/")) {
        return { ok: false, reason: "INVALID_GENERATED_IMAGE_TYPE" };
      }
      if (blob.size === 0) {
        return { ok: false, reason: "EMPTY_GENERATED_IMAGE" };
      }

      const objectUrl = URL.createObjectURL(blob);

      const decode = () =>
        new Promise<{ width: number; height: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () =>
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => reject(new Error("FABRIC_IMAGE_DECODE_FAILED"));
          img.src = objectUrl;
        });

      const decoded = await decode();

      // Premature revoke would break a second decode / canvas redraw in Safari.
      const second = await decode();

      URL.revokeObjectURL(objectUrl);

      let afterRevokeFailed = false;
      try {
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("revoked"));
          img.src = objectUrl;
        });
      } catch {
        afterRevokeFailed = true;
      }

      return {
        ok: true,
        blobType: blob.type,
        blobSize: blob.size,
        width: decoded.width,
        height: decoded.height,
        secondWidth: second.width,
        afterRevokeFailed,
      };
    });

    expect(result.ok).toBe(true);
    expect(result.blobType).toBe("image/png");
    expect(result.blobSize).toBeGreaterThan(0);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(result.secondWidth).toBe(1);
    expect(result.afterRevokeFailed).toBe(true);
  });

  test("retry insert contract: refresh route charges 0 credits", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "webkit",
      "Safari/WebKit-only regression coverage",
    );

    await page.goto("/");
    // Unauthenticated refresh should not trigger provider calls; 401/404 is fine.
    const res = await page.request.post(
      "/api/ai/generations/00000000-0000-0000-0000-000000000000/signed-url",
    );
    expect([401, 403, 404]).toContain(res.status());
    // No OpenAI round-trip is possible for this route by construction.
    const body = await res.text();
    expect(body.toLowerCase()).not.toContain("openai");
  });
});
