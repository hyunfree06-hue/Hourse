import sharp from "sharp";
import {
  detectImageKindFromBytes,
  mimeFromImageKind,
  signatureHexPreview,
  type ImageKind,
} from "@/lib/canvas/image-bytes";
import { AppError, logServerInfo } from "@/lib/utils/errors";

const OUTPUT_BY_FORMAT = {
  png: { extension: "png", mime: "image/png" },
  jpeg: { extension: "jpg", mime: "image/jpeg" },
  webp: { extension: "webp", mime: "image/webp" },
} as const;

export type ValidatedGeneratedImage = {
  bytes: Buffer;
  /** Always a real Uint8Array view safe for Storage upload (never JSON-serialized Buffer). */
  uploadBody: Uint8Array;
  format: ImageKind;
  mime: "image/png" | "image/jpeg" | "image/webp";
  extension: "png" | "jpg" | "webp";
  width: number;
  height: number;
  signature: string;
  byteLength: number;
};

/**
 * Decode OpenAI `b64_json` into binary image bytes.
 * Always uses Buffer.from(value, "base64") — never Buffer.from(value) alone.
 */
export function decodeOpenAiB64Json(raw: unknown): Buffer {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new AppError(
      "OPENAI_IMAGE_DATA_MISSING",
      "The image model returned no image data.",
      502,
    );
  }

  let value = raw.trim();
  // Strip accidental data-URL prefix if present.
  const dataUrl = /^data:image\/[a-z0-9+.-]+;base64,/i.exec(value);
  if (dataUrl) {
    value = value.slice(dataUrl[0].length);
  }

  // Reject obvious JSON / URL payloads uploaded as "images".
  if (
    value.startsWith("{") ||
    value.startsWith("[") ||
    value.startsWith("http://") ||
    value.startsWith("https://")
  ) {
    throw new AppError(
      "INVALID_GENERATED_IMAGE_BYTES",
      "The image model returned non-image data.",
      502,
    );
  }

  const bytes = Buffer.from(value, "base64");
  if (!bytes.length) {
    throw new AppError("EMPTY_GENERATED_IMAGE", "Generated image was empty.", 502);
  }
  return bytes;
}

/**
 * Validate generated image bytes with magic + Sharp before Storage upload.
 */
export async function validateGeneratedImageBytes(
  input: Buffer,
  logContext?: {
    generationId?: string;
    provider?: string;
    requestId?: string;
  },
): Promise<ValidatedGeneratedImage> {
  if (!input?.length) {
    throw new AppError("EMPTY_GENERATED_IMAGE", "Generated image was empty.", 502);
  }

  const signature = signatureHexPreview(input, 8);
  const magic = detectImageKindFromBytes(input);

  let format: ImageKind | null = magic;
  let width = 0;
  let height = 0;

  try {
    const metadata = await sharp(input).metadata();
    if (
      metadata.format === "png" ||
      metadata.format === "jpeg" ||
      metadata.format === "webp"
    ) {
      format = metadata.format;
    } else {
      format = null;
    }
    width = metadata.width ?? 0;
    height = metadata.height ?? 0;
  } catch {
    format = null;
  }

  if (!format || !width || !height) {
    throw new AppError(
      "INVALID_GENERATED_IMAGE_BYTES",
      "Generated image bytes are not a valid PNG, JPEG, or WebP.",
      502,
      { signature, magic },
      logContext?.requestId,
    );
  }

  const output = OUTPUT_BY_FORMAT[format];
  const bytes = Buffer.from(input);

  logServerInfo({
    requestId: logContext?.requestId ?? "unknown",
    route: "validateGeneratedImageBytes",
    stage: "validated",
    generationId: logContext?.generationId,
    message: `provider=${logContext?.provider ?? "unknown"};bytes=${bytes.length};format=${format};w=${width};h=${height};sig=${signature}`,
  });

  return {
    bytes,
    uploadBody: new Uint8Array(bytes),
    format,
    mime: output.mime,
    extension: output.extension,
    width,
    height,
    signature,
    byteLength: bytes.length,
  };
}

export function assertNotRawBase64OrJsonText(bytes: Buffer) {
  const head = bytes.subarray(0, Math.min(64, bytes.length)).toString("utf8");
  const trimmed = head.trimStart();
  if (
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed.includes('"b64_json"') ||
    trimmed.includes('"type":"Buffer"')
  ) {
    throw new AppError(
      "INVALID_GENERATED_IMAGE_BYTES",
      "Raw base64 or JSON was provided instead of binary image bytes.",
      502,
    );
  }
}

export { mimeFromImageKind, OUTPUT_BY_FORMAT };
