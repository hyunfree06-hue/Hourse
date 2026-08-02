import { preferFontForText } from "@/lib/design-scene/font-registry";
import {
  MIN_FONT_SIZE,
  type EditableDesignObject,
  type EditableDesignScene,
} from "@/lib/design-scene/schema";

const SPACING = [4, 8, 12, 16, 24, 32, 48, 64] as const;

function snapSpacing(value: number): number {
  let best: number = SPACING[0];
  let bestDist = Math.abs(value - best);
  for (const s of SPACING) {
    const d = Math.abs(value - s);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  // Only snap when close to a rhythm step
  return bestDist <= 3 ? best : value;
}

function normalizeColor(value: string | null): string | null {
  if (value == null) return null;
  if (value === "transparent") return value;
  if (value.startsWith("#") && value.length === 4) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return value;
}

function clampToCanvas(obj: EditableDesignObject, w: number, h: number): EditableDesignObject {
  const left = Math.min(Math.max(obj.left, -obj.width * 0.25), w);
  const top = Math.min(Math.max(obj.top, -obj.height * 0.25), h);
  const width = Math.min(Math.max(obj.width, 1), w * 1.25);
  const height = Math.min(Math.max(obj.height, 1), h * 1.25);
  return { ...obj, left, top, width, height };
}

function normalizeObject(obj: EditableDesignObject, canvas: EditableDesignScene["canvas"]): EditableDesignObject {
  let next = clampToCanvas(obj, canvas.width, canvas.height);
  next = {
    ...next,
    opacity: Math.min(1, Math.max(0, next.opacity)),
    angle: Number.isFinite(next.angle) ? next.angle : 0,
    name: next.name.trim() || next.type,
  };

  if (next.type === "text") {
    const fontFamily = preferFontForText(next.text, next.fontFamily);
    const fontSize =
      Math.max(MIN_FONT_SIZE, Math.min(next.fontSize, Math.max(canvas.height * 0.4, 48)));
    const text = next.uppercase ? next.text.toUpperCase() : next.text;
    const fontWeight =
      next.fontWeight === "bold" ? 700 : next.fontWeight === "normal" ? 400 : next.fontWeight;
    return {
      ...next,
      text,
      fontFamily,
      fontSize,
      fontWeight,
      fill: normalizeColor(next.fill) ?? "#111111",
      stroke: normalizeColor(next.stroke),
      width: Math.max(next.width, fontSize * 0.5),
      height: Math.max(next.height, fontSize * next.lineHeight),
    };
  }

  if (next.type === "rect" || next.type === "ellipse") {
    return {
      ...next,
      fill: normalizeColor(next.fill),
      stroke: normalizeColor(next.stroke),
    };
  }

  if (next.type === "path") {
    return {
      ...next,
      fill: normalizeColor(next.fill),
      stroke: normalizeColor(next.stroke),
      pathData: next.pathData.trim(),
    };
  }

  if (next.type === "line") {
    return {
      ...next,
      stroke: normalizeColor(next.stroke) ?? "#111111",
      width: Math.max(1, Math.abs(next.x2 - next.x1) || next.width),
      height: Math.max(1, Math.abs(next.y2 - next.y1) || next.height),
    };
  }

  if (next.type === "polygon") {
    return {
      ...next,
      fill: normalizeColor(next.fill),
      stroke: normalizeColor(next.stroke),
    };
  }

  if (next.type === "image") {
    return {
      ...next,
      assetId: null,
      cornerRadius: Math.max(0, next.cornerRadius),
    };
  }

  return next;
}

/**
 * Deterministic post-processing before Fabric conversion.
 */
export function normalizeDesignScene(scene: EditableDesignScene): EditableDesignScene {
  const objects = [...scene.objects]
    .map((obj) => normalizeObject(obj, scene.canvas))
    .sort((a, b) => a.layerIndex - b.layerIndex || a.id.localeCompare(b.id))
    .map((obj, index) => ({
      ...obj,
      layerIndex: index,
      left: Math.round(obj.left * 100) / 100,
      top: Math.round(obj.top * 100) / 100,
    }));

  // Soft spacing nudge for top-level siblings with near-equal gaps
  for (let i = 1; i < objects.length; i++) {
    const prev = objects[i - 1];
    const curr = objects[i];
    if (prev.parentId || curr.parentId) continue;
    if (Math.abs(prev.left - curr.left) < 2) {
      const gap = curr.top - (prev.top + prev.height);
      if (gap > 0 && gap < 80) {
        const snapped = snapSpacing(gap);
        if (snapped !== gap) {
          objects[i] = { ...curr, top: prev.top + prev.height + snapped };
        }
      }
    }
  }

  return {
    ...scene,
    title: scene.title.trim() || "Design",
    canvas: {
      ...scene.canvas,
      background: normalizeColor(scene.canvas.background) ?? "#ffffff",
      width: Math.round(scene.canvas.width),
      height: Math.round(scene.canvas.height),
    },
    palette: {
      primary: normalizeColor(scene.palette.primary) ?? "#111111",
      secondary: normalizeColor(scene.palette.secondary) ?? "#666666",
      accent: normalizeColor(scene.palette.accent) ?? "#2563eb",
      background: normalizeColor(scene.palette.background) ?? "#ffffff",
      text: normalizeColor(scene.palette.text) ?? "#111111",
    },
    objects,
  };
}
