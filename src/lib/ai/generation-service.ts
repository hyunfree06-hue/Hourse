import { randomUUID } from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  AppError,
  logServerError,
  supabaseErrorFields,
} from "@/lib/utils/errors";
import { refundCreditsAtomic } from "@/lib/ai/credits";
import { validateImageBuffer } from "@/lib/ai/image-utils";
import type { ImageFitMode } from "@/lib/ai/image-utils";
import { resolveProviderResultImage } from "@/lib/ai/bfl-provider";
import type { GenerationProviderResult, GenerationProviderStatus } from "@/lib/ai/types";

type Admin = ReturnType<typeof createServiceClient>;

export async function failAndRefund(input: {
  admin: Admin;
  generationId: string;
  userId: string;
  amount: number;
  errorCode: string;
  errorMessage: string;
  requestId?: string;
  shouldRefund?: boolean;
}) {
  await input.admin
    .from("ai_generations")
    .update({
      status: "failed",
      error_code: input.errorCode,
      error_message: input.errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", input.generationId);

  if (input.shouldRefund === false || input.amount <= 0) {
    return;
  }

  await refundCreditsAtomic({
    userId: input.userId,
    amount: input.amount,
    idempotencyKey: `generation_refund:${input.generationId}`,
    generationId: input.generationId,
  });
}

export async function completeGeneration(input: {
  admin: Admin;
  generationId: string;
  userId: string;
  projectId: string;
  width: number;
  height: number;
  fit?: ImageFitMode;
  result: GenerationProviderResult | GenerationProviderStatus;
  requestId?: string;
}) {
  const buffer = await resolveProviderResultImage(
    input.result,
    input.width,
    input.height,
    input.fit ?? "cover",
  );
  const meta = await validateImageBuffer(buffer);
  const path = `${input.userId}/${input.projectId}/${randomUUID()}.png`;

  const { error: uploadError } = await input.admin.storage
    .from("generated-assets")
    .upload(path, buffer, { contentType: "image/png", upsert: false });

  if (uploadError) {
    logServerError({
      requestId: input.requestId ?? "unknown",
      route: "completeGeneration",
      stage: "storage_upload",
      projectId: input.projectId,
      userId: input.userId,
      generationId: input.generationId,
      supabase: supabaseErrorFields(uploadError),
    });
    throw new AppError(
      "STORAGE_UPLOAD_FAILED",
      "The image was generated, but we couldn't add it to your project.",
      500,
      undefined,
      input.requestId,
    );
  }

  const { data: asset, error: assetError } = await input.admin
    .from("assets")
    .insert({
      user_id: input.userId,
      project_id: input.projectId,
      asset_type: "generated",
      storage_bucket: "generated-assets",
      storage_path: path,
      mime_type: meta.mimeType,
      file_size: buffer.length,
      width: Math.round(input.width),
      height: Math.round(input.height),
    })
    .select("*")
    .single();

  if (assetError || !asset) {
    logServerError({
      requestId: input.requestId ?? "unknown",
      route: "completeGeneration",
      stage: "asset_insert",
      projectId: input.projectId,
      userId: input.userId,
      generationId: input.generationId,
      supabase: supabaseErrorFields(assetError),
    });
    throw new AppError(
      "STORAGE_UPLOAD_FAILED",
      "The image was generated, but we couldn't add it to your project.",
      500,
      undefined,
      input.requestId,
    );
  }

  const { data: signed } = await input.admin.storage
    .from("generated-assets")
    .createSignedUrl(path, 60 * 30);

  const { data: generation } = await input.admin
    .from("ai_generations")
    .update({
      status: "completed",
      output_asset_id: asset.id,
      completed_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    })
    .eq("id", input.generationId)
    .select("*")
    .single();

  return {
    ...generation,
    signedUrl: signed?.signedUrl ?? null,
    asset,
  };
}
