import sharp from "sharp";
import { aiRuntimeConfig } from "@/config/editor";
import { AppError } from "@/lib/utils/errors";

export type ImageFitMode = "cover" | "contain";

/**
 * Fit a generated image into exact selection bounds.
 * cover: fill, crop overflow · contain: letterbox with transparent padding
 */
export async function fitImageToSelection(
  buffer: Buffer,
  width: number,
  height: number,
  fit: ImageFitMode = "cover",
): Promise<Buffer> {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  if (fit === "contain") {
    return sharp(buffer)
      .resize(w, h, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        position: "centre",
      })
      .png()
      .toBuffer();
  }

  return sharp(buffer)
    .resize(w, h, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
}

/** @deprecated Prefer fitImageToSelection with explicit fit */
export async function normalizeImageSize(
  buffer: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  return fitImageToSelection(buffer, width, height, "cover");
}

export async function validateImageBuffer(buffer: Buffer): Promise<{
  width: number;
  height: number;
  mimeType: string;
}> {
  if (!buffer?.length) {
    throw new AppError("INVALID_IMAGE", "Invalid image.", 400);
  }

  const mimeFromMagic = detectImageMime(buffer);
  if (!mimeFromMagic) {
    throw new AppError(
      "INVALID_IMAGE",
      "Uploaded bytes are not a valid image.",
      400,
    );
  }

  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) {
    throw new AppError("INVALID_IMAGE", "Invalid image.", 400);
  }
  const format = meta.format;
  const mime =
    format === "jpeg"
      ? "image/jpeg"
      : format === "webp"
        ? "image/webp"
        : format === "png"
          ? "image/png"
          : mimeFromMagic;

  if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) {
    throw new AppError("INVALID_IMAGE", "Unsupported image format.", 400);
  }

  return { width: meta.width, height: meta.height, mimeType: mime };
}

function detectImageMime(buffer: Buffer): string | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  const head = buffer.subarray(0, Math.min(32, buffer.length)).toString("utf8");
  if (head.trimStart().startsWith("{") || head.includes("base64")) {
    return null;
  }
  return null;
}

export async function downloadHttpsImage(url: string): Promise<Buffer> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError("INVALID_URL", "Invalid image URL.", 400);
  }

  if (parsed.protocol !== "https:") {
    throw new AppError("INSECURE_URL", "Only HTTPS images can be downloaded.", 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new AppError(
        "DOWNLOAD_FAILED",
        "Unable to download the result image.",
        502,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      contentType &&
      !contentType.includes("image/") &&
      !contentType.includes("octet-stream")
    ) {
      throw new AppError(
        "INVALID_CONTENT_TYPE",
        "Response is not an image.",
        400,
      );
    }

    const lengthHeader = response.headers.get("content-length");
    if (
      lengthHeader &&
      Number(lengthHeader) > aiRuntimeConfig.maxDownloadBytes
    ) {
      throw new AppError("FILE_TOO_LARGE", "Image file is too large.", 400);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > aiRuntimeConfig.maxDownloadBytes) {
      throw new AppError("FILE_TOO_LARGE", "Image file is too large.", 400);
    }

    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

export async function createFullMask(
  width: number,
  height: number,
): Promise<Buffer> {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

/** Ensure a value is JSON-serializable (no NaN/Infinity/undefined in nested structures). */
export function assertJsonSafe(value: unknown, label = "payload"): unknown {
  const serialized = JSON.stringify(value, (_key, v) => {
    if (typeof v === "number" && !Number.isFinite(v)) {
      throw new AppError(
        "INVALID_JSON",
        `${label} contains non-finite numbers.`,
        400,
      );
    }
    if (typeof v === "undefined") {
      return null;
    }
    return v;
  });
  if (serialized === undefined) {
    throw new AppError("INVALID_JSON", `${label} is not JSON-serializable.`, 400);
  }
  return JSON.parse(serialized) as unknown;
}
