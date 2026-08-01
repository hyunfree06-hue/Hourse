import { aiRuntimeConfig } from "@/config/editor";
import { getServerEnv, hasBflKey } from "@/lib/validation/env.server";
import type {
  EditImageInput,
  GenerateImageInput,
  GenerationProviderResult,
  GenerationProviderStatus,
  ImageGenerationProvider,
} from "./types";
import { downloadHttpsImage, normalizeImageSize } from "./image-utils";

type BflCreateResponse = {
  id?: string;
  status?: string;
  result?: { sample?: string };
  error?: string;
};

export class BflImageProvider implements ImageGenerationProvider {
  readonly id = "bfl" as const;
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor() {
    const env = getServerEnv();
    if (!hasBflKey()) {
      throw new Error("BFL_API_KEY가 설정되지 않았습니다.");
    }
    this.apiKey = env.BFL_API_KEY;
    this.baseUrl = env.BFL_API_BASE_URL.replace(/\/$/, "");
    this.model = env.BFL_MODEL;
  }

  async generate(input: GenerateImageInput): Promise<GenerationProviderResult> {
    try {
      const endpoint = `${this.baseUrl}/${input.model ?? this.model}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-key": this.apiKey,
        },
        body: JSON.stringify({
          prompt: input.prompt,
          width: snapToMultiple(input.width, 16),
          height: snapToMultiple(input.height, 16),
          output_format: "png",
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return {
          status: "failed",
          errorCode: "provider_error",
          errorMessage: text || "FLUX 요청에 실패했습니다.",
        };
      }

      const data = (await response.json()) as BflCreateResponse;
      if (!data.id) {
        return {
          status: "failed",
          errorCode: "empty_response",
          errorMessage: "FLUX 요청 ID를 받지 못했습니다.",
        };
      }

      return {
        status: "processing",
        providerRequestId: data.id,
      };
    } catch (error) {
      return {
        status: "failed",
        errorCode: "provider_error",
        errorMessage:
          error instanceof Error ? error.message : "FLUX 요청에 실패했습니다.",
      };
    }
  }

  async edit(input: EditImageInput): Promise<GenerationProviderResult> {
    try {
      const endpoint = `${this.baseUrl}/${input.model ?? this.model}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-key": this.apiKey,
        },
        body: JSON.stringify({
          prompt: input.prompt,
          width: snapToMultiple(input.width, 16),
          height: snapToMultiple(input.height, 16),
          output_format: "png",
          input_image: input.imagePng.toString("base64"),
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return {
          status: "failed",
          errorCode: "provider_error",
          errorMessage: text || "FLUX 편집 요청에 실패했습니다.",
        };
      }

      const data = (await response.json()) as BflCreateResponse;
      if (!data.id) {
        return {
          status: "failed",
          errorCode: "empty_response",
          errorMessage: "FLUX 요청 ID를 받지 못했습니다.",
        };
      }

      return {
        status: "processing",
        providerRequestId: data.id,
      };
    } catch (error) {
      return {
        status: "failed",
        errorCode: "provider_error",
        errorMessage:
          error instanceof Error ? error.message : "FLUX 편집에 실패했습니다.",
      };
    }
  }

  async getStatus(providerRequestId: string): Promise<GenerationProviderStatus> {
    const env = getServerEnv();
    const resultUrl = `${env.BFL_API_BASE_URL.replace(/\/$/, "")}/get_result?id=${encodeURIComponent(providerRequestId)}`;

    try {
      const response = await fetch(resultUrl, {
        headers: {
          accept: "application/json",
          "x-key": this.apiKey,
        },
      });

      if (!response.ok) {
        return {
          status: "failed",
          errorCode: "poll_failed",
          errorMessage: "FLUX 상태 조회에 실패했습니다.",
        };
      }

      const data = (await response.json()) as {
        status?: string;
        result?: { sample?: string };
        error?: string;
      };

      const status = (data.status ?? "").toLowerCase();
      if (status === "ready" || status === "completed" || status === "success") {
        const url = data.result?.sample;
        if (!url) {
          return {
            status: "failed",
            errorCode: "empty_response",
            errorMessage: "FLUX 결과 URL이 없습니다.",
          };
        }
        return {
          status: "completed",
          temporaryUrl: url,
          mimeType: "image/png",
        };
      }

      if (
        ["pending", "processing", "queued", "request moderated"].includes(
          status,
        ) ||
        status.startsWith("pending") ||
        status.includes("progress")
      ) {
        return { status: "processing" };
      }

      if (status.includes("error") || status === "failed") {
        return {
          status: "failed",
          errorCode: "provider_error",
          errorMessage: data.error || "FLUX 생성이 실패했습니다.",
        };
      }

      return { status: "processing" };
    } catch (error) {
      return {
        status: "failed",
        errorCode: "poll_failed",
        errorMessage:
          error instanceof Error ? error.message : "FLUX polling에 실패했습니다.",
      };
    }
  }
}

function snapToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

export async function resolveProviderResultImage(
  result: GenerationProviderResult | GenerationProviderStatus,
  width: number,
  height: number,
): Promise<Buffer> {
  if (result.imageBuffer) {
    return normalizeImageSize(result.imageBuffer, width, height);
  }
  if (result.temporaryUrl) {
    const downloaded = await downloadHttpsImage(result.temporaryUrl);
    return normalizeImageSize(downloaded, width, height);
  }
  throw new Error("결과 이미지가 없습니다.");
}

export { aiRuntimeConfig };
