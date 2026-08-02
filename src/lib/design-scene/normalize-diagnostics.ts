import type { EditableDesignObject, EditableDesignScene } from "@/lib/design-scene/schema";
import { DesignGenerationError } from "@/lib/design-scene/errors";
import { normalizeDesignScene } from "@/lib/design-scene/normalize-scene";

export type ObjectRejectionReason =
  | "non-finite coordinate"
  | "zero width or height"
  | "unsupported font"
  | "invalid color"
  | "invalid SVG path"
  | "outside scene bounds"
  | "text below minimum size"
  | "missing required semantic role"
  | "unsupported operation type";

export type ObjectRejection = {
  objectType: string;
  objectId: string;
  reason: ObjectRejectionReason;
  field?: string;
};

export type NormalizeDiagnostics = {
  inputObjectCount: number;
  validObjectCount: number;
  rejectedObjectCount: number;
  rejections: ObjectRejection[];
  scene: EditableDesignScene;
};

function isFiniteCoord(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function colorLooksInvalid(value: string | null | undefined): boolean {
  if (value == null) return false;
  const lower = value.toLowerCase();
  return (
    lower.includes("url(") ||
    lower.includes("javascript:") ||
    lower.includes("<") ||
    lower.includes(">")
  );
}

function rejectObject(
  obj: EditableDesignObject,
  canvas: EditableDesignScene["canvas"],
): ObjectRejection | null {
  if (
    !isFiniteCoord(obj.left) ||
    !isFiniteCoord(obj.top) ||
    !isFiniteCoord(obj.width) ||
    !isFiniteCoord(obj.height)
  ) {
    return {
      objectType: obj.type,
      objectId: obj.id,
      reason: "non-finite coordinate",
      field: "geometry",
    };
  }
  if (obj.width <= 0 || obj.height <= 0) {
    return {
      objectType: obj.type,
      objectId: obj.id,
      reason: "zero width or height",
      field: "width/height",
    };
  }

  const margin = Math.max(canvas.width, canvas.height) * 0.5;
  if (
    obj.left < -margin ||
    obj.top < -margin ||
    obj.left > canvas.width + margin ||
    obj.top > canvas.height + margin
  ) {
    return {
      objectType: obj.type,
      objectId: obj.id,
      reason: "outside scene bounds",
      field: "left/top",
    };
  }

  if ("fill" in obj && colorLooksInvalid((obj as { fill?: string | null }).fill)) {
    return {
      objectType: obj.type,
      objectId: obj.id,
      reason: "invalid color",
      field: "fill",
    };
  }
  if (
    "stroke" in obj &&
    colorLooksInvalid((obj as { stroke?: string | null }).stroke)
  ) {
    return {
      objectType: obj.type,
      objectId: obj.id,
      reason: "invalid color",
      field: "stroke",
    };
  }

  if (obj.type === "text") {
    if (obj.fontSize < 8 || obj.height < 4) {
      return {
        objectType: obj.type,
        objectId: obj.id,
        reason: "text below minimum size",
        field: "fontSize",
      };
    }
  }

  if (obj.type === "path") {
    if (!obj.pathData?.trim()) {
      return {
        objectType: obj.type,
        objectId: obj.id,
        reason: "invalid SVG path",
        field: "pathData",
      };
    }
    if (/javascript:|<|>|url\(/i.test(obj.pathData)) {
      return {
        objectType: obj.type,
        objectId: obj.id,
        reason: "invalid SVG path",
        field: "pathData",
      };
    }
  }

  return null;
}

/**
 * Filter unsafe/invalid objects, then run deterministic normalization.
 * Throws DESIGN_SCENE_INVALID when every object is rejected.
 */
export function normalizeDesignSceneWithDiagnostics(
  scene: EditableDesignScene,
  opts?: { requestId?: string; generationId?: string },
): NormalizeDiagnostics {
  const rejections: ObjectRejection[] = [];
  const kept: EditableDesignObject[] = [];

  for (const obj of scene.objects) {
    const rejection = rejectObject(obj, scene.canvas);
    if (rejection) {
      rejections.push(rejection);
      continue;
    }
    kept.push(obj);
  }

  const inputObjectCount = scene.objects.length;
  const rejectedObjectCount = rejections.length;
  const validObjectCount = kept.length;

  if (inputObjectCount > 0 && validObjectCount === 0) {
    throw new DesignGenerationError("DESIGN_SCENE_INVALID", {
      stage: "scene_normalization",
      requestId: opts?.requestId,
      internalReason: "ALL_GENERATED_OBJECTS_REJECTED",
      details: {
        inputObjectCount,
        validObjectCount,
        rejectedObjectCount,
        rejections: rejections.slice(0, 12),
        generationId: opts?.generationId,
      },
    });
  }

  const normalized = normalizeDesignScene({ ...scene, objects: kept });
  return {
    inputObjectCount,
    validObjectCount: normalized.objects.length,
    rejectedObjectCount,
    rejections,
    scene: normalized,
  };
}
