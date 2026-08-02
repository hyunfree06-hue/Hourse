import { FabricImage } from "fabric";
import {
  CANVAS_INSERT_ERROR_MESSAGE,
  fetchSignedImageAsObjectUrl,
  GeneratedImageLoadError,
  revokeObjectUrlSafe,
} from "@/lib/canvas/fetch-signed-image";
import { registerObjectUrl } from "@/lib/canvas/object-url-registry";
import { createObjectId } from "@/lib/canvas/custom-properties";

export { CANVAS_INSERT_ERROR_MESSAGE, GeneratedImageLoadError };

export type LoadedFabricImage = {
  image: FabricImage;
  objectId: string;
  /** Runtime blob URL if used — do not serialize. Kept until object remove/dispose. */
  objectUrl: string | null;
  source: "same-origin-blob" | "signed-blob";
};

type LoadOptions = {
  assetId?: string;
  preferSameOrigin?: boolean;
  signedUrl?: string | null;
  refreshSignedUrl?: () => Promise<string | null>;
  onDebug?: (event: string, data?: Record<string, unknown>) => void;
};

function debug(
  onDebug: LoadOptions["onDebug"],
  event: string,
  data?: Record<string, unknown>,
) {
  onDebug?.(event, data);
}

async function fabricFromBlobUrl(
  objectUrl: string,
  onDebug: LoadOptions["onDebug"],
): Promise<FabricImage> {
  debug(onDebug, "fabric_fromURL_start", { hasCrossOrigin: false });
  // Safari: never pass crossOrigin for blob: URLs.
  const image = await FabricImage.fromURL(objectUrl);
  debug(onDebug, "fabric_fromURL_complete", {
    width: image.width,
    height: image.height,
  });
  if (!image.width || !image.height) {
    throw new GeneratedImageLoadError("FABRIC_IMAGE_DECODE_FAILED");
  }
  return image;
}

/**
 * Load a generated asset into Fabric via Blob → object URL.
 * Prefer same-origin `/api/assets/:id/content` (authenticated, Safari-safe).
 * Do NOT revoke the object URL until the Fabric object is removed or canvas disposed.
 */
export async function loadFabricImageForAsset(
  options: LoadOptions,
): Promise<LoadedFabricImage> {
  const objectId = createObjectId();
  const onDebug = options.onDebug;

  if (options.preferSameOrigin !== false && options.assetId) {
    const sameOriginUrl = `/api/assets/${options.assetId}/content`;
    try {
      debug(onDebug, "same_origin_fetch_start", { assetId: options.assetId });
      const response = await fetch(sameOriginUrl, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      const contentType = response.headers.get("content-type") ?? "";
      const contentLength = response.headers.get("content-length");
      debug(onDebug, "same_origin_fetch_status", {
        status: response.status,
        contentType,
        contentLength,
      });

      if (!response.ok) {
        throw new GeneratedImageLoadError(
          `ASSET_DOWNLOAD_FAILED:${response.status}`,
          CANVAS_INSERT_ERROR_MESSAGE,
          { httpStatus: response.status, contentType, contentLength },
        );
      }

      const blob = await response.blob();
      debug(onDebug, "same_origin_blob", {
        blobSize: blob.size,
        blobType: blob.type || contentType,
      });

      if (!(blob.type || contentType).toLowerCase().startsWith("image/")) {
        throw new GeneratedImageLoadError("INVALID_GENERATED_IMAGE_TYPE", undefined, {
          contentType: blob.type || contentType,
        });
      }
      if (blob.size === 0) {
        throw new GeneratedImageLoadError("EMPTY_GENERATED_IMAGE");
      }

      const objectUrl = URL.createObjectURL(blob);
      debug(onDebug, "object_url_created", { source: "same-origin-blob" });
      try {
        const image = await fabricFromBlobUrl(objectUrl, onDebug);
        registerObjectUrl(objectId, objectUrl);
        return {
          image,
          objectId,
          objectUrl,
          source: "same-origin-blob",
        };
      } catch (error) {
        revokeObjectUrlSafe(objectUrl);
        throw error;
      }
    } catch (error) {
      debug(onDebug, "same_origin_failed", {
        code: error instanceof GeneratedImageLoadError ? error.code : "unknown",
        httpStatus:
          error instanceof GeneratedImageLoadError ? error.httpStatus : undefined,
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
  const onDebug = options.onDebug;
  let signedUrl = options.signedUrl ?? null;
  if (!signedUrl && options.refreshSignedUrl) {
    signedUrl = await options.refreshSignedUrl();
  }
  if (!signedUrl) {
    throw new GeneratedImageLoadError("SIGNED_URL_MISSING");
  }

  let objectUrl: string | null = null;
  try {
    debug(onDebug, "signed_url_fetch_start");
    const fetched = await fetchSignedImageAsObjectUrl(signedUrl);
    objectUrl = fetched.objectUrl;
    debug(onDebug, "signed_url_fetch_complete", {
      status: 200,
      contentType: fetched.contentType,
      blobSize: fetched.blob.size,
      blobType: fetched.blob.type,
      objectUrlCreated: true,
    });

    if (!fetched.blob.type.startsWith("image/")) {
      throw new GeneratedImageLoadError("INVALID_GENERATED_IMAGE_TYPE", undefined, {
        contentType: fetched.blob.type,
      });
    }
    if (fetched.blob.size === 0) {
      throw new GeneratedImageLoadError("EMPTY_GENERATED_IMAGE");
    }

    const image = await fabricFromBlobUrl(objectUrl, onDebug);
    registerObjectUrl(objectId, objectUrl);
    return {
      image,
      objectId,
      objectUrl,
      source: "signed-blob",
    };
  } catch (error) {
    const isExpired =
      error instanceof GeneratedImageLoadError &&
      (error.code === "SIGNED_URL_DOWNLOAD_FAILED" ||
        error.code.startsWith("ASSET_DOWNLOAD_FAILED")) &&
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
      // Same-origin, no signed-token leakage — Safari-safe on reload.
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
    throw new GeneratedImageLoadError("INVALID_GENERATED_IMAGE_SCALE");
  }
  const scaleX = targetWidth / imageWidth;
  const scaleY = targetHeight / imageHeight;
  const scale =
    fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new GeneratedImageLoadError("INVALID_GENERATED_IMAGE_SCALE");
  }
  return scale;
}

/**
 * After loadFromJSON, restore images that have assetId but no usable src
 * (e.g. older saves that stripped blob URLs without a same-origin fallback).
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
