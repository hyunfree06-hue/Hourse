export const editorConfig = {
  defaultCanvasWidth: 1920,
  defaultCanvasHeight: 1080,
  defaultBackgroundColor: "#ffffff",
  defaultProjectName: "Untitled project",
  autosaveDebounceMs: 500,
  thumbnailMinIntervalMs: 60_000,
  /**
   * @deprecated Use DEFAULT_DESIGN_REGION / MIN_DESIGN_REGION from
   * `@/lib/design-scene/region`. Kept only so older imports do not break.
   */
  minAiRegionSize: 320,
  minDesignRegionWidth: 320,
  minDesignRegionHeight: 240,
  recommendedDesignRegionWidth: 600,
  recommendedDesignRegionHeight: 300,
  maxZoom: 4,
  minZoom: 0.1,
  zoomStep: 0.1,
  gridSize: 8,
  exportFilePrefix: "hourse-project",
  customObjectProperties: [
    "objectId",
    "assetId",
    "storageBucket",
    "storagePath",
    "objectRole",
    "generatedBy",
    "generationId",
    "sourceType",
    "locked",
    "name",
    "designBlockId",
    "semanticRole",
    "excludeFromExport",
    "isTemporary",
  ] as const,
  /**
   * New local backup namespace. Legacy `canvasai:backup:` keys are still read
   * once for migration so existing drafts are not lost (never shown in UI).
   */
  localBackupPrefix: "hourse:backup:",
  legacyLocalBackupPrefix: "canvasai:backup:",
} as const;

export const uploadConfig = {
  maxUploadMb: Number(
    process.env.AI_MAX_UPLOAD_MB ??
      process.env.NEXT_PUBLIC_AI_MAX_UPLOAD_MB ??
      10,
  ),
  allowedMimeTypes: [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
  ] as const,
};

export const aiRuntimeConfig = {
  defaultProvider: (process.env.AI_PROVIDER_DEFAULT ?? "openai") as
    | "openai"
    | "bfl",
  timeoutMs: Number(process.env.AI_GENERATION_TIMEOUT_MS ?? 120_000),
  pollIntervalMs: Number(process.env.AI_POLL_INTERVAL_MS ?? 2_000),
  maxPollAttempts: Number(process.env.AI_MAX_POLL_ATTEMPTS ?? 60),
  maxDownloadBytes: 20 * 1024 * 1024,
  rateLimitPerMinute: 10,
  promptMaxLength: 2000,
};
