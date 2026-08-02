import { createDesignBriefResponseFormat } from "@/lib/design-scene/design-brief-format";
import { createDesignSceneResponseFormatFromZod } from "@/lib/design-scene/design-scene-format";
import { createDesignOperationsResponseFormat } from "@/lib/design-scene/schema";

export function createDesignSceneResponseFormat() {
  return createDesignSceneResponseFormatFromZod();
}

export function getDesignSceneJsonSchema() {
  return createDesignSceneResponseFormat().schema;
}

/** Production response formats — construct before charging credits. */
export function createDesignResponseFormats(): {
  brief: ReturnType<typeof createDesignBriefResponseFormat>;
  scene: ReturnType<typeof createDesignSceneResponseFormat>;
  operations: ReturnType<typeof createDesignOperationsResponseFormat>;
} {
  return {
    brief: createDesignBriefResponseFormat(),
    scene: createDesignSceneResponseFormat(),
    operations: createDesignOperationsResponseFormat(),
  };
}

/** Alias expected by tests / callers. */
export function createDesignResponseFormat() {
  return createDesignResponseFormats();
}
