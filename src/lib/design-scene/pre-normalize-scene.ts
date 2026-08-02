import { MIN_FONT_SIZE, MIN_VISIBLE_SIZE } from "@/lib/design-scene/schema";

export type SceneNormalizationRepair = {
  fieldPath: string;
  originalValue: number;
  normalizedValue: number;
};

/**
 * Repair recoverable undersized numeric values on raw provider JSON
 * before canonical Zod validation. Does not invent missing geometry.
 */
export function preNormalizeSceneRaw(raw: unknown): {
  value: unknown;
  repairs: SceneNormalizationRepair[];
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { value: raw, repairs: [] };
  }

  const clone = JSON.parse(JSON.stringify(raw)) as {
    objects?: Array<Record<string, unknown>>;
  };
  const repairs: SceneNormalizationRepair[] = [];

  if (!Array.isArray(clone.objects)) {
    return { value: clone, repairs };
  }

  for (let i = 0; i < clone.objects.length; i++) {
    const obj = clone.objects[i];
    if (!obj || typeof obj !== "object") continue;
    const prefix = `objects.${i}`;

    if (obj.type === "text" && typeof obj.fontSize === "number") {
      const original = obj.fontSize;
      if (Number.isFinite(original) && original > 0 && original < MIN_FONT_SIZE) {
        obj.fontSize = MIN_FONT_SIZE;
        repairs.push({
          fieldPath: `${prefix}.fontSize`,
          originalValue: original,
          normalizedValue: MIN_FONT_SIZE,
        });
      }
    }

    // Preserve center when width/height are non-positive but finite.
    for (const dim of ["width", "height"] as const) {
      const original = obj[dim];
      if (typeof original !== "number" || !Number.isFinite(original)) continue;
      if (original > 0) continue;
      const next = MIN_VISIBLE_SIZE;
      const centerKey = dim === "width" ? "left" : "top";
      const origin = obj[centerKey];
      if (typeof origin === "number" && Number.isFinite(origin)) {
        obj[centerKey] = origin + original / 2 - next / 2;
      }
      obj[dim] = next;
      repairs.push({
        fieldPath: `${prefix}.${dim}`,
        originalValue: original,
        normalizedValue: next,
      });
    }

    // Do NOT bump strokeWidth / cornerRadius / letterSpacing to 8.
  }

  return { value: clone, repairs };
}

export function isRecoverableSceneNumericIssue(issue: {
  code: string;
  path: PropertyKey[];
  minimum?: unknown;
}): boolean {
  const path = issue.path.map(String).join(".");
  const leaf = issue.path[issue.path.length - 1];
  if (issue.code !== "too_small" && issue.code !== "too_big") {
    // Zod positive() may surface as too_small with minimum 0 exclusive
    if (issue.code !== "invalid_type") return false;
  }
  if (leaf === "fontSize") {
    return issue.code === "too_small";
  }
  if (leaf === "width" || leaf === "height") {
    return issue.code === "too_small";
  }
  // Explicitly not recoverable by forcing to 8:
  if (
    leaf === "strokeWidth" ||
    leaf === "cornerRadius" ||
    leaf === "letterSpacing" ||
    leaf === "lineHeight" ||
    leaf === "opacity"
  ) {
    return false;
  }
  void path;
  return false;
}

export function sceneIssuesAreOnlyRecoverableNumeric(
  issues: Array<{ code: string; path: PropertyKey[]; minimum?: unknown }>,
): boolean {
  if (issues.length === 0) return false;
  return issues.every((issue) => isRecoverableSceneNumericIssue(issue));
}
