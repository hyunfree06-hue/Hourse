import sharp from "sharp";
import {
  detectImageKindFromBytes,
  mimeFromImageKind,
  signatureHexPreview,
  type ImageKind,
} from "@/lib/canvas/image-bytes";
import { AppError } from "@/lib/utils/errors";

const MIME_BY_FORMAT = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const;

export type ResolvedStoredImage = {
  bytes: Buffer;
  mimeType: (typeof MIME_BY_FORMAT)[keyof typeof MIME_BY_FORMAT];
  format: ImageKind;
  width: number;
  height: number;
  signature: string;
};

/**
 * Resolve real image MIME from downloaded Storage bytes.
 * Does not trust assets.mime_type or application/octet-stream.
 */
export async function resolveStoredImageBytes(
  input: Buffer | Uint8Array | ArrayBuffer,
  options?: { requestId?: string },
): Promise<ResolvedStoredImage> {
  const bytes = Buffer.isBuffer(input)
    ? input
    : Buffer.from(
        input instanceof ArrayBuffer ? new Uint8Array(input) : input,
      );

  if (!bytes.length) {
    throw new AppError(
      "INVALID_ASSET_IMAGE",
      "The stored asset is not a valid supported image.",
      422,
      undefined,
      options?.requestId,
    );
  }

  const signature = signatureHexPreview(bytes, 8);
  const magicKind = detectImageKindFromBytes(bytes);

  let format: ImageKind | null = magicKind;
  let width = 0;
  let height = 0;

  try {
    const meta = await sharp(bytes).metadata();
    const sharpFormat = meta.format;
    if (sharpFormat === "png" || sharpFormat === "jpeg" || sharpFormat === "webp") {
      format = sharpFormat;
    }
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    // Fall through to magic-only / reject below.
  }

  if (!format || !width || !height) {
    throw new AppError(
      "INVALID_ASSET_IMAGE",
      "The stored asset is not a valid supported image.",
      422,
      { signature, magicKind },
      options?.requestId,
    );
  }

  return {
    bytes,
    mimeType: MIME_BY_FORMAT[format],
    format,
    width,
    height,
    signature,
  };
}

export function extensionForMime(
  mimeType: string,
): "png" | "jpg" | "webp" {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

export function normalizeGeneratedMime(
  mimeType: string | null | undefined,
): "image/png" | "image/jpeg" | "image/webp" {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "image/jpeg";
  if (mimeType === "image/webp") return "image/webp";
  return "image/png";
}

export { mimeFromImageKind, MIME_BY_FORMAT };
