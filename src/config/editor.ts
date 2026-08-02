export const editorConfig = {
  defaultCanvasWidth: 1920,
  defaultCanvasHeight: 1080,
  defaultBackgroundColor: "#ffffff",
  defaultProjectName: "Untitled project",
  autosaveDebounceMs: 1500,
  thumbnailMinIntervalMs: 60_000,
  minAiRegionSize: 64,
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
