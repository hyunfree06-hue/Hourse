import sharp from "sharp";
import { aiRuntimeConfig } from "@/config/editor";
import { AppError } from "@/lib/utils/errors";

export async function normalizeImageSize(
  buffer: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return sharp(buffer)
    .resize(w, h, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
}

export async function validateImageBuffer(buffer: Buffer): Promise<{
  width: number;
  height: number;
  mimeType: string;
}> {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) {
    throw new AppError("invalid_image", "Invalid image.", 400);
  }
  const format = meta.format;
  const mime =
    format === "jpeg"
      ? "image/jpeg"
      : format === "webp"
        ? "image/webp"
        : "image/png";
  return { width: meta.width, height: meta.height, mimeType: mime };
}

export async function downloadHttpsImage(url: string): Promise<Buffer> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError("invalid_url", "Invalid image URL.", 400);
  }

  if (parsed.protocol !== "https:") {
    throw new AppError("insecure_url", "Only HTTPS images can be downloaded.", 400);
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
        "download_failed",
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
        "invalid_content_type",
        "Response is not an image.",
        400,
      );
    }

    const lengthHeader = response.headers.get("content-length");
    if (
      lengthHeader &&
      Number(lengthHeader) > aiRuntimeConfig.maxDownloadBytes
    ) {
      throw new AppError("file_too_large", "Image file is too large.", 400);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > aiRuntimeConfig.maxDownloadBytes) {
      throw new AppError("file_too_large", "Image file is too large.", 400);
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

