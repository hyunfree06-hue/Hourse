/** Shared helpers for validating client-supplied Design refinement payloads. */

const TEMP_NAMES = new Set(["ai region", "refine placeholder"]);

export function isTemporaryOrOverlayDesignObject(
  value: unknown,
): boolean {
  if (!value || typeof value !== "object") return true;
  const obj = value as Record<string, unknown>;
  const name = String(obj.name ?? "").toLowerCase();
  const role = String(obj.objectRole ?? obj.semanticRole ?? "").toLowerCase();
  const sourceType = String(obj.sourceType ?? "").toLowerCase();

  if (TEMP_NAMES.has(name)) return true;
  if (role === "ai-region") return true;
  if (sourceType === "ai-region" || sourceType === "selection-overlay") {
    return true;
  }
  if (obj.excludeFromExport === true && role === "ai-region") return true;
  if (obj.isTemporary === true) return true;
  if (obj.id == null || String(obj.id).trim() === "") return true;
  return false;
}

export function filterEditableRefinementObjects(
  selectedObjects: unknown[] | undefined,
  selectedObjectIds: string[] | undefined,
): { objects: unknown[]; ids: string[] } {
  const objects = (selectedObjects ?? []).filter(
    (obj) => !isTemporaryOrOverlayDesignObject(obj),
  );
  const idSet = new Set(
    objects
      .map((obj) =>
        obj && typeof obj === "object"
          ? String((obj as { id?: unknown }).id ?? "")
          : "",
      )
      .filter(Boolean),
  );
  const ids = (selectedObjectIds ?? []).filter((id) => idSet.has(id));
  // If client only sent IDs, still reject temp-looking IDs when objects empty
  if (objects.length === 0 && (selectedObjectIds?.length ?? 0) > 0) {
    return { objects: [], ids: [] };
  }
  return { objects, ids };
}
