import type { FabricObject } from "fabric";

type PropBag = FabricObject & {
  get?: (key: string) => unknown;
  objectId?: string;
  objectRole?: string;
  sourceType?: string;
  isTemporary?: boolean;
  excludeFromExport?: boolean;
  name?: string;
};

function readProp(obj: FabricObject, key: string): unknown {
  const anyObj = obj as PropBag;
  if (typeof anyObj.get === "function") {
    try {
      const viaGet = anyObj.get(key);
      if (viaGet !== undefined) return viaGet;
    } catch {
      // fall through to direct access
    }
  }
  return (anyObj as unknown as Record<string, unknown>)[key];
}

/**
 * Canonical predicate: temporary AI region / overlays are never editable Design objects.
 */
export function isEditableDesignObject(
  object: FabricObject | null | undefined,
): object is FabricObject {
  if (!object) return false;

  const objectRole = readProp(object, "objectRole");
  const sourceType = readProp(object, "sourceType");
  const isTemporary = readProp(object, "isTemporary");
  const excludeFromExport = readProp(object, "excludeFromExport");
  const objectId = readProp(object, "objectId");
  const name = readProp(object, "name");

  if (objectRole === "ai-region") return false;
  if (objectRole === "artboard") return false;
  if (sourceType === "ai-region") return false;
  if (sourceType === "selection-overlay") return false;
  if (isTemporary === true) return false;
  if (excludeFromExport === true) return false;
  if (name === "AI region" || name === "Artboard") return false;
  if (objectId == null || objectId === "") return false;

  return true;
}

export function getEditableSelection(canvas: {
  getActiveObjects?: () => FabricObject[];
  getActiveObject?: () => FabricObject | null | undefined;
}): FabricObject[] {
  const fromMulti =
    typeof canvas.getActiveObjects === "function"
      ? canvas.getActiveObjects()
      : [];
  if (fromMulti.length > 0) {
    return fromMulti.filter(isEditableDesignObject);
  }
  const active =
    typeof canvas.getActiveObject === "function"
      ? canvas.getActiveObject()
      : null;
  if (!active) return [];
  if (
    active.type === "activeSelection" &&
    "getObjects" in active &&
    typeof (active as { getObjects?: () => FabricObject[] }).getObjects ===
      "function"
  ) {
    return (active as { getObjects: () => FabricObject[] })
      .getObjects()
      .filter(isEditableDesignObject);
  }
  return isEditableDesignObject(active) ? [active] : [];
}

export function isRefinementSelection(canvas: {
  getActiveObjects?: () => FabricObject[];
  getActiveObject?: () => FabricObject | null | undefined;
}): boolean {
  return getEditableSelection(canvas).length > 0;
}
