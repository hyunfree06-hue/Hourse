export class GeneratedImageLoadError extends Error {
  readonly code: string;
  readonly httpStatus?: number;
  readonly contentType?: string;
  readonly contentLength?: string | null;

  constructor(
    code: string,
    message = "The image was created, but we couldn't add it to the canvas.",
    meta?: {
      httpStatus?: number;
      contentType?: string;
      contentLength?: string | null;
    },
  ) {
    super(message);
    this.name = "GeneratedImageLoadError";
    this.code = code;
    this.httpStatus = meta?.httpStatus;
    this.contentType = meta?.contentType;
    this.contentLength = meta?.contentLength;
  }
}

export type FetchedImageBlob = {
  blob: Blob;
  contentType: string;
  contentLength: string | null;
  objectUrl: string;
};

/**
 * Download a remote signed URL to a local Blob + object URL.
 * Never pass the signed URL directly to Fabric — CORS often breaks.
 */
export async function fetchSignedImageAsObjectUrl(
  signedUrl: string,
  init?: RequestInit,
): Promise<FetchedImageBlob> {
  const response = await fetch(signedUrl, {
    method: "GET",
    cache: "no-store",
    ...init,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const contentLength = response.headers.get("content-length");

  if (!response.ok) {
    throw new GeneratedImageLoadError("SIGNED_URL_DOWNLOAD_FAILED", undefined, {
      httpStatus: response.status,
      contentType,
      contentLength,
    });
  }

  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new GeneratedImageLoadError("INVALID_IMAGE_CONTENT_TYPE", undefined, {
      httpStatus: response.status,
      contentType,
      contentLength,
    });
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new GeneratedImageLoadError("EMPTY_IMAGE_BODY", undefined, {
      httpStatus: response.status,
      contentType,
      contentLength,
    });
  }

  const objectUrl = URL.createObjectURL(blob);
  return { blob, contentType, contentLength, objectUrl };
}

export function revokeObjectUrlSafe(objectUrl: string | null | undefined) {
  if (!objectUrl) return;
  try {
    URL.revokeObjectURL(objectUrl);
  } catch {
    // ignore
  }
}

/** User-facing copy — never include signed URLs or tokens. */
export const CANVAS_INSERT_ERROR_MESSAGE =
  "The image was created, but we couldn't add it to the canvas.";
