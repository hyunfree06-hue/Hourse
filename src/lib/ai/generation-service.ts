import { randomUUID } from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/utils/errors";
import { refundCreditsAtomic } from "@/lib/ai/credits";
import { validateImageBuffer } from "@/lib/ai/image-utils";
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
  result: GenerationProviderResult | GenerationProviderStatus;
}) {
  const buffer = await resolveProviderResultImage(
    input.result,
    input.width,
    input.height,
  );
  const meta = await validateImageBuffer(buffer);
  const path = `${input.userId}/${input.projectId}/${randomUUID()}.png`;

  const { error: uploadError } = await input.admin.storage
    .from("generated-assets")
    .upload(path, buffer, { contentType: "image/png", upsert: false });

  if (uploadError) {
    throw new AppError("upload_failed", "Unable to save the result image.", 500);
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
      width: meta.width,
      height: meta.height,
    })
    .select("*")
    .single();

  if (assetError || !asset) {
    throw new AppError("asset_failed", "Unable to save asset record.", 500);
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
