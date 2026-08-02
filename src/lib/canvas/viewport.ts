import { Point, type Canvas, type FabricObject, type TMat2D } from "fabric";
import { editorConfig } from "@/config/editor";

export type ViewportBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type FitPadding =
  | number
  | { top?: number; right?: number; bottom?: number; left?: number };

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return editorConfig.minZoom;
  }
  return Math.min(editorConfig.maxZoom, Math.max(editorConfig.minZoom, zoom));
}

export function getViewportTransform(canvas: Canvas): TMat2D {
  const vpt = canvas.viewportTransform;
  if (!vpt) {
    return [1, 0, 0, 1, 0, 0];
  }
  return [...vpt] as TMat2D;
}

export function panCanvasBy(canvas: Canvas, dx: number, dy: number): void {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  canvas.relativePan(new Point(dx, dy));
  canvas.requestRenderAll();
}

/**
 * Zoom around a canvas-element point (offsetX/offsetY or pointer in element space).
 * Preserves the world point under the cursor.
 */
export function zoomCanvasToPoint(
  canvas: Canvas,
  point: { x: number; y: number },
  nextZoom: number,
): number {
  const zoom = clampZoom(nextZoom);
  const safePoint = new Point(
    Number.isFinite(point.x) ? point.x : canvas.getWidth() / 2,
    Number.isFinite(point.y) ? point.y : canvas.getHeight() / 2,
  );
  canvas.zoomToPoint(safePoint, zoom);
  canvas.requestRenderAll();
  return zoom;
}

export function zoomCanvasAtCenter(canvas: Canvas, nextZoom: number): number {
  return zoomCanvasToPoint(
    canvas,
    { x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 },
    nextZoom,
  );
}

export function resetViewport(canvas: Canvas): number {
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  canvas.requestRenderAll();
  return 1;
}

export function getObjectWorldBounds(object: FabricObject): ViewportBounds {
  object.setCoords();
  const rect = object.getBoundingRect();
  return {
    left: rect.left,
    top: rect.top,
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
  };
}

export function unionBounds(
  bounds: ViewportBounds[],
): ViewportBounds | null {
  if (bounds.length === 0) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const b of bounds) {
    left = Math.min(left, b.left);
    top = Math.min(top, b.top);
    right = Math.max(right, b.left + b.width);
    bottom = Math.max(bottom, b.top + b.height);
  }
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(right) ||
    !Number.isFinite(bottom)
  ) {
    return null;
  }
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export function isViewportMetaObject(object: FabricObject): boolean {
  const role = (object as FabricObject & { objectRole?: string }).objectRole;
  const name = (object as FabricObject & { name?: string }).name;
  const exclude =
    (object as FabricObject & { excludeFromExport?: boolean }).excludeFromExport ===
    true;
  const temporary =
    (object as FabricObject & { isTemporary?: boolean }).isTemporary === true;
  return (
    role === "artboard" ||
    role === "ai-region" ||
    role === "selection-overlay" ||
    role === "guide" ||
    name === "Artboard" ||
    name === "AI region" ||
    exclude ||
    temporary
  );
}

export function getContentBounds(
  canvas: Canvas,
  opts?: { includeArtboard?: boolean; selectedOnly?: boolean },
): ViewportBounds | null {
  const objects = opts?.selectedOnly
    ? canvas.getActiveObjects()
    : canvas.getObjects();
  const bounds = objects
    .filter((obj) => {
      if (opts?.includeArtboard) {
        const role = (obj as FabricObject & { objectRole?: string }).objectRole;
        if (role === "artboard") return true;
      }
      return !isViewportMetaObject(obj);
    })
    .filter((obj) => obj.visible !== false)
    .map((obj) => getObjectWorldBounds(obj));
  return unionBounds(bounds);
}

function normalizePadding(padding: FitPadding = 64): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  if (typeof padding === "number") {
    const p = Math.max(0, padding);
    return { top: p, right: p, bottom: p, left: p };
  }
  return {
    top: Math.max(0, padding.top ?? 64),
    right: Math.max(0, padding.right ?? 64),
    bottom: Math.max(0, padding.bottom ?? 64),
    left: Math.max(0, padding.left ?? 64),
  };
}

/**
 * Fit padding for the usable Fabric canvas element.
 * Left/right toolbars already shrink the canvas; overlays need extra inset.
 */
export function getEditorFitPadding(opts?: {
  aiPanelOpen?: boolean;
}): FitPadding {
  return {
    top: 48,
    left: 48,
    right: opts?.aiPanelOpen ? 400 : 72,
    bottom: opts?.aiPanelOpen ? 120 : 72,
  };
}

/**
 * Fit a world-space rect into the current canvas element with padding.
 */
export function fitBoundsInView(
  canvas: Canvas,
  bounds: ViewportBounds,
  padding: FitPadding = 64,
): number {
  const viewW = Math.max(1, canvas.getWidth());
  const viewH = Math.max(1, canvas.getHeight());
  const pad = normalizePadding(padding);
  const availW = Math.max(1, viewW - pad.left - pad.right);
  const availH = Math.max(1, viewH - pad.top - pad.bottom);
  const zoom = clampZoom(
    Math.min(availW / Math.max(1, bounds.width), availH / Math.max(1, bounds.height)),
  );
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const viewCenterX = pad.left + availW / 2;
  const viewCenterY = pad.top + availH / 2;
  const vpt: TMat2D = [
    zoom,
    0,
    0,
    zoom,
    viewCenterX - centerX * zoom,
    viewCenterY - centerY * zoom,
  ];
  canvas.setViewportTransform(vpt);
  canvas.requestRenderAll();
  return zoom;
}

export function fitArtboardInView(
  canvas: Canvas,
  artboard: { width: number; height: number },
  padding: FitPadding = 72,
): number {
  return fitBoundsInView(
    canvas,
    { left: 0, top: 0, width: artboard.width, height: artboard.height },
    padding,
  );
}

export function fitAllObjectsInView(
  canvas: Canvas,
  padding: FitPadding = 64,
): number {
  const bounds = getContentBounds(canvas, { includeArtboard: false });
  if (!bounds) {
    return resetViewport(canvas);
  }
  return fitBoundsInView(canvas, bounds, padding);
}

export function fitSelectionInView(
  canvas: Canvas,
  padding: FitPadding = 64,
): number {
  const bounds = getContentBounds(canvas, { selectedOnly: true });
  if (!bounds) {
    return fitAllObjectsInView(canvas, padding);
  }
  return fitBoundsInView(canvas, bounds, padding);
}

export function fitDesignFocusInView(
  canvas: Canvas,
  padding: FitPadding = 64,
): number {
  const selected = canvas.getActiveObjects().filter((obj) => !isViewportMetaObject(obj));
  if (selected.length > 0) {
    return fitSelectionInView(canvas, padding);
  }
  const aiRegion = canvas.getObjects().find((obj) => {
    const role = (obj as FabricObject & { objectRole?: string }).objectRole;
    return role === "ai-region";
  });
  if (aiRegion) {
    return fitBoundsInView(canvas, getObjectWorldBounds(aiRegion), padding);
  }
  const designObjects = canvas.getObjects().filter((obj) => {
    const role = (obj as FabricObject & { objectRole?: string }).objectRole;
    const source = (obj as FabricObject & { sourceType?: string }).sourceType;
    return (
      role === "design" ||
      role === "generated" ||
      source === "ai-design"
    );
  });
  if (designObjects.length > 0) {
    const bounds = unionBounds(
      designObjects.map((obj) => getObjectWorldBounds(obj)),
    );
    if (bounds) return fitBoundsInView(canvas, bounds, padding);
  }
  return fitAllObjectsInView(canvas, padding);
}

export function fitGenerationInView(
  canvas: Canvas,
  generationId: string,
  padding: FitPadding = 64,
): number {
  const objects = canvas.getObjects().filter((obj) => {
    const gid = (obj as FabricObject & { generationId?: string }).generationId;
    return gid === generationId && !isViewportMetaObject(obj);
  });
  const bounds = unionBounds(objects.map((obj) => getObjectWorldBounds(obj)));
  if (!bounds) {
    return fitAllObjectsInView(canvas, padding);
  }
  return fitBoundsInView(canvas, bounds, padding);
}

export function isBoundsFullyVisible(
  canvas: Canvas,
  bounds: ViewportBounds,
  margin = 24,
): boolean {
  const zoom = canvas.getZoom();
  const vpt = getViewportTransform(canvas);
  const left = bounds.left * zoom + vpt[4];
  const top = bounds.top * zoom + vpt[5];
  const right = (bounds.left + bounds.width) * zoom + vpt[4];
  const bottom = (bounds.top + bounds.height) * zoom + vpt[5];
  return (
    left >= margin &&
    top >= margin &&
    right <= canvas.getWidth() - margin &&
    bottom <= canvas.getHeight() - margin
  );
}

/**
 * Reveal objects after generation. Pans when they fit at current zoom;
 * otherwise fits with padding. Never fires autosave side-effects.
 */
export function revealObjectsInView(
  canvas: Canvas,
  objects: FabricObject[],
  padding: FitPadding = 64,
): number {
  const bounds = unionBounds(
    objects
      .filter((obj) => obj.visible !== false)
      .map((obj) => getObjectWorldBounds(obj)),
  );
  if (!bounds) return clampZoom(canvas.getZoom());

  const pad = normalizePadding(padding);
  const margin = Math.min(pad.top, pad.right, pad.bottom, pad.left) / 2;
  if (isBoundsFullyVisible(canvas, bounds, Math.max(16, margin))) {
    return clampZoom(canvas.getZoom());
  }

  const viewW = Math.max(1, canvas.getWidth());
  const viewH = Math.max(1, canvas.getHeight());
  const availW = Math.max(1, viewW - pad.left - pad.right);
  const availH = Math.max(1, viewH - pad.top - pad.bottom);
  const needed = Math.min(
    availW / Math.max(1, bounds.width),
    availH / Math.max(1, bounds.height),
  );
  const current = clampZoom(canvas.getZoom());

  // Content fits at current zoom — pan only (avoid extreme zoom-in).
  if (needed >= current * 0.95) {
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const viewCenterX = pad.left + availW / 2;
    const viewCenterY = pad.top + availH / 2;
    canvas.setViewportTransform([
      current,
      0,
      0,
      current,
      viewCenterX - centerX * current,
      viewCenterY - centerY * current,
    ]);
    canvas.requestRenderAll();
    return current;
  }

  return fitBoundsInView(canvas, bounds, padding);
}

/** Convert a wheel event into pan deltas (trackpad-friendly). */
export function wheelPanDelta(e: WheelEvent): { dx: number; dy: number } {
  let dx = e.deltaX;
  let dy = e.deltaY;
  if (e.shiftKey && dx === 0) {
    // Shift+wheel commonly maps vertical wheel to horizontal pan.
    dx = dy;
    dy = 0;
  }
  if (e.deltaMode === 1) {
    dx *= 16;
    dy *= 16;
  } else if (e.deltaMode === 2) {
    dx *= 32;
    dy *= 32;
  }
  return {
    dx: dx === 0 ? 0 : -dx,
    dy: dy === 0 ? 0 : -dy,
  };
}
