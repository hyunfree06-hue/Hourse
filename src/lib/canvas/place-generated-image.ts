import { Rect, type FabricImage } from "fabric";
import { GeneratedImageLoadError } from "@/lib/canvas/fetch-signed-image";

export type GenerationTargetBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type GeneratedImageFit = "cover" | "contain";

export type GeneratedImagePlacement = {
  left: number;
  top: number;
  originX: "center";
  originY: "center";
  scaleX: number;
  scaleY: number;
  localClipWidth: number;
  localClipHeight: number;
};

/**
 * Compute cover/contain placement centered on the AI region.
 * Clip sizes are in the image's local (unscaled) coordinate system so a
 * relative clipPath moves/scales/rotates with the object.
 */
export function computeGeneratedImagePlacement(
  imageWidth: number,
  imageHeight: number,
  target: GenerationTargetBounds,
  fit: GeneratedImageFit,
): GeneratedImagePlacement {
  if (
    ![imageWidth, imageHeight, target.left, target.top, target.width, target.height].every(
      (n) => Number.isFinite(n),
    ) ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    target.width <= 0 ||
    target.height <= 0
  ) {
    throw new GeneratedImageLoadError("INVALID_SELECTION_BOUNDS");
  }

  const scaleX = target.width / imageWidth;
  const scaleY = target.height / imageHeight;
  const scale = fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);

  if (!Number.isFinite(scale) || scale <= 0) {
    throw new GeneratedImageLoadError("INVALID_IMAGE_SCALE");
  }

  // Canvas-space crop (target) → local image coords under object scale.
  const localClipWidth = target.width / scale;
  const localClipHeight = target.height / scale;

  if (
    !Number.isFinite(localClipWidth) ||
    !Number.isFinite(localClipHeight) ||
    localClipWidth <= 0 ||
    localClipHeight <= 0
  ) {
    throw new GeneratedImageLoadError("INVALID_SELECTION_BOUNDS");
  }

  return {
    left: target.left + target.width / 2,
    top: target.top + target.height / 2,
    originX: "center",
    originY: "center",
    scaleX: scale,
    scaleY: scale,
    localClipWidth,
    localClipHeight,
  };
}

/**
 * Independent object-relative clip — never absolutePositioned, never the AI-region Rect.
 */
export function createGeneratedImageClipPath(
  localClipWidth: number,
  localClipHeight: number,
): Rect {
  return new Rect({
    width: localClipWidth,
    height: localClipHeight,
    left: 0,
    top: 0,
    originX: "center",
    originY: "center",
    fill: "#000000",
    absolutePositioned: false,
    selectable: false,
    evented: false,
  });
}

export function applyGeneratedImagePlacement(
  image: FabricImage,
  placement: GeneratedImagePlacement,
): Rect {
  const clipPath = createGeneratedImageClipPath(
    placement.localClipWidth,
    placement.localClipHeight,
  );

  image.set({
    left: placement.left,
    top: placement.top,
    originX: placement.originX,
    originY: placement.originY,
    scaleX: placement.scaleX,
    scaleY: placement.scaleY,
    clipPath,
  });
  image.setCoords();
  return clipPath;
}

export function isAbsoluteClipPath(clip: { absolutePositioned?: boolean } | null | undefined) {
  return Boolean(clip?.absolutePositioned);
}
