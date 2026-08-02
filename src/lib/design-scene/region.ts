import type { FabricObject } from "fabric";
import { DesignGenerationError } from "@/lib/design-scene/errors";

/** Canonical default Design / AI region size (click-to-create). */
export const DEFAULT_DESIGN_REGION = {
  width: 320,
  height: 240,
} as const;

/** Canonical minimum Design / AI region size (generation + clamp). */
export const MIN_DESIGN_REGION = {
  width: 320,
  height: 240,
} as const;

export const MIN_DESIGN_WIDTH = MIN_DESIGN_REGION.width;
export const MIN_DESIGN_HEIGHT = MIN_DESIGN_REGION.height;

/** Soft recommendation for logo + wordmark compositions. */
export const RECOMMENDED_DESIGN_WIDTH = 600;
export const RECOMMENDED_DESIGN_HEIGHT = 300;

/** Movement below this (scene units) counts as a click, not a drag. */
export const AI_REGION_CLICK_THRESHOLD = 4;

export function isDesignRegionLargeEnough(
  width: number,
  height: number,
): boolean {
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= MIN_DESIGN_WIDTH &&
    height >= MIN_DESIGN_HEIGHT
  );
}

export function assertDesignRegionSize(
  width: number,
  height: number,
  requestId?: string,
): void {
  if (isDesignRegionLargeEnough(width, height)) return;
  throw new DesignGenerationError("DESIGN_REGION_TOO_SMALL", {
    stage: "region_validation",
    requestId,
    internalReason: "REGION_BELOW_MINIMUM",
    details: {
      width: Math.round(width),
      height: Math.round(height),
      minWidth: MIN_DESIGN_WIDTH,
      minHeight: MIN_DESIGN_HEIGHT,
    },
  });
}

export type RegionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Keep the full region inside canvas bounds. */
export function clampRegionToCanvas(
  region: RegionRect,
  canvasWidth: number,
  canvasHeight: number,
): RegionRect {
  const width = Math.min(region.width, canvasWidth);
  const height = Math.min(region.height, canvasHeight);
  const left = Math.min(
    Math.max(0, region.left),
    Math.max(0, canvasWidth - width),
  );
  const top = Math.min(
    Math.max(0, region.top),
    Math.max(0, canvasHeight - height),
  );
  return { left, top, width, height };
}

/** Place a region centered on a click, clamped inside the canvas. */
export function centeredRegionAt(
  clickX: number,
  clickY: number,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number,
): RegionRect {
  return clampRegionToCanvas(
    {
      left: clickX - width / 2,
      top: clickY - height / 2,
      width,
      height,
    },
    canvasWidth,
    canvasHeight,
  );
}

/**
 * Expand a dragged region to the minimum while preserving aspect ratio.
 * Pure click sizes should use DEFAULT_DESIGN_REGION instead.
 */
export function expandRegionToMinimum(
  width: number,
  height: number,
): { width: number; height: number } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  if (w >= MIN_DESIGN_WIDTH && h >= MIN_DESIGN_HEIGHT) {
    return { width: w, height: h };
  }
  const scale = Math.max(MIN_DESIGN_WIDTH / w, MIN_DESIGN_HEIGHT / h);
  return { width: w * scale, height: h * scale };
}

/** Resize around the current center. */
export function resizeRegionAboutCenter(
  region: RegionRect,
  nextWidth: number,
  nextHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): RegionRect {
  const cx = region.left + region.width / 2;
  const cy = region.top + region.height / 2;
  return clampRegionToCanvas(
    {
      left: cx - nextWidth / 2,
      top: cy - nextHeight / 2,
      width: nextWidth,
      height: nextHeight,
    },
    canvasWidth,
    canvasHeight,
  );
}

export function isAiRegionFabricObject(
  object: FabricObject | null | undefined,
): boolean {
  if (!object) return false;
  const anyObj = object as FabricObject & {
    objectRole?: string;
    name?: string;
    get?: (key: string) => unknown;
  };
  const role =
    (typeof anyObj.get === "function"
      ? anyObj.get("objectRole")
      : undefined) ?? anyObj.objectRole;
  const name =
    (typeof anyObj.get === "function" ? anyObj.get("name") : undefined) ??
    anyObj.name;
  return role === "ai-region" || name === "AI region";
}

/** Visual bounds with scale baked in (preferred AI-region model). */
export function getVisualSize(object: FabricObject): {
  width: number;
  height: number;
} {
  const width = Math.max(
    1,
    (object.width ?? 0) * (object.scaleX ?? 1) || object.getScaledWidth(),
  );
  const height = Math.max(
    1,
    (object.height ?? 0) * (object.scaleY ?? 1) || object.getScaledHeight(),
  );
  return { width, height };
}

/**
 * Bake scale into width/height so W/H always match the visual size.
 * Preferred model for the temporary AI region.
 */
export function normalizeFabricObjectScale(object: FabricObject): void {
  const width = Math.max(1, (object.width ?? 0) * (object.scaleX ?? 1));
  const height = Math.max(1, (object.height ?? 0) * (object.scaleY ?? 1));
  object.set({
    width,
    height,
    scaleX: 1,
    scaleY: 1,
  });
  object.setCoords();
}

export function applyAiRegionSize(
  object: FabricObject,
  next: { width: number; height: number; left?: number; top?: number },
): void {
  object.set({
    scaleX: 1,
    scaleY: 1,
    width: Math.max(1, next.width),
    height: Math.max(1, next.height),
    ...(next.left !== undefined ? { left: next.left } : {}),
    ...(next.top !== undefined ? { top: next.top } : {}),
  });
  object.setCoords();
}

export function finalizeAiRegionAfterDrag(input: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  canvasWidth: number;
  canvasHeight: number;
}): RegionRect {
  const dragW = Math.abs(input.endX - input.startX);
  const dragH = Math.abs(input.endY - input.startY);
  const isClick =
    dragW < AI_REGION_CLICK_THRESHOLD && dragH < AI_REGION_CLICK_THRESHOLD;

  if (isClick) {
    return centeredRegionAt(
      input.startX,
      input.startY,
      DEFAULT_DESIGN_REGION.width,
      DEFAULT_DESIGN_REGION.height,
      input.canvasWidth,
      input.canvasHeight,
    );
  }

  const left = Math.min(input.startX, input.endX);
  const top = Math.min(input.startY, input.endY);
  const expanded = expandRegionToMinimum(dragW, dragH);
  // Keep the drag origin corner; expand away from it when growing to minimum.
  const growRight = input.endX >= input.startX;
  const growDown = input.endY >= input.startY;
  const nextLeft = growRight ? left : left + dragW - expanded.width;
  const nextTop = growDown ? top : top + dragH - expanded.height;

  return clampRegionToCanvas(
    {
      left: nextLeft,
      top: nextTop,
      width: expanded.width,
      height: expanded.height,
    },
    input.canvasWidth,
    input.canvasHeight,
  );
}
