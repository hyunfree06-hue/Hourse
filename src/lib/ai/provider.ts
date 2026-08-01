import type { AiProviderId } from "@/config/credits";
import { hasBflKey, hasOpenAiKey } from "@/lib/validation/env.server";
import { AppError } from "@/lib/utils/errors";
import { OpenAIImageProvider } from "./openai-provider";
import { BflImageProvider } from "./bfl-provider";
import type { ImageGenerationProvider } from "./types";

export function getProviderAvailability(): Record<AiProviderId, boolean> {
  return {
    openai: hasOpenAiKey(),
    bfl: hasBflKey(),
  };
}

export function createImageProvider(
  provider: AiProviderId,
): ImageGenerationProvider {
  const availability = getProviderAvailability();
  if (!availability[provider]) {
    throw new AppError(
      "provider_unavailable",
      "서버에 API 키가 설정되지 않았습니다.",
      503,
    );
  }

  if (provider === "openai") {
    return new OpenAIImageProvider();
  }
  return new BflImageProvider();
}
