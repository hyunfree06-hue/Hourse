import { FabricImage } from "fabric";
import { GeneratedImageLoadError } from "@/lib/canvas/fetch-signed-image";
import { registerObjectUrl } from "@/lib/canvas/object-url-registry";
import { createObjectId } from "@/lib/canvas/custom-properties";

export type GenerationTargetBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type GeneratedImageFit = "cover" | "contain";

export type BakedCropGeometry = {
  /** Source crop rect (cover) or full source (contain). */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Destination draw rect inside the output canvas. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  outWidth: number;
  outHeight: number;
};

const MAX_OUTPUT_EDGE = 1024;

/**
 * High-res output size matching target aspect, capped at MAX_OUTPUT_EDGE.
 */
export function computeBakeOutputSize(
  targetWidth: number,
  targetHeight: number,
  maxEdge = MAX_OUTPUT_EDGE,
): { width: number; height: number } {
  if (
    !Number.isFinite(targetWidth) ||
    !Number.isFinite(targetHeight) ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    throw new GeneratedImageLoadError("INVALID_SELECTION_BOUNDS");
  }
  const ratio = targetWidth / targetHeight;
  if (ratio >= 1) {
    const width = maxEdge;
    const height = Math.max(1, Math.round(maxEdge / ratio));
    return { width, height };
  }
  const height = maxEdge;
  const width = Math.max(1, Math.round(maxEdge * ratio));
  return { width, height };
}

/**
 * Cover/contain geometry in source + output pixel space (no Fabric clipPath).
 */
export function computeBakeCropGeometry(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  fit: GeneratedImageFit,
): BakedCropGeometry {
  if (
    ![sourceWidth, sourceHeight, targetWidth, targetHeight].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  ) {
    throw new GeneratedImageLoadError("INVALID_SELECTION_BOUNDS");
  }

  const { width: outWidth, height: outHeight } = computeBakeOutputSize(
    targetWidth,
    targetHeight,
  );
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;

  if (fit === "cover") {
    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;
    if (sourceRatio > targetRatio) {
      sw = sourceHeight * targetRatio;
      sx = (sourceWidth - sw) / 2;
    } else {
      sh = sourceWidth / targetRatio;
      sy = (sourceHeight - sh) / 2;
    }
    return {
      sx,
      sy,
      sw,
      sh,
      dx: 0,
      dy: 0,
      dw: outWidth,
      dh: outHeight,
      outWidth,
      outHeight,
    };
  }

  // contain — full source letterboxed into output
  const scale = Math.min(outWidth / sourceWidth, outHeight / sourceHeight);
  const dw = sourceWidth * scale;
  const dh = sourceHeight * scale;
  return {
    sx: 0,
    sy: 0,
    sw: sourceWidth,
    sh: sourceHeight,
    dx: (outWidth - dw) / 2,
    dy: (outHeight - dh) / 2,
    dw,
    dh,
    outWidth,
    outHeight,
  };
}

export type SourceImageLike = {
  naturalWidth?: number;
  naturalHeight?: number;
  width?: number;
  height?: number;
};

function readSourceSize(source: SourceImageLike): {
  width: number;
  height: number;
} {
  const width = Number(source.naturalWidth || source.width || 0);
  const height = Number(source.naturalHeight || source.height || 0);
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new GeneratedImageLoadError("FABRIC_IMAGE_HAS_INVALID_DIMENSIONS");
  }
  return { width, height };
}

/**
 * Bake cover/contain crop into an offscreen canvas → PNG Blob.
 * No clipPath is involved.
 */
export async function bakeGeneratedImageToBlob(
  source: SourceImageLike,
  target: Pick<GenerationTargetBounds, "width" | "height">,
  fit: GeneratedImageFit,
  backgroundColor = "rgba(0,0,0,0)",
): Promise<{ blob: Blob; width: number; height: number; geometry: BakedCropGeometry }> {
  const size = readSourceSize(source);
  const geometry = computeBakeCropGeometry(
    size.width,
    size.height,
    target.width,
    target.height,
    fit,
  );

  const canvas = document.createElement("canvas");
  canvas.width = geometry.outWidth;
  canvas.height = geometry.outHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new GeneratedImageLoadError("BAKE_CANVAS_UNAVAILABLE");
  }

  ctx.clearRect(0, 0, geometry.outWidth, geometry.outHeight);
  if (fit === "contain") {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, geometry.outWidth, geometry.outHeight);
  }

  ctx.drawImage(
    source as CanvasImageSource,
    geometry.sx,
    geometry.sy,
    geometry.sw,
    geometry.sh,
    geometry.dx,
    geometry.dy,
    geometry.dw,
    geometry.dh,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result || result.size === 0) {
          reject(new GeneratedImageLoadError("BAKE_BLOB_FAILED"));
          return;
        }
        resolve(result);
      },
      "image/png",
    );
  });

  return {
    blob,
    width: geometry.outWidth,
    height: geometry.outHeight,
    geometry,
  };
}

export type BakedFabricPlacement = {
  left: number;
  top: number;
  originX: "center";
  originY: "center";
  scaleX: number;
  scaleY: number;
  angle: number;
};

export function computeBakedImagePlacement(
  bakedWidth: number,
  bakedHeight: number,
  target: GenerationTargetBounds,
): BakedFabricPlacement {
  if (
    ![bakedWidth, bakedHeight, target.left, target.top, target.width, target.height].every(
      (n) => Number.isFinite(n),
    ) ||
    bakedWidth <= 0 ||
    bakedHeight <= 0 ||
    target.width <= 0 ||
    target.height <= 0
  ) {
    throw new GeneratedImageLoadError("INVALID_SELECTION_BOUNDS");
  }

  const scaleX = target.width / bakedWidth;
  const scaleY = target.height / bakedHeight;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    throw new GeneratedImageLoadError("INVALID_IMAGE_SCALE");
  }

  return {
    left: target.left + target.width / 2,
    top: target.top + target.height / 2,
    originX: "center",
    originY: "center",
    scaleX,
    scaleY,
    angle: 0,
  };
}

/**
 * Create a normal FabricImage from a baked PNG blob — no clipPath.
 */
export async function createBakedFabricImage(
  blob: Blob,
  placement: BakedFabricPlacement,
): Promise<{ image: FabricImage; objectId: string; objectUrl: string }> {
  const objectUrl = URL.createObjectURL(blob);
  const objectId = createObjectId();

  try {
    const element = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new GeneratedImageLoadError("FABRIC_IMAGE_DECODE_FAILED"));
      img.src = objectUrl;
    });

    const image = new FabricImage(element, {
      left: placement.left,
      top: placement.top,
      originX: placement.originX,
      originY: placement.originY,
      scaleX: placement.scaleX,
      scaleY: placement.scaleY,
      angle: placement.angle,
      selectable: true,
      evented: true,
    });

    // Explicitly ensure no clipPath remains attached.
    image.clipPath = undefined;
    image.set({ clipPath: undefined });
    image.setCoords();

    if (image.clipPath) {
      throw new GeneratedImageLoadError("GENERATED_IMAGE_STILL_HAS_CLIP_PATH");
    }

    registerObjectUrl(objectId, objectUrl);
    return { image, objectId, objectUrl };
  } catch (error) {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // ignore
    }
    throw error;
  }
}

/**
 * End-to-end: bake source → place as a normal FabricImage with no clipPath.
 */
export async function createBakedGeneratedFabricImage(input: {
  source: SourceImageLike;
  target: GenerationTargetBounds;
  fit: GeneratedImageFit;
  backgroundColor?: string;
}): Promise<{
  image: FabricImage;
  objectId: string;
  objectUrl: string;
  bakedWidth: number;
  bakedHeight: number;
}> {
  const baked = await bakeGeneratedImageToBlob(
    input.source,
    input.target,
    input.fit,
    input.backgroundColor,
  );
  const placement = computeBakedImagePlacement(
    baked.width,
    baked.height,
    input.target,
  );
  const created = await createBakedFabricImage(baked.blob, placement);
  return {
    ...created,
    bakedWidth: baked.width,
    bakedHeight: baked.height,
  };
}

type MigratableImage = {
  objectRole?: string;
  objectId?: string;
  assetId?: string;
  generationId?: string;
  name?: string;
  clipPath?: unknown;
  left?: number;
  top?: number;
  angle?: number;
  flipX?: boolean;
  flipY?: boolean;
  getElement?: () => CanvasImageSource | null;
  getScaledWidth: () => number;
  getScaledHeight: () => number;
  getCenterPoint?: () => { x: number; y: number };
  set: (options: Record<string, unknown>) => unknown;
  setCoords: () => void;
};

/**
 * Migrate legacy generated images that still carry a clipPath into baked normal images.
 */
export async function migrateClippedGeneratedImages(
  canvas: {
    getObjects: () => unknown[];
    add: (...o: unknown[]) => unknown;
    remove: (...o: unknown[]) => unknown;
    requestRenderAll: () => void;
  },
): Promise<number> {
  const candidates = (canvas.getObjects() as MigratableImage[]).filter(
    (obj) =>
      obj.objectRole === "generated" &&
      obj.clipPath != null &&
      typeof obj.getElement === "function",
  );

  let migrated = 0;
  for (const old of candidates) {
    try {
      const element = old.getElement?.() as SourceImageLike | null;
      if (!element) {
        old.clipPath = undefined;
        old.set({ clipPath: undefined });
        continue;
      }

      const visualW = Math.abs(old.getScaledWidth());
      const visualH = Math.abs(old.getScaledHeight());
      if (!visualW || !visualH) {
        old.clipPath = undefined;
        old.set({ clipPath: undefined });
        continue;
      }

      const center =
        typeof old.getCenterPoint === "function"
          ? old.getCenterPoint()
          : { x: old.left ?? 0, y: old.top ?? 0 };

      const target: GenerationTargetBounds = {
        left: center.x - visualW / 2,
        top: center.y - visualH / 2,
        width: visualW,
        height: visualH,
      };

      // Prefer cover bake of the underlying bitmap into the current visual aspect.
      const baked = await createBakedGeneratedFabricImage({
        source: element,
        target,
        fit: "cover",
      });

      baked.image.set({
        left: center.x,
        top: center.y,
        originX: "center",
        originY: "center",
        angle: old.angle ?? 0,
        flipX: old.flipX,
        flipY: old.flipY,
        objectRole: "generated",
        objectId: old.objectId ?? baked.objectId,
        assetId: old.assetId,
        generationId: old.generationId,
        name: old.name ?? "Generated image",
        sourceType: "ai-generated",
        clipPath: undefined,
      } as Record<string, unknown>);
      baked.image.clipPath = undefined;
      baked.image.setCoords();

      canvas.remove(old);
      canvas.add(baked.image);
      migrated += 1;
    } catch {
      // Last resort: strip clipPath so the object at least remains editable.
      try {
        old.clipPath = undefined;
        old.set({ clipPath: undefined });
        old.setCoords();
      } catch {
        // ignore
      }
    }
  }

  if (migrated > 0) {
    canvas.requestRenderAll();
  }
  return migrated;
}
