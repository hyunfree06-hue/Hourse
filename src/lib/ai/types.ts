import type { AiMode, AiProviderId, AiQuality } from "@/config/credits";

export type GenerateImageInput = {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  quality: AiQuality;
  model?: string;
};

export type EditImageInput = {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  quality: AiQuality;
  imagePng: Buffer;
  maskPng?: Buffer;
  model?: string;
  mode: Extract<AiMode, "edit" | "replace">;
};

export type GenerationProviderResult = {
  providerRequestId?: string;
  status: "completed" | "processing" | "failed";
  imageBuffer?: Buffer;
  mimeType?: string;
  temporaryUrl?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type GenerationProviderStatus = {
  status: "completed" | "processing" | "failed";
  imageBuffer?: Buffer;
  mimeType?: string;
  temporaryUrl?: string;
  errorCode?: string;
  errorMessage?: string;
};

export interface ImageGenerationProvider {
  readonly id: AiProviderId;
  generate(input: GenerateImageInput): Promise<GenerationProviderResult>;
  edit(input: EditImageInput): Promise<GenerationProviderResult>;
  getStatus?(
    providerRequestId: string,
  ): Promise<GenerationProviderStatus>;
}
