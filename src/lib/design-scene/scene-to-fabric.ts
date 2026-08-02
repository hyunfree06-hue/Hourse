import {
  Ellipse,
  FabricImage,
  FabricObject,
  Group,
  Line,
  Path,
  Polygon,
  Rect,
  Textbox,
  type Canvas,
} from "fabric";
import {
  createObjectId,
  withCustomDefaults,
} from "@/lib/canvas/custom-properties";
import {
  ensureDesignFontsLoaded,
  fontStackFor,
  type DesignFont,
} from "@/lib/design-scene/font-registry";
import type {
  EditableDesignObject,
  EditableDesignScene,
  EditableImageObject,
} from "@/lib/design-scene/schema";

export type SceneToFabricOptions = {
  offsetLeft: number;
  offsetTop: number;
  scaleX?: number;
  scaleY?: number;
  generationId: string;
  designBlockId?: string;
};

function scaleValue(n: number, scale: number) {
  return n * scale;
}

function commonProps(
  obj: EditableDesignObject,
  opts: SceneToFabricOptions,
  scaleX: number,
  scaleY: number,
) {
  return withCustomDefaults({
    objectId: obj.id || createObjectId(),
    name: obj.name,
    designBlockId: opts.designBlockId,
    sourceType: "ai-design",
    generationId: opts.generationId,
    semanticRole: obj.semanticRole ?? undefined,
    objectRole: "design",
    locked: obj.locked,
    left: opts.offsetLeft + scaleValue(obj.left, scaleX),
    top: opts.offsetTop + scaleValue(obj.top, scaleY),
    angle: obj.angle,
    opacity: obj.opacity,
    visible: obj.visible,
    selectable: !obj.locked,
    evented: !obj.locked,
    originX: "left" as const,
    originY: "top" as const,
  });
}

async function objectToFabric(
  obj: EditableDesignObject,
  opts: SceneToFabricOptions,
  scaleX: number,
  scaleY: number,
  imageUrlById: Map<string, string>,
): Promise<FabricObject | null> {
  const base = commonProps(obj, opts, scaleX, scaleY);

  switch (obj.type) {
    case "text": {
      const family = obj.fontFamily as DesignFont;
      const box = new Textbox(obj.text, {
        ...base,
        width: scaleValue(obj.width, scaleX),
        fontSize: scaleValue(obj.fontSize, Math.min(scaleX, scaleY)),
        fontFamily: fontStackFor(family),
        fontWeight: obj.fontWeight,
        fontStyle: obj.fontStyle,
        lineHeight: obj.lineHeight,
        charSpacing: obj.letterSpacing,
        textAlign: obj.textAlign,
        fill: obj.fill,
        stroke: obj.stroke ?? undefined,
        strokeWidth: obj.strokeWidth,
        underline: obj.underline,
        editable: !obj.locked,
      });
      return box;
    }
    case "rect": {
      return new Rect({
        ...base,
        width: scaleValue(obj.width, scaleX),
        height: scaleValue(obj.height, scaleY),
        fill: obj.fill ?? undefined,
        stroke: obj.stroke ?? undefined,
        strokeWidth: obj.strokeWidth,
        rx: obj.cornerRadius,
        ry: obj.cornerRadius,
      });
    }
    case "ellipse": {
      return new Ellipse({
        ...base,
        rx: scaleValue(obj.width, scaleX) / 2,
        ry: scaleValue(obj.height, scaleY) / 2,
        fill: obj.fill ?? undefined,
        stroke: obj.stroke ?? undefined,
        strokeWidth: obj.strokeWidth,
      });
    }
    case "line": {
      const x1 = opts.offsetLeft + scaleValue(obj.x1, scaleX);
      const y1 = opts.offsetTop + scaleValue(obj.y1, scaleY);
      const x2 = opts.offsetLeft + scaleValue(obj.x2, scaleX);
      const y2 = opts.offsetTop + scaleValue(obj.y2, scaleY);
      return new Line([x1, y1, x2, y2], {
        ...base,
        left: undefined,
        top: undefined,
        stroke: obj.stroke,
        strokeWidth: obj.strokeWidth,
        strokeLineCap: obj.strokeLineCap,
      });
    }
    case "path": {
      const path = new Path(obj.pathData, {
        ...base,
        fill: obj.fill ?? undefined,
        stroke: obj.stroke ?? undefined,
        strokeWidth: obj.strokeWidth,
        strokeLineCap: obj.strokeLineCap,
        strokeLineJoin: obj.strokeLineJoin,
      });
      const w = scaleValue(obj.width, scaleX);
      const h = scaleValue(obj.height, scaleY);
      if (path.width && path.height && path.width > 0 && path.height > 0) {
        path.set({
          scaleX: w / path.width,
          scaleY: h / path.height,
        });
      }
      return path;
    }
    case "polygon": {
      const points = obj.points.map((p) => ({
        x: scaleValue(p.x, scaleX),
        y: scaleValue(p.y, scaleY),
      }));
      return new Polygon(points, {
        ...base,
        fill: obj.fill ?? undefined,
        stroke: obj.stroke ?? undefined,
        strokeWidth: obj.strokeWidth,
      });
    }
    case "image": {
      const url = imageUrlById.get(obj.id);
      if (!url) return null;
      try {
        const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
        const w = scaleValue(obj.width, scaleX);
        const h = scaleValue(obj.height, scaleY);
        img.set({
          ...base,
          assetId: obj.assetId ?? undefined,
          scaleX: img.width ? w / img.width : 1,
          scaleY: img.height ? h / img.height : 1,
        });
        return img;
      } catch {
        return null;
      }
    }
    case "group":
      // Groups are assembled after children exist.
      return null;
    default:
      return null;
  }
}

/**
 * Convert a validated design scene into Fabric objects and add them to the canvas.
 * Local scene coordinates (0,0) are translated into the AI region offset.
 */
export async function insertDesignSceneToCanvas(
  canvas: Canvas,
  scene: EditableDesignScene,
  opts: SceneToFabricOptions,
  imageUrlById: Map<string, string> = new Map(),
): Promise<{ objectIds: string[]; fabricObjects: FabricObject[] }> {
  const sx = opts.scaleX ?? 1;
  const sy = opts.scaleY ?? 1;

  await ensureDesignFontsLoaded(
    scene.objects.filter((o) => o.type === "text").map((o) => (o as { fontFamily: string }).fontFamily),
  );

  const byId = new Map<string, FabricObject>();
  const ordered = [...scene.objects].sort((a, b) => a.layerIndex - b.layerIndex);
  const topLevel: FabricObject[] = [];
  const objectIds: string[] = [];

  for (const obj of ordered) {
    if (obj.type === "group") continue;
    if (obj.parentId) continue; // added via group
    const fabricObj = await objectToFabric(obj, opts, sx, sy, imageUrlById);
    if (!fabricObj) continue;
    byId.set(obj.id, fabricObj);
    topLevel.push(fabricObj);
    objectIds.push((fabricObj as FabricObject & { objectId?: string }).objectId ?? obj.id);
  }

  // Children that belong to groups (and groups themselves)
  for (const obj of ordered) {
    if (obj.type !== "group") continue;
    const children: FabricObject[] = [];
    for (const childId of obj.childIds) {
      const existing = byId.get(childId);
      if (existing) {
        children.push(existing);
        // remove from topLevel if present
        const idx = topLevel.indexOf(existing);
        if (idx >= 0) topLevel.splice(idx, 1);
        continue;
      }
      const childScene = scene.objects.find((o) => o.id === childId);
      if (!childScene || childScene.type === "group") continue;
      const childFab = await objectToFabric(childScene, opts, sx, sy, imageUrlById);
      if (childFab) {
        byId.set(childId, childFab);
        children.push(childFab);
        objectIds.push(
          (childFab as FabricObject & { objectId?: string }).objectId ?? childId,
        );
      }
    }
    if (children.length === 0) continue;
    const group = new Group(children, {
      ...commonProps(obj, opts, sx, sy),
      subTargetCheck: true,
    });
    byId.set(obj.id, group);
    topLevel.push(group);
    objectIds.push((group as FabricObject & { objectId?: string }).objectId ?? obj.id);
  }

  // Also insert parented non-group objects that weren't grouped (orphans)
  for (const obj of ordered) {
    if (obj.type === "group" || !obj.parentId) continue;
    if (byId.has(obj.id)) continue;
    const fabricObj = await objectToFabric(obj, opts, sx, sy, imageUrlById);
    if (!fabricObj) continue;
    byId.set(obj.id, fabricObj);
    topLevel.push(fabricObj);
    objectIds.push((fabricObj as FabricObject & { objectId?: string }).objectId ?? obj.id);
  }

  for (const fab of topLevel) {
    canvas.add(fab);
  }

  canvas.requestRenderAll();
  return { objectIds, fabricObjects: topLevel };
}

export function scaleSceneToRegion(
  scene: EditableDesignScene,
  region: { width: number; height: number },
): { scaleX: number; scaleY: number } {
  return {
    scaleX: region.width / Math.max(1, scene.canvas.width),
    scaleY: region.height / Math.max(1, scene.canvas.height),
  };
}

export type { EditableImageObject };
