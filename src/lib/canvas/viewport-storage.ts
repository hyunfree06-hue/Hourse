import type { TMat2D } from "fabric";
import { editorConfig } from "@/config/editor";
import { clampZoom } from "@/lib/canvas/viewport";

export type StoredViewport = {
  zoom: number;
  viewportTransform: TMat2D;
};

function storageKey(projectId: string): string {
  return `${editorConfig.viewportStoragePrefix}${projectId}`;
}

function isValidMat(vpt: unknown): vpt is TMat2D {
  return (
    Array.isArray(vpt) &&
    vpt.length === 6 &&
    vpt.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    vpt[0] !== 0 &&
    vpt[3] !== 0
  );
}

export function loadStoredViewport(projectId: string): StoredViewport | null {
  if (!projectId || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredViewport>;
    if (!isValidMat(parsed.viewportTransform)) return null;
    const zoom = clampZoom(
      typeof parsed.zoom === "number" ? parsed.zoom : parsed.viewportTransform[0],
    );
    // Keep matrix scale in sync with clamped zoom.
    const vpt = [...parsed.viewportTransform] as TMat2D;
    if (Math.abs(vpt[0] - zoom) > 1e-6 || Math.abs(vpt[3] - zoom) > 1e-6) {
      const sx = vpt[0] || 1;
      const sy = vpt[3] || 1;
      vpt[0] = zoom;
      vpt[3] = zoom;
      // Preserve world point that was at viewport origin when possible.
      if (Number.isFinite(sx) && sx !== 0) {
        const worldX = -vpt[4] / sx;
        const worldY = -vpt[5] / sy;
        vpt[4] = -worldX * zoom;
        vpt[5] = -worldY * zoom;
      }
    }
    return { zoom, viewportTransform: vpt };
  } catch {
    return null;
  }
}

export function saveStoredViewport(
  projectId: string,
  viewport: StoredViewport,
): void {
  if (!projectId || typeof localStorage === "undefined") return;
  const zoom = clampZoom(viewport.zoom);
  if (!isValidMat(viewport.viewportTransform)) return;
  try {
    const payload: StoredViewport = {
      zoom,
      viewportTransform: [...viewport.viewportTransform] as TMat2D,
    };
    localStorage.setItem(storageKey(projectId), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function clearStoredViewport(projectId: string): void {
  if (!projectId || typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(projectId));
  } catch {
    /* ignore */
  }
}
