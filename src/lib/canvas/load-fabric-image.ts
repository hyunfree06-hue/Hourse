import { FabricImage } from "fabric";
import {
  CANVAS_INSERT_ERROR_MESSAGE,
  GeneratedImageLoadError,
  revokeObjectUrlSafe,
} from "@/lib/canvas/fetch-signed-image";
import {
  detectImageKindFromBytes,
  isProbablyJsonOrText,
  mimeFromImageKind,
  normalizeImageContentType,
  signatureHexPreview,
} from "@/lib/canvas/image-bytes";
import { registerObjectUrl } from "@/lib/canvas/object-url-registry";
import { createObjectId } from "@/lib/canvas/custom-properties";

export { CANVAS_INSERT_ERROR_MESSAGE, GeneratedImageLoadError };

export type InsertStage =
  | "asset_fetch"
  | "asset_blob_validation"
  | "browser_decode"
  | "fabric_decode"
  | "image_transform"
  | "clip_path"
  | "canvas_add"
  | "canvas_render"
  | "autosave";

export type LoadedFabricImage = {
  image: FabricImage;
  objectId: string;
  /** Runtime blob URL — do not serialize. Kept until remove/dispose. */
  objectUrl: string | null;
  source: "same-origin-blob" | "signed-blob";
  contentType: string;
  blobSize: number;
  width: number;
  height: number;
};

type LoadOptions = {
  assetId?: string;
  preferSameOrigin?: boolean;
  signedUrl?: string | null;
  refreshSignedUrl?: () => Promise<string | null>;
  generationId?: string;
  onStage?: (
    stage: InsertStage,
    data?: Record<string, unknown>,
  ) => void;
};

const FABRIC_VERSION = "7.4.0";

function stage(
  onStage: LoadOptions["onStage"],
  name: InsertStage,
  data?: Record<string, unknown>,
) {
  onStage?.(name, {
    fabricVersion: FABRIC_VERSION,
    ...data,
  });
}

async function verifyBrowserCanDecode(blob: Blob): Promise<void> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      bitmap.close();
      return;
    } catch {
      throw new GeneratedImageLoadError("BROWSER_DECODE_FAILED");
    }
  }

  // Fallback: HTMLImageElement.decode
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
  } catch {
    throw new GeneratedImageLoadError("BROWSER_DECODE_FAILED");
  } finally {
    revokeObjectUrlSafe(url);
  }
}

/**
 * Fabric 7: prefer constructing from a decoded HTMLImageElement for Safari blob URLs.
 * Do not set crossOrigin on blob: URLs — it can break Safari decoding.
 */
async function fabricFromBlob(
  blob: Blob,
  onStage: LoadOptions["onStage"],
): Promise<{ image: FabricImage; objectUrl: string }> {
  const objectUrl = URL.createObjectURL(blob);
  stage(onStage, "fabric_decode", {
    event: "object_url_created",
    blobUrlScheme: "blob:",
  });

  try {
    stage(onStage, "fabric_decode", {
      event: "html_image_decode_start",
      hasCrossOrigin: false,
    });

    const element = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      // Intentionally no crossOrigin for blob: URLs (Safari).
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new GeneratedImageLoadError("FABRIC_IMAGE_DECODE_FAILED"));
      img.src = objectUrl;
    });

    try {
      await element.decode();
    } catch {
      // onload already fired — decode() may reject on some Safari builds; continue.
    }

    const image = new FabricImage(element);
    const width = image.width || element.naturalWidth || 0;
    const height = image.height || element.naturalHeight || 0;

    stage(onStage, "fabric_decode", {
      event: "fabric_image_ready",
      width,
      height,
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
    });

    if (
      !image ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !width ||
      !height
    ) {
      throw new GeneratedImageLoadError("FABRIC_IMAGE_HAS_INVALID_DIMENSIONS");
    }

    image.set({ width, height });
    return { image, objectUrl };
  } catch (error) {
    revokeObjectUrlSafe(objectUrl);
    throw error;
  }
}

async function validateFetchedImageResponse(
  response: Response,
  onStage: LoadOptions["onStage"],
  meta: { assetId?: string; generationId?: string },
): Promise<{ blob: Blob; contentType: string; blobSize: number }> {
  stage(onStage, "asset_fetch", {
    event: "response",
    status: response.status,
    redirected: response.redirected,
    contentType: response.headers.get("content-type"),
    contentLength: response.headers.get("content-length"),
    assetId: meta.assetId,
    generationId: meta.generationId,
  });

  if (!response.ok) {
    throw new GeneratedImageLoadError(
      `ASSET_FETCH_FAILED:${response.status}`,
      CANVAS_INSERT_ERROR_MESSAGE,
      {
        httpStatus: response.status,
        contentType: response.headers.get("content-type") ?? undefined,
        contentLength: response.headers.get("content-length"),
      },
    );
  }

  const headerType = normalizeImageContentType(
    response.headers.get("content-type"),
  );
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const kind = detectImageKindFromBytes(bytes);
  const sig =
    process.env.NODE_ENV === "development"
      ? signatureHexPreview(bytes, 4)
      : undefined;

  stage(onStage, "asset_blob_validation", {
    headerContentType: headerType,
    byteLength: bytes.length,
    signature: sig,
    redirected: response.redirected,
    looksLikeJsonOrText: isProbablyJsonOrText(bytes),
    detectedKind: kind,
    assetId: meta.assetId,
    generationId: meta.generationId,
  });

  if (bytes.length === 0) {
    throw new GeneratedImageLoadError("EMPTY_IMAGE_BLOB");
  }

  if (isProbablyJsonOrText(bytes) || !kind) {
    throw new GeneratedImageLoadError(
      "INVALID_IMAGE_BYTES",
      CANVAS_INSERT_ERROR_MESSAGE,
      { contentType: headerType || "unknown" },
    );
  }

  const contentType = mimeFromImageKind(kind);
  if (headerType && !headerType.startsWith("image/")) {
    throw new GeneratedImageLoadError(
      `INVALID_CONTENT_TYPE:${headerType}`,
      CANVAS_INSERT_ERROR_MESSAGE,
      { contentType: headerType },
    );
  }

  // Ensure Blob.type is a real image MIME — Safari can leave it empty.
  const blob = new Blob([bytes], { type: contentType });
  if (!blob.type.startsWith("image/")) {
    throw new GeneratedImageLoadError(
      `INVALID_BLOB_TYPE:${blob.type || "empty"}`,
      CANVAS_INSERT_ERROR_MESSAGE,
      { contentType: blob.type },
    );
  }
  if (blob.size === 0) {
    throw new GeneratedImageLoadError("EMPTY_IMAGE_BLOB");
  }

  stage(onStage, "browser_decode", {
    event: "createImageBitmap_start",
    blobType: blob.type,
    blobSize: blob.size,
  });
  await verifyBrowserCanDecode(blob);
  stage(onStage, "browser_decode", {
    event: "createImageBitmap_ok",
    blobType: blob.type,
    blobSize: blob.size,
  });

  return { blob, contentType, blobSize: blob.size };
}

/**
 * Load a generated asset into Fabric via authenticated same-origin bytes → Blob → object URL.
 * Do NOT revoke the object URL until the Fabric object is removed or the canvas is disposed.
 */
export async function loadFabricImageForAsset(
  options: LoadOptions,
): Promise<LoadedFabricImage> {
  const objectId = createObjectId();
  const onStage = options.onStage;

  if (options.preferSameOrigin !== false && options.assetId) {
    const sameOriginUrl = `/api/assets/${options.assetId}/content`;
    try {
      stage(onStage, "asset_fetch", {
        event: "same_origin_start",
        assetId: options.assetId,
        generationId: options.generationId,
      });
      const response = await fetch(sameOriginUrl, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      const validated = await validateFetchedImageResponse(response, onStage, {
        assetId: options.assetId,
        generationId: options.generationId,
      });

      const { image, objectUrl } = await fabricFromBlob(validated.blob, onStage);
      registerObjectUrl(objectId, objectUrl);

      return {
        image,
        objectId,
        objectUrl,
        source: "same-origin-blob",
        contentType: validated.contentType,
        blobSize: validated.blobSize,
        width: image.width || 0,
        height: image.height || 0,
      };
    } catch (error) {
      stage(onStage, "asset_fetch", {
        event: "same_origin_failed",
        code: error instanceof GeneratedImageLoadError ? error.code : "unknown",
        httpStatus:
          error instanceof GeneratedImageLoadError ? error.httpStatus : undefined,
        assetId: options.assetId,
      });
      if (!options.signedUrl && !options.refreshSignedUrl) {
        if (error instanceof GeneratedImageLoadError) throw error;
        throw new GeneratedImageLoadError(
          "FABRIC_IMAGE_LOAD_FAILED",
          CANVAS_INSERT_ERROR_MESSAGE,
        );
      }
      // Fall through to signed URL blob path
    }
  }

  return loadViaSignedBlob(options, objectId, false);
}

async function loadViaSignedBlob(
  options: LoadOptions,
  objectId: string,
  alreadyRefreshed: boolean,
): Promise<LoadedFabricImage> {
  const onStage = options.onStage;
  let signedUrl = options.signedUrl ?? null;
  if (!signedUrl && options.refreshSignedUrl) {
    signedUrl = await options.refreshSignedUrl();
  }
  if (!signedUrl) {
    throw new GeneratedImageLoadError("SIGNED_URL_MISSING");
  }

  let objectUrl: string | null = null;
  try {
    stage(onStage, "asset_fetch", { event: "signed_url_fetch_start" });
    const response = await fetch(signedUrl, {
      method: "GET",
      cache: "no-store",
    });
    const validated = await validateFetchedImageResponse(response, onStage, {
      assetId: options.assetId,
      generationId: options.generationId,
    });
    const loaded = await fabricFromBlob(validated.blob, onStage);
    objectUrl = loaded.objectUrl;
    registerObjectUrl(objectId, objectUrl);
    return {
      image: loaded.image,
      objectId,
      objectUrl,
      source: "signed-blob",
      contentType: validated.contentType,
      blobSize: validated.blobSize,
      width: loaded.image.width || 0,
      height: loaded.image.height || 0,
    };
  } catch (error) {
    const isExpired =
      error instanceof GeneratedImageLoadError &&
      (error.code.startsWith("ASSET_FETCH_FAILED") ||
        error.code === "SIGNED_URL_DOWNLOAD_FAILED") &&
      (error.httpStatus === 400 ||
        error.httpStatus === 401 ||
        error.httpStatus === 403 ||
        error.httpStatus === 404);

    if (isExpired && !alreadyRefreshed && options.refreshSignedUrl) {
      revokeObjectUrlSafe(objectUrl);
      const fresh = await options.refreshSignedUrl();
      if (fresh) {
        return loadViaSignedBlob(
          { ...options, signedUrl: fresh },
          objectId,
          true,
        );
      }
    }

    revokeObjectUrlSafe(objectUrl);
    if (error instanceof GeneratedImageLoadError) throw error;
    throw new GeneratedImageLoadError(
      "FABRIC_IMAGE_LOAD_FAILED",
      CANVAS_INSERT_ERROR_MESSAGE,
    );
  }
}

/** @deprecated Prefer loadFabricImageForAsset */
export async function loadFabricImageFromSignedUrl(
  signedUrl: string,
  options?: Omit<LoadOptions, "preferSameOrigin" | "signedUrl">,
): Promise<LoadedFabricImage> {
  return loadFabricImageForAsset({
    ...options,
    signedUrl,
    preferSameOrigin: Boolean(options?.assetId),
  });
}

export function describeSignedUrlForLogs(url: string): {
  origin: string;
  pathname: string;
} {
  try {
    const parsed = new URL(url);
    return { origin: parsed.origin, pathname: parsed.pathname };
  } catch {
    return { origin: "invalid", pathname: "invalid" };
  }
}

/**
 * Strip ephemeral blob:/data: src from Fabric image serialization.
 * Persist assetId / storage metadata; prefer same-origin content URL for reload.
 */
export function sanitizeCanvasJsonForSave(json: unknown): unknown {
  if (!json || typeof json !== "object") return json;
  const clone = JSON.parse(JSON.stringify(json)) as {
    objects?: Array<Record<string, unknown>>;
  };
  if (!Array.isArray(clone.objects)) return clone;
  for (const obj of clone.objects) {
    const src = typeof obj.src === "string" ? obj.src : null;
    const ephemeral =
      !!src && (src.startsWith("blob:") || src.startsWith("data:"));
    if (ephemeral) {
      delete obj.src;
    }
    delete obj._objectUrl;
    delete obj.objectUrl;

    const assetId = typeof obj.assetId === "string" ? obj.assetId : null;
    if (assetId && (ephemeral || !obj.src)) {
      obj.src = `/api/assets/${assetId}/content`;
    }
  }
  return clone;
}

/** Finite cover/contain scale for fitting a generated image into the AI region. */
export function computeGeneratedImageScale(
  imageWidth: number,
  imageHeight: number,
  targetWidth: number,
  targetHeight: number,
  fit: "cover" | "contain",
): number {
  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    !Number.isFinite(targetWidth) ||
    !Number.isFinite(targetHeight) ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    throw new GeneratedImageLoadError("INVALID_IMAGE_SCALE");
  }
  const scaleX = targetWidth / imageWidth;
  const scaleY = targetHeight / imageHeight;
  const scale =
    fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new GeneratedImageLoadError("INVALID_IMAGE_SCALE");
  }
  return scale;
}

/**
 * After loadFromJSON, restore images that have assetId but no usable src.
 */
export async function rehydrateAssetImages(canvas: {
  getObjects: () => Array<{
    assetId?: string;
    objectId?: string;
    getSrc?: () => string;
    setElement?: (el: HTMLImageElement) => void;
    setCoords?: () => void;
  }>;
  requestRenderAll: () => void;
}): Promise<void> {
  for (const obj of canvas.getObjects()) {
    const assetId = obj.assetId;
    if (!assetId || typeof obj.setElement !== "function") continue;
    const src = typeof obj.getSrc === "function" ? obj.getSrc() : "";
    if (src && !src.startsWith("blob:") && !src.startsWith("data:")) continue;

    try {
      const loaded = await loadFabricImageForAsset({
        assetId,
        preferSameOrigin: true,
      });
      const el = loaded.image.getElement();
      if (!el) continue;
      obj.setElement(el as HTMLImageElement);
      obj.setCoords?.();
      if (loaded.objectUrl) {
        const keepId = obj.objectId ?? loaded.objectId;
        registerObjectUrl(keepId, loaded.objectUrl);
        if (obj.objectId && obj.objectId !== loaded.objectId) {
          const { releaseObjectUrlKey } = await import(
            "@/lib/canvas/object-url-registry"
          );
          releaseObjectUrlKey(loaded.objectId);
        }
      }
    } catch {
      // Leave existing object; editor remains usable.
    }
  }
  canvas.requestRenderAll();
}

export function getFabricVersionForLogs(): string {
  return FABRIC_VERSION;
}
