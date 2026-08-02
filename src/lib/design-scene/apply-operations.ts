import {
  ActiveSelection,
  Ellipse,
  FabricObject,
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
  DesignOperation,
  EditableDesignObject,
  EditableDesignScene,
} from "@/lib/design-scene/schema";
import { isEditableDesignObject } from "@/lib/canvas/editable-selection";

export class DesignApplyError extends Error {
  readonly code: string;
  readonly operationIndex?: number;
  readonly operationType?: string;
  readonly objectId?: string;

  constructor(
    code: string,
    message: string,
    meta?: {
      operationIndex?: number;
      operationType?: string;
      objectId?: string;
    },
  ) {
    super(message);
    this.name = "DesignApplyError";
    this.code = code;
    this.operationIndex = meta?.operationIndex;
    this.operationType = meta?.operationType;
    this.objectId = meta?.objectId;
  }
}

export function logDesignApplyError(input: {
  generationId?: string;
  applicationStage: string;
  error: unknown;
  operationIndex?: number;
  operationType?: string;
  objectId?: string;
  createdObjectCount?: number;
  editableSelectionCount?: number;
}) {
  if (process.env.NODE_ENV !== "development") return;
  const err = input.error;
  console.error(
    JSON.stringify({
      scope: "design_apply",
      generationId: input.generationId,
      applicationStage: input.applicationStage,
      operationIndex: input.operationIndex,
      operationType: input.operationType,
      objectId: input.objectId,
      createdObjectCount: input.createdObjectCount,
      editableSelectionCount: input.editableSelectionCount,
      code: err instanceof DesignApplyError ? err.code : "UNKNOWN",
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }),
  );
}

function assertFiniteGeometry(
  object: EditableDesignObject,
  operationIndex: number,
) {
  if (
    !Number.isFinite(object.left) ||
    !Number.isFinite(object.top) ||
    !Number.isFinite(object.width) ||
    !Number.isFinite(object.height) ||
    object.width <= 0 ||
    object.height <= 0
  ) {
    throw new DesignApplyError("INVALID_CREATE_OPERATION", "Invalid geometry", {
      operationIndex,
      operationType: "create",
      objectId: object.id,
    });
  }
}

function findObjectById(
  canvas: Canvas,
  objectId: string,
): FabricObject | undefined {
  return canvas.getObjects().find((obj) => {
    const id = (obj as FabricObject & { objectId?: string }).objectId;
    return id === objectId && isEditableDesignObject(obj);
  });
}

async function createFabricFromObject(
  obj: EditableDesignObject,
  generationId: string,
): Promise<FabricObject | null> {
  const base = withCustomDefaults({
    objectId: obj.id || createObjectId(),
    name: obj.name,
    sourceType: "ai-design",
    generationId,
    semanticRole: obj.semanticRole ?? undefined,
    objectRole: "design",
    locked: obj.locked,
    left: obj.left,
    top: obj.top,
    angle: obj.angle,
    opacity: obj.opacity,
    visible: obj.visible,
    selectable: !obj.locked,
    evented: !obj.locked,
    originX: "left" as const,
    originY: "top" as const,
  });

  switch (obj.type) {
    case "text": {
      await ensureDesignFontsLoaded([obj.fontFamily]);
      return new Textbox(obj.text, {
        ...base,
        width: obj.width,
        fontSize: obj.fontSize,
        fontFamily: fontStackFor(obj.fontFamily as DesignFont),
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
    }
    case "rect":
      return new Rect({
        ...base,
        width: obj.width,
        height: obj.height,
        fill: obj.fill ?? undefined,
        stroke: obj.stroke ?? undefined,
        strokeWidth: obj.strokeWidth,
        rx: obj.cornerRadius,
        ry: obj.cornerRadius,
      });
    case "ellipse":
      return new Ellipse({
        ...base,
        rx: obj.width / 2,
        ry: obj.height / 2,
        fill: obj.fill ?? undefined,
        stroke: obj.stroke ?? undefined,
        strokeWidth: obj.strokeWidth,
      });
    case "line":
      return new Line([obj.x1, obj.y1, obj.x2, obj.y2], {
        ...base,
        stroke: obj.stroke,
        strokeWidth: obj.strokeWidth,
        strokeLineCap: obj.strokeLineCap,
      });
    case "path":
      return new Path(obj.pathData, {
        ...base,
        fill: obj.fill ?? undefined,
        stroke: obj.stroke ?? undefined,
        strokeWidth: obj.strokeWidth,
        strokeLineCap: obj.strokeLineCap,
        strokeLineJoin: obj.strokeLineJoin,
      });
    case "polygon": {
      const points = (obj.points ?? []).filter(
        (p): p is { x: number; y: number } =>
          !!p &&
          Number.isFinite(p.x) &&
          Number.isFinite(p.y),
      );
      if (points.length < 3) {
        throw new DesignApplyError(
          "INVALID_CREATE_OPERATION",
          "Polygon has invalid points",
          { operationType: "create", objectId: obj.id },
        );
      }
      return new Polygon(points, {
        ...base,
        fill: obj.fill ?? undefined,
        stroke: obj.stroke ?? undefined,
        strokeWidth: obj.strokeWidth,
      });
    }
    case "image":
      // Image creates in refine require a prior asset; skip safely.
      return null;
    case "group":
      return null;
    default:
      throw new DesignApplyError(
        "INVALID_CREATE_OPERATION",
        "Unsupported object type",
        { operationType: "create", objectId: (obj as { id?: string }).id },
      );
  }
}

/**
 * Validate then apply Design refine operations atomically.
 */
export async function applyDesignOperationsToCanvas(
  canvas: Canvas,
  operations: DesignOperation[],
  opts: {
    generationId: string;
    editableSelectionCount?: number;
  },
): Promise<{ created: FabricObject[]; affected: FabricObject[] }> {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new DesignApplyError(
      "EMPTY_OPERATIONS",
      "No design operations to apply",
    );
  }

  // Pass 1: validate without mutating
  const preparedCreates: Array<{
    index: number;
    object: EditableDesignObject;
    fabric: FabricObject;
  }> = [];
  const preparedUpdates: Array<{
    index: number;
    target: FabricObject;
    changes: Record<string, unknown>;
  }> = [];
  const preparedDeletes: Array<{ index: number; target: FabricObject }> = [];
  const preparedReorders: Array<{
    index: number;
    target: FabricObject;
    layerIndex: number;
  }> = [];

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    try {
      if (op.type === "create") {
        if (!op.object) {
          throw new DesignApplyError(
            "INVALID_CREATE_OPERATION",
            "Missing create object",
            { operationIndex: i, operationType: "create" },
          );
        }
        assertFiniteGeometry(op.object, i);
        const fabric = await createFabricFromObject(op.object, opts.generationId);
        if (!fabric) {
          // Optional image/group placeholders skipped — not fatal alone
          continue;
        }
        preparedCreates.push({ index: i, object: op.object, fabric });
      } else if (op.type === "update") {
        const target = findObjectById(canvas, op.objectId);
        if (!target) {
          throw new DesignApplyError(
            "UPDATE_TARGET_NOT_FOUND",
            "Update target not found",
            {
              operationIndex: i,
              operationType: "update",
              objectId: op.objectId,
            },
          );
        }
        const changes: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(op.changes ?? {})) {
          if (value === null) continue;
          if (key === "id" || key === "type") continue;
          if (key === "letterSpacing") {
            changes.charSpacing = value;
            continue;
          }
          if (key === "points") {
            if (!Array.isArray(value)) continue;
            const points = value.filter(
              (p): p is { x: number; y: number } =>
                !!p &&
                typeof p === "object" &&
                Number.isFinite((p as { x?: number }).x) &&
                Number.isFinite((p as { y?: number }).y),
            );
            if (points.length >= 3) changes.points = points;
            continue;
          }
          changes[key] = value;
        }
        preparedUpdates.push({ index: i, target, changes });
      } else if (op.type === "delete") {
        const target = findObjectById(canvas, op.objectId);
        if (!target) {
          throw new DesignApplyError(
            "DELETE_TARGET_NOT_FOUND",
            "Delete target not found",
            {
              operationIndex: i,
              operationType: "delete",
              objectId: op.objectId,
            },
          );
        }
        preparedDeletes.push({ index: i, target });
      } else if (op.type === "reorder") {
        const target = findObjectById(canvas, op.objectId);
        if (!target) {
          throw new DesignApplyError(
            "REORDER_TARGET_NOT_FOUND",
            "Reorder target not found",
            {
              operationIndex: i,
              operationType: "reorder",
              objectId: op.objectId,
            },
          );
        }
        preparedReorders.push({
          index: i,
          target,
          layerIndex: op.layerIndex,
        });
      }
    } catch (error) {
      logDesignApplyError({
        generationId: opts.generationId,
        applicationStage: "validate_operations",
        error,
        operationIndex: i,
        operationType: op.type,
        objectId: "objectId" in op ? op.objectId : op.type === "create" ? op.object?.id : undefined,
        createdObjectCount: preparedCreates.length,
        editableSelectionCount: opts.editableSelectionCount,
      });
      throw error;
    }
  }

  // Pass 2: apply atomically after all validation succeeded
  const affected: FabricObject[] = [];
  const created: FabricObject[] = [];

  for (const item of preparedCreates) {
    canvas.add(item.fabric);
    created.push(item.fabric);
    affected.push(item.fabric);
  }
  for (const item of preparedUpdates) {
    item.target.set(item.changes);
    affected.push(item.target);
  }
  for (const item of preparedDeletes) {
    canvas.remove(item.target);
  }
  for (const item of preparedReorders) {
    canvas.moveObjectTo?.(item.target, item.layerIndex);
    affected.push(item.target);
  }

  for (const object of affected) {
    object.setCoords();
  }

  if (created.length === 1) {
    canvas.setActiveObject(created[0]);
  } else if (created.length > 1) {
    const selection = new ActiveSelection(created, { canvas });
    canvas.setActiveObject(selection);
  } else {
    canvas.discardActiveObject();
  }

  canvas.requestRenderAll();
  return { created, affected };
}

export async function selectCreatedDesignObjects(
  canvas: Canvas,
  fabricObjects: FabricObject[],
) {
  const editable = fabricObjects.filter(isEditableDesignObject);
  if (editable.length === 1) {
    canvas.setActiveObject(editable[0]);
  } else if (editable.length > 1) {
    const selection = new ActiveSelection(editable, { canvas });
    canvas.setActiveObject(selection);
  } else {
    canvas.discardActiveObject();
  }
  for (const object of editable) {
    object.setCoords();
  }
  canvas.requestRenderAll();
}

/** Guard used by scene-to-fabric polygon conversion. */
export function mapPolygonPointsSafe(
  points: Array<{ x: number; y: number } | null | undefined>,
  scaleX: number,
  scaleY: number,
): Array<{ x: number; y: number }> {
  return points
    .filter(
      (p): p is { x: number; y: number } =>
        !!p && Number.isFinite(p.x) && Number.isFinite(p.y),
    )
    .map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));
}

export type { EditableDesignScene };
