import { editorConfig } from "@/config/editor";

export type CanvasObjectCustomProps = {
  objectId?: string;
  assetId?: string;
  objectRole?: "ai-region" | "generated" | "design" | string;
  generatedBy?: string;
  generationId?: string;
  locked?: boolean;
  name?: string;
};

export const FABRIC_CUSTOM_KEYS = [...editorConfig.customObjectProperties];

export function createObjectId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `obj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function withCustomDefaults<T extends Record<string, unknown>>(
  props: T & CanvasObjectCustomProps,
): T & CanvasObjectCustomProps {
  return {
    objectId: props.objectId ?? createObjectId(),
    objectRole: props.objectRole ?? "design",
    locked: props.locked ?? false,
    ...props,
  };
}

export function serializeCustomProperties(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of FABRIC_CUSTOM_KEYS) {
    if (key in obj && obj[key] !== undefined) {
      out[key] = obj[key];
    }
  }
  return out;
}
