import { FabricImage } from "fabric";
import {
  CANVAS_INSERT_ERROR_MESSAGE,
  fetchSignedImageAsObjectUrl,
  GeneratedImageLoadError,
  revokeObjectUrlSafe,
} from "@/lib/canvas/fetch-signed-image";

export { CANVAS_INSERT_ERROR_MESSAGE, GeneratedImageLoadError };

export type LoadedFabricImage = {
  image: FabricImage;
  /** Call after the image has been added to the canvas and rendered. */
  revoke: () => void;
};

type LoadOptions = {
  /** Called when the first signed URL appears expired/forbidden — return a fresh URL or null. */
  refreshSignedUrl?: () => Promise<string | null>;
};

/**
 * Fabric.js v7: FabricImage.fromURL returns a Promise.
 * Load via blob object URL to avoid Supabase Storage CORS failures on signed URLs.
 */
export async function loadFabricImageFromSignedUrl(
  signedUrl: string,
  options?: LoadOptions,
): Promise<LoadedFabricImage> {
  return loadWithOptionalRefresh(signedUrl, options, false);
}

async function loadWithOptionalRefresh(
  signedUrl: string,
  options: LoadOptions | undefined,
  alreadyRefreshed: boolean,
): Promise<LoadedFabricImage> {
  let objectUrl: string | null = null;
  let transferred = false;

  try {
    const fetched = await fetchSignedImageAsObjectUrl(signedUrl);
    objectUrl = fetched.objectUrl;

    // Fabric v7 Promise API — do not use callback-style fromURL
    const image = await FabricImage.fromURL(objectUrl);

    if (!image.width || !image.height) {
      throw new GeneratedImageLoadError("IMAGE_DECODE_FAILED");
    }

    const element = image.getElement();
    if (element instanceof HTMLImageElement) {
      await waitForImageComplete(element);
    }

    transferred = true;
    const urlToRevoke = objectUrl;
    objectUrl = null;

    return {
      image,
      revoke: () => revokeObjectUrlSafe(urlToRevoke),
    };
  } catch (error) {
    if (!transferred) {
      revokeObjectUrlSafe(objectUrl);
    }

    const isExpired =
      error instanceof GeneratedImageLoadError &&
      error.code === "SIGNED_URL_DOWNLOAD_FAILED" &&
      (error.httpStatus === 400 ||
        error.httpStatus === 401 ||
        error.httpStatus === 403 ||
        error.httpStatus === 404);

    if (isExpired && !alreadyRefreshed && options?.refreshSignedUrl) {
      const fresh = await options.refreshSignedUrl();
      if (fresh) {
        return loadWithOptionalRefresh(fresh, options, true);
      }
    }

    if (error instanceof GeneratedImageLoadError) {
      throw error;
    }

    throw new GeneratedImageLoadError(
      "FABRIC_IMAGE_LOAD_FAILED",
      CANVAS_INSERT_ERROR_MESSAGE,
    );
  }
}

function waitForImageComplete(img: HTMLImageElement): Promise<void> {
  if (img.complete && img.naturalWidth > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new GeneratedImageLoadError("IMAGE_DECODE_FAILED"));
    };
    const cleanup = () => {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
    };
    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);
  });
}

/**
 * Safe diagnostics for logs — never include the signed token/query string.
 */
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
