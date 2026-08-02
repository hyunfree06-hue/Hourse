/** Provider-side image size normalization — keep UI free of provider size rules. */

export type OpenAiImageSize = "1024x1024" | "1536x1024" | "1024x1536";

export type NormalizedOpenAiSize = {
  size: OpenAiImageSize;
  width: number;
  height: number;
};

/**
 * Map a canvas selection to an OpenAI-supported size enum.
 * Never pass raw selection pixels (e.g. 66x66) to the API.
 */
export function normalizeOpenAiImageSize(
  width: number,
  height: number,
): NormalizedOpenAiSize {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const ratio = w / h;

  if (ratio > 1.2) {
    return { size: "1536x1024", width: 1536, height: 1024 };
  }
  if (ratio < 0.8) {
    return { size: "1024x1536", width: 1024, height: 1536 };
  }
  return { size: "1024x1024", width: 1024, height: 1024 };
}

export type BflNormalizedSize = {
  width: number;
  height: number;
};

const BFL_MIN = 64;
const BFL_MAX = 2048;
const BFL_STEP = 16;

function snap(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

/**
 * BFL flux models typically require multiples of 16 within a safe range.
 */
export function normalizeBflImageSize(
  width: number,
  height: number,
): BflNormalizedSize {
  let w = snap(width, BFL_STEP);
  let h = snap(height, BFL_STEP);
  w = Math.min(BFL_MAX, Math.max(BFL_MIN, w));
  h = Math.min(BFL_MAX, Math.max(BFL_MIN, h));
  return { width: w, height: h };
}

const OPENAI_MODELS = new Set([
  "gpt-image-1",
  "gpt-image-1-mini",
  "gpt-image-1.5",
  "gpt-image-2",
  "gpt-image-2-2026-04-21",
  "chatgpt-image-latest",
  "dall-e-2",
  "dall-e-3",
]);

export function resolveOpenAiImageModel(configured: string): string {
  const model = configured.trim();
  if (!model || !OPENAI_MODELS.has(model)) {
    return "gpt-image-2";
  }
  return model;
}

export function isGptImageModel(model: string): boolean {
  return (
    model.startsWith("gpt-image") || model === "chatgpt-image-latest"
  );
}
