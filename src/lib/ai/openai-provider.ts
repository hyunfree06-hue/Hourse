import OpenAI from "openai";
import { toFile } from "openai";
import { getServerEnv, hasOpenAiKey } from "@/lib/validation/env.server";
import type {
  EditImageInput,
  GenerateImageInput,
  GenerationProviderResult,
  ImageGenerationProvider,
} from "./types";
import { fitImageToSelection } from "./image-utils";
import {
  isGptImageModel,
  normalizeOpenAiImageSize,
  resolveOpenAiImageModel,
} from "./size";
import { logServerError } from "@/lib/utils/errors";

function mapQuality(
  quality: GenerateImageInput["quality"],
): "low" | "medium" | "high" {
  if (quality === "fast") return "low";
  if (quality === "high") return "high";
  return "medium";
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
    this.model = resolveOpenAiImageModel(env.OPENAI_IMAGE_MODEL);
  }

  async generate(input: GenerateImageInput): Promise<GenerationProviderResult> {
    const model = resolveOpenAiImageModel(input.model ?? this.model);
    const normalized = normalizeOpenAiImageSize(input.width, input.height);
    const fit = input.fit ?? "cover";

    try {
      const response = await this.client.images.generate({
        model,
        prompt: input.prompt,
        size: normalized.size,
        quality: mapQuality(input.quality),
        n: 1,
        ...(isGptImageModel(model) ? { output_format: "png" as const } : {}),
      });

      const first = response.data?.[0];
      if (!first) {
        return {
          status: "failed",
          errorCode: "PROVIDER_REQUEST_FAILED",
          errorMessage: "The image model couldn't complete this request.",
        };
      }

      if (first.b64_json) {
        const buffer = Buffer.from(first.b64_json, "base64");
        return {
          status: "completed",
          imageBuffer: await fitImageToSelection(
            buffer,
            input.width,
            input.height,
            fit,
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
          // Downstream resolver fits to selection
        };
      }

      return {
        status: "failed",
        errorCode: "PROVIDER_REQUEST_FAILED",
        errorMessage: "The image model couldn't complete this request.",
      };
    } catch (error) {
      return normalizeOpenAiError(error);
    }
  }

  async edit(input: EditImageInput): Promise<GenerationProviderResult> {
    const model = resolveOpenAiImageModel(input.model ?? this.model);
    const normalized = normalizeOpenAiImageSize(input.width, input.height);
    const fit = input.fit ?? "cover";

    try {
      // Edit APIs expect the input image near the target generation size.
      const imageForEdit = await fitImageToSelection(
        input.imagePng,
        normalized.width,
        normalized.height,
        "cover",
      );
      const imageFile = await toFile(imageForEdit, "image.png", {
        type: "image/png",
      });

      const params: OpenAI.Images.ImageEditParams = {
        model,
        image: imageFile,
        prompt: input.prompt,
        size: normalized.size,
        n: 1,
        ...(isGptImageModel(model)
          ? {
              quality: mapQuality(input.quality),
              output_format: "png" as const,
            }
          : {}),
      };

      if (input.maskPng) {
        const maskForEdit = await fitImageToSelection(
          input.maskPng,
          normalized.width,
          normalized.height,
          "cover",
        );
        params.mask = await toFile(maskForEdit, "mask.png", {
          type: "image/png",
        });
      }

      const response = await this.client.images.edit(params);
      const first = response.data?.[0];
      if (!first) {
        return {
          status: "failed",
          errorCode: "PROVIDER_REQUEST_FAILED",
          errorMessage: "The image model couldn't complete this request.",
        };
      }

      if (first.b64_json) {
        return {
          status: "completed",
          imageBuffer: await fitImageToSelection(
            Buffer.from(first.b64_json, "base64"),
            input.width,
            input.height,
            fit,
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
        errorCode: "PROVIDER_REQUEST_FAILED",
        errorMessage: "The image model couldn't complete this request.",
      };
    } catch (error) {
      return normalizeOpenAiError(error);
    }
  }
}

function normalizeOpenAiError(error: unknown): GenerationProviderResult {
  const anyErr = error as {
    status?: number;
    code?: string;
    type?: string;
    message?: string;
    error?: { code?: string; type?: string; message?: string };
    requestID?: string;
    request_id?: string;
  };

  logServerError({
    requestId: anyErr.requestID ?? anyErr.request_id ?? "openai-unknown",
    route: "openai-images",
    stage: "provider_request",
    provider: {
      status: anyErr.status,
      code: anyErr.code ?? anyErr.error?.code,
      type: anyErr.type ?? anyErr.error?.type,
      request_id: anyErr.requestID ?? anyErr.request_id,
    },
    message: anyErr.message ?? anyErr.error?.message,
  });

  const message =
    error instanceof Error ? error.message : "Generation failed.";
  const lower = message.toLowerCase();
  let errorCode = "PROVIDER_REQUEST_FAILED";
  if (lower.includes("safety") || lower.includes("moderation")) {
    errorCode = "SAFETY_REJECTION";
  } else if (lower.includes("timeout")) {
    errorCode = "TIMEOUT";
  } else if (lower.includes("rate")) {
    errorCode = "RATE_LIMITED";
  } else if (lower.includes("size") || lower.includes("resolution")) {
    errorCode = "INVALID_GENERATION_SIZE";
  }

  return {
    status: "failed",
    errorCode,
    errorMessage:
      errorCode === "SAFETY_REJECTION"
        ? "This prompt was rejected by our safety policy. Please revise it and try again."
        : errorCode === "INVALID_GENERATION_SIZE"
          ? "This selection could not be prepared for the selected model."
          : "The image model couldn't complete this request. Your credits were restored.",
  };
}
