import { DesignGenerationError } from "@/lib/design-scene/errors";

/** Preferred minimum for any editable Design frame. */
export const MIN_DESIGN_WIDTH = 320;
export const MIN_DESIGN_HEIGHT = 240;

/** Soft recommendation for logo + wordmark compositions. */
export const RECOMMENDED_DESIGN_WIDTH = 600;
export const RECOMMENDED_DESIGN_HEIGHT = 300;

export function isDesignRegionLargeEnough(width: number, height: number): boolean {
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
