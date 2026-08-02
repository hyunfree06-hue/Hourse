import type { FabricObject } from "fabric";
import type { EditableDesignObject } from "@/lib/design-scene/schema";
import { resolveDesignFont } from "@/lib/design-scene/font-registry";

type AnyObj = FabricObject & Record<string, unknown>;

function baseFromFabric(obj: AnyObj, layerIndex: number): Omit<EditableDesignObject, "type"> & { type: string } {
  return {
    id: String(obj.objectId ?? `obj_${layerIndex}`),
    name: String(obj.name ?? obj.type ?? "Object"),
    type: String(obj.type ?? "rect"),
    left: Number(obj.left ?? 0),
    top: Number(obj.top ?? 0),
    width: Math.max(1, Number(obj.getScaledWidth?.() ?? obj.width ?? 1)),
    height: Math.max(1, Number(obj.getScaledHeight?.() ?? obj.height ?? 1)),
    angle: Number(obj.angle ?? 0),
    opacity: Number(obj.opacity ?? 1),
    visible: obj.visible !== false,
    locked: Boolean(obj.locked),
    layerIndex,
    parentId: null,
    semanticRole: typeof obj.semanticRole === "string" ? obj.semanticRole : undefined,
  };
}

/**
 * Convert selected Fabric objects into editable design scene objects for refine.
 */
export function fabricObjectsToSceneObjects(
  objects: FabricObject[],
): EditableDesignObject[] {
  const result: EditableDesignObject[] = [];

  objects.forEach((raw, index) => {
    const obj = raw as AnyObj;
    const type = String(obj.type ?? "");

    if (type === "textbox" || type === "i-text" || type === "text") {
      result.push({
        ...baseFromFabric(obj, index),
        type: "text",
        text: String(obj.text ?? ""),
        fontFamily: resolveDesignFont(String(obj.fontFamily ?? "Inter")),
        fontSize: Number(obj.fontSize ?? 24),
        fontWeight:
          typeof obj.fontWeight === "number"
            ? obj.fontWeight
            : obj.fontWeight === "bold"
              ? 700
              : 400,
        fontStyle: obj.fontStyle === "italic" ? "italic" : "normal",
        lineHeight: Number(obj.lineHeight ?? 1.2),
        letterSpacing: Number(obj.charSpacing ?? 0),
        textAlign:
          obj.textAlign === "center" || obj.textAlign === "right"
            ? obj.textAlign
            : "left",
        fill: typeof obj.fill === "string" ? obj.fill : "#111111",
        stroke: typeof obj.stroke === "string" ? obj.stroke : null,
        strokeWidth: Number(obj.strokeWidth ?? 0),
        underline: Boolean(obj.underline),
        uppercase: false,
      });
      return;
    }

    if (type === "rect") {
      result.push({
        ...baseFromFabric(obj, index),
        type: "rect",
        fill: typeof obj.fill === "string" ? obj.fill : null,
        stroke: typeof obj.stroke === "string" ? obj.stroke : null,
        strokeWidth: Number(obj.strokeWidth ?? 0),
        cornerRadius: Number(obj.rx ?? 0),
      });
      return;
    }

    if (type === "ellipse" || type === "circle") {
      result.push({
        ...baseFromFabric(obj, index),
        type: "ellipse",
        fill: typeof obj.fill === "string" ? obj.fill : null,
        stroke: typeof obj.stroke === "string" ? obj.stroke : null,
        strokeWidth: Number(obj.strokeWidth ?? 0),
      });
      return;
    }

    if (type === "line") {
      const x1 = Number(obj.x1 ?? 0);
      const y1 = Number(obj.y1 ?? 0);
      const x2 = Number(obj.x2 ?? 0);
      const y2 = Number(obj.y2 ?? 0);
      result.push({
        ...baseFromFabric(obj, index),
        type: "line",
        x1,
        y1,
        x2,
        y2,
        stroke: typeof obj.stroke === "string" ? obj.stroke : "#111111",
        strokeWidth: Math.max(1, Number(obj.strokeWidth ?? 1)),
        strokeLineCap:
          obj.strokeLineCap === "butt" || obj.strokeLineCap === "square"
            ? obj.strokeLineCap
            : "round",
      });
      return;
    }

    if (type === "path") {
      result.push({
        ...baseFromFabric(obj, index),
        type: "path",
        pathData: String(obj.path?.toString?.() ?? obj.d ?? "M0 0"),
        fill: typeof obj.fill === "string" ? obj.fill : null,
        stroke: typeof obj.stroke === "string" ? obj.stroke : null,
        strokeWidth: Number(obj.strokeWidth ?? 1),
        strokeLineCap:
          obj.strokeLineCap === "butt" || obj.strokeLineCap === "square"
            ? obj.strokeLineCap
            : "round",
        strokeLineJoin:
          obj.strokeLineJoin === "miter" || obj.strokeLineJoin === "bevel"
            ? obj.strokeLineJoin
            : "round",
      });
      return;
    }

    if (type === "polygon") {
      const points = Array.isArray(obj.points)
        ? (obj.points as Array<{ x: number; y: number }>)
        : [];
      result.push({
        ...baseFromFabric(obj, index),
        type: "polygon",
        points: points.length >= 3 ? points : [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 5, y: 10 },
        ],
        fill: typeof obj.fill === "string" ? obj.fill : null,
        stroke: typeof obj.stroke === "string" ? obj.stroke : null,
        strokeWidth: Number(obj.strokeWidth ?? 0),
      });
      return;
    }

    if (type === "image") {
      result.push({
        ...baseFromFabric(obj, index),
        type: "image",
        prompt: String(obj.name ?? "image"),
        fit: "cover",
        cornerRadius: 0,
        assetId: typeof obj.assetId === "string" ? obj.assetId : null,
      });
      return;
    }

    // Fallback as rect
    result.push({
      ...baseFromFabric(obj, index),
      type: "rect",
      fill: typeof obj.fill === "string" ? obj.fill : null,
      stroke: typeof obj.stroke === "string" ? obj.stroke : null,
      strokeWidth: Number(obj.strokeWidth ?? 0),
      cornerRadius: 0,
    });
  });

  return result;
}
