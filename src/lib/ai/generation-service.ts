import { randomUUID } from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  AppError,
  logServerError,
  logServerInfo,
  supabaseErrorFields,
} from "@/lib/utils/errors";
import { refundCreditsAtomic } from "@/lib/ai/credits";
import type { ImageFitMode } from "@/lib/ai/image-utils";
import { resolveProviderResultImage } from "@/lib/ai/bfl-provider";
import {
  assertNotRawBase64OrJsonText,
  validateGeneratedImageBytes,
} from "@/lib/ai/decode-generated-image";
import type { GenerationProviderResult, GenerationProviderStatus } from "@/lib/ai/types";
import {
  DESIGN_SCENE_VERSION,
  type EditableDesignScene,
} from "@/lib/design-scene/schema";

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
}): Promise<{ refunded: boolean; creditBalance: number | null }> {
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
    const { data: profile } = await input.admin
      .from("profiles")
      .select("credit_balance")
      .eq("id", input.userId)
      .maybeSingle();
    return {
      refunded: false,
      creditBalance: profile?.credit_balance ?? null,
    };
  }

  const creditBalance = await refundCreditsAtomic({
    userId: input.userId,
    amount: input.amount,
    idempotencyKey: `generation_refund:${input.generationId}`,
    generationId: input.generationId,
    requestId: input.requestId,
  });

  return { refunded: true, creditBalance };
}

/**
 * Decode → validate → upload Uint8Array → verify stored object → assets row → complete.
 * Never marks completed before stored bytes decode as a real image.
 */
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
  provider?: string;
}) {
  const requestId = input.requestId ?? "unknown";

  let raw: Buffer;
  try {
    raw = await resolveProviderResultImage(
      input.result,
      input.width,
      input.height,
      input.fit ?? "cover",
    );
  } catch (error) {
    throw new AppError(
      "INVALID_GENERATED_IMAGE_BYTES",
      error instanceof Error
        ? error.message
        : "Generated image bytes could not be resolved.",
      502,
      undefined,
      requestId,
    );
  }

  assertNotRawBase64OrJsonText(raw);

  const validated = await validateGeneratedImageBytes(raw, {
    generationId: input.generationId,
    provider: input.provider,
    requestId,
  });

  const path = `${input.userId}/${input.projectId}/${randomUUID()}.${validated.extension}`;

  // Critical: upload Uint8Array, never a Node Buffer that may JSON-serialize.
  const { error: uploadError } = await input.admin.storage
    .from("generated-assets")
    .upload(path, validated.uploadBody, {
      contentType: validated.mime,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    logServerError({
      requestId,
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
      requestId,
    );
  }

  // Prove the stored object is decodable before completing the generation.
  const { data: stored, error: downloadError } = await input.admin.storage
    .from("generated-assets")
    .download(path);

  if (downloadError || !stored) {
    await input.admin.storage.from("generated-assets").remove([path]);
    logServerError({
      requestId,
      route: "completeGeneration",
      stage: "storage_verify_download",
      projectId: input.projectId,
      userId: input.userId,
      generationId: input.generationId,
      supabase: supabaseErrorFields(downloadError),
    });
    throw new AppError(
      "STORAGE_UPLOAD_FAILED",
      "The image was generated, but we couldn't verify storage.",
      500,
      undefined,
      requestId,
    );
  }

  const storedBytes = Buffer.from(await stored.arrayBuffer());
  let verified;
  try {
    verified = await validateGeneratedImageBytes(storedBytes, {
      generationId: input.generationId,
      provider: input.provider,
      requestId,
    });
  } catch (error) {
    await input.admin.storage.from("generated-assets").remove([path]);
    logServerError({
      requestId,
      route: "completeGeneration",
      stage: "storage_verify_invalid",
      projectId: input.projectId,
      userId: input.userId,
      generationId: input.generationId,
      message:
        error instanceof Error ? error.message : "stored object invalid",
    });
    throw new AppError(
      "INVALID_GENERATED_IMAGE_BYTES",
      "Stored generated image is not valid image bytes.",
      502,
      undefined,
      requestId,
    );
  }

  if (verified.mime !== validated.mime) {
    await input.admin.storage.from("generated-assets").remove([path]);
    throw new AppError(
      "INVALID_GENERATED_IMAGE_BYTES",
      "Stored generated image MIME mismatch.",
      502,
      undefined,
      requestId,
    );
  }

  logServerInfo({
    requestId,
    route: "completeGeneration",
    stage: "storage_verified",
    generationId: input.generationId,
    userId: input.userId,
    projectId: input.projectId,
    message: `pathExt=${validated.extension};mime=${validated.mime};bytes=${verified.byteLength};format=${verified.format}`,
  });

  const { data: asset, error: assetError } = await input.admin
    .from("assets")
    .insert({
      user_id: input.userId,
      project_id: input.projectId,
      asset_type: "generated",
      storage_bucket: "generated-assets",
      storage_path: path,
      mime_type: validated.mime,
      file_size: verified.byteLength,
      width: Math.round(input.width),
      height: Math.round(input.height),
    })
    .select("*")
    .single();

  if (assetError || !asset) {
    await input.admin.storage.from("generated-assets").remove([path]);
    logServerError({
      requestId,
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
      requestId,
    );
  }

  const { data: signed } = await input.admin.storage
    .from("generated-assets")
    .createSignedUrl(path, 60 * 10);

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

/**
 * Persist a validated editable design scene (no raster output asset required).
 */
export async function completeDesignGeneration(input: {
  admin: Admin;
  generationId: string;
  scene: EditableDesignScene;
  brief?: unknown;
  requestId?: string;
}) {
  const { data: generation, error } = await input.admin
    .from("ai_generations")
    .update({
      status: "completed",
      output_type: "editable_design",
      scene_graph_json: {
        scene: input.scene,
        brief: (input.brief ?? null) as import("@/types/database").Json | null,
      },
      design_version: DESIGN_SCENE_VERSION,
      completed_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    })
    .eq("id", input.generationId)
    .select("*")
    .single();

  if (error || !generation) {
    throw new AppError(
      "GENERATION_CREATE_FAILED",
      "Unable to save design generation.",
      500,
      undefined,
      input.requestId,
    );
  }

  return generation;
}
