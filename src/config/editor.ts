export const editorConfig = {
  defaultCanvasWidth: 1920,
  defaultCanvasHeight: 1080,
  defaultBackgroundColor: "#ffffff",
  defaultProjectName: "제목 없는 디자인",
  autosaveDebounceMs: 1500,
  thumbnailMinIntervalMs: 60_000,
  minAiRegionSize: 64,
  maxZoom: 4,
  minZoom: 0.1,
  zoomStep: 0.1,
  gridSize: 8,
  customObjectProperties: [
    "objectId",
    "assetId",
    "objectRole",
    "generatedBy",
    "generationId",
    "locked",
    "name",
  ] as const,
  localBackupPrefix: "canvasai:backup:",
} as const;

export const uploadConfig = {
  maxUploadMb: Number(process.env.AI_MAX_UPLOAD_MB ?? process.env.NEXT_PUBLIC_AI_MAX_UPLOAD_MB ?? 10),
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
