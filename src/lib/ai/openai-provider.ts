import OpenAI from "openai";
import { toFile } from "openai";
import { getServerEnv, hasOpenAiKey } from "@/lib/validation/env.server";
import type {
  EditImageInput,
  GenerateImageInput,
  GenerationProviderResult,
  ImageGenerationProvider,
} from "./types";
import { normalizeImageSize } from "./image-utils";

function mapQuality(
  quality: GenerateImageInput["quality"],
): "low" | "medium" | "high" {
  if (quality === "fast") return "low";
  if (quality === "high") return "high";
  return "medium";
}

function pickSize(width: number, height: number): "1024x1024" | "1536x1024" | "1024x1536" {
  const ratio = width / height;
  if (ratio > 1.2) return "1536x1024";
  if (ratio < 0.8) return "1024x1536";
  return "1024x1024";
}

export class OpenAIImageProvider implements ImageGenerationProvider {
  readonly id = "openai" as const;
  private client: OpenAI;
  private model: string;

  constructor() {
    const env = getServerEnv();
    if (!hasOpenAiKey()) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.model = env.OPENAI_IMAGE_MODEL;
  }

  async generate(input: GenerateImageInput): Promise<GenerationProviderResult> {
    try {
      const response = await this.client.images.generate({
        model: input.model ?? this.model,
        prompt: input.prompt,
        size: pickSize(input.width, input.height),
        quality: mapQuality(input.quality),
        n: 1,
      });

      const first = response.data?.[0];
      if (!first) {
        return {
          status: "failed",
          errorCode: "empty_response",
          errorMessage: "Generation failed.",
        };
      }

      if (first.b64_json) {
        const buffer = Buffer.from(first.b64_json, "base64");
        return {
          status: "completed",
          imageBuffer: await normalizeImageSize(buffer, input.width, input.height),
          mimeType: "image/png",
          providerRequestId: response._request_id ?? undefined,
        };
      }

      if (first.url) {
        return {
          status: "completed",
          temporaryUrl: first.url,
          providerRequestId: response._request_id ?? undefined,
        };
      }

      return {
        status: "failed",
        errorCode: "empty_response",
        errorMessage: "Generation failed.",
      };
    } catch (error) {
      return normalizeOpenAiError(error);
    }
  }

  async edit(input: EditImageInput): Promise<GenerationProviderResult> {
    try {
      const imageFile = await toFile(input.imagePng, "image.png", {
        type: "image/png",
      });

      const params: OpenAI.Images.ImageEditParams = {
        model: input.model ?? this.model,
        image: imageFile,
        prompt: input.prompt,
        size: pickSize(input.width, input.height),
        n: 1,
      };

      if (input.maskPng) {
        params.mask = await toFile(input.maskPng, "mask.png", {
          type: "image/png",
        });
      }

      const response = await this.client.images.edit(params);
      const first = response.data?.[0];
      if (!first) {
        return {
          status: "failed",
          errorCode: "empty_response",
          errorMessage: "Generation failed.",
        };
      }

      if (first.b64_json) {
        return {
          status: "completed",
          imageBuffer: await normalizeImageSize(
            Buffer.from(first.b64_json, "base64"),
            input.width,
            input.height,
          ),
          mimeType: "image/png",
          providerRequestId: response._request_id ?? undefined,
        };
      }

      if (first.url) {
        return {
          status: "completed",
          temporaryUrl: first.url,
          providerRequestId: response._request_id ?? undefined,
        };
      }

      return {
        status: "failed",
        errorCode: "empty_response",
        errorMessage: "Generation failed.",
      };
    } catch (error) {
      return normalizeOpenAiError(error);
    }
  }
}

function normalizeOpenAiError(error: unknown): GenerationProviderResult {
  const message =
    error instanceof Error ? error.message : "Generation failed.";
  const lower = message.toLowerCase();
  let errorCode = "provider_error";
  if (lower.includes("safety") || lower.includes("moderation")) {
    errorCode = "safety_rejection";
  } else if (lower.includes("timeout")) {
    errorCode = "timeout";
  } else if (lower.includes("rate")) {
    errorCode = "rate_limited";
  }
  return {
    status: "failed",
    errorCode,
    errorMessage:
      errorCode === "safety_rejection"
        ? "This prompt was rejected by our safety policy. Please revise it and try again."
        : "Generation failed.",
  };
}
