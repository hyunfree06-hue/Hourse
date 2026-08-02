import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { calculateCreditCost } from "@/config/credits";
import { aiRuntimeConfig } from "@/config/editor";
import { requireApiUser } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createGenerationSchema } from "@/lib/validation/schemas";
import { getServerEnv } from "@/lib/validation/env.server";
import {
  AppError,
  createRequestId,
  logServerError,
  logServerInfo,
  supabaseErrorFields,
  toErrorResponse,
} from "@/lib/utils/errors";
import { createImageProvider, getProviderAvailability } from "@/lib/ai/provider";
import { consumeCreditsAtomic } from "@/lib/ai/credits";
import { createFullMask, fitImageToSelection } from "@/lib/ai/image-utils";
import { resolveOpenAiImageModel } from "@/lib/ai/size";
import {
  completeGeneration,
  failAndRefund,
} from "@/lib/ai/generation-service";

export const runtime = "nodejs";

async function checkRateLimit(userId: string, requestId: string): Promise<void> {
  const admin = createServiceClient();
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await admin
    .from("ai_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);

  if (error) {
    logServerError({
      requestId,
      route: "POST /api/ai/generations",
      stage: "rate_limit",
      userId,
      supabase: supabaseErrorFields(error),
    });
    return;
  }
  if ((count ?? 0) >= aiRuntimeConfig.rateLimitPerMinute) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many requests. Please try again in a moment.",
      429,
      undefined,
      requestId,
    );
  }
}

export async function POST(req: Request) {
  const requestId = createRequestId();
  let generationId: string | null = null;
  let userId: string | null = null;
  let creditsCharged = 0;
  let creditsConsumed = false;

  try {
    logServerInfo({
      requestId,
      route: "POST /api/ai/generations",
      stage: "auth",
    });

    const auth = await requireApiUser();
    if (auth.error) return auth.error;
    userId = auth.user.id;

    const body = await req.json();
    const input = createGenerationSchema.parse(body);

    logServerInfo({
      requestId,
      route: "POST /api/ai/generations",
      stage: "request_validation",
      projectId: input.projectId,
      userId,
    });

    const supabase = await createClient();
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", input.projectId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (projectError) {
      logServerError({
        requestId,
        route: "POST /api/ai/generations",
        stage: "project_ownership",
        projectId: input.projectId,
        userId,
        supabase: supabaseErrorFields(projectError),
      });
      throw new AppError(
        "PROJECT_SAVE_FAILED",
        "We couldn't verify this project.",
        500,
        undefined,
        requestId,
      );
    }

    if (!project) {
      throw new AppError("NOT_FOUND", "Project not found", 404, undefined, requestId);
    }

    const availability = getProviderAvailability();
    if (!availability[input.provider]) {
      throw new AppError(
        "PROVIDER_NOT_CONFIGURED",
        "This model is not configured.",
        503,
        undefined,
        requestId,
      );
    }

    await checkRateLimit(auth.user.id, requestId);

    const admin = createServiceClient();
    const { data: existing } = await admin
      .from("ai_generations")
      .select("*")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ generation: existing, requestId });
    }

    logServerInfo({
      requestId,
      route: "POST /api/ai/generations",
      stage: "credit_calculation",
      userId,
      projectId: input.projectId,
    });

    const cost = calculateCreditCost({
      provider: input.provider,
      quality: input.quality,
      mode: input.mode,
    });
    creditsCharged = cost;

    const env = getServerEnv();
    const model =
      input.provider === "openai"
        ? resolveOpenAiImageModel(env.OPENAI_IMAGE_MODEL)
        : env.BFL_MODEL;

    const { data: generation, error: insertError } = await admin
      .from("ai_generations")
      .insert({
        user_id: auth.user.id,
        project_id: input.projectId,
        provider: input.provider,
        model,
        mode: input.mode,
        prompt: input.prompt,
        negative_prompt: input.negativePrompt ?? null,
        quality: input.quality,
        status: "queued",
        selection_data: {
          ...input.selection,
          fit: input.fit,
        },
        credits_charged: cost,
        idempotency_key: input.idempotencyKey,
      })
      .select("*")
      .single();

    if (insertError || !generation) {
      if (insertError?.code === "23505") {
        const { data: again } = await admin
          .from("ai_generations")
          .select("*")
          .eq("idempotency_key", input.idempotencyKey)
          .single();
        return NextResponse.json({ generation: again, requestId });
      }
      logServerError({
        requestId,
        route: "POST /api/ai/generations",
        stage: "generation_row_insert",
        projectId: input.projectId,
        userId,
        supabase: supabaseErrorFields(insertError),
      });
      throw new AppError(
        "GENERATION_CREATE_FAILED",
        "Unable to save generation request.",
        500,
        undefined,
        requestId,
      );
    }

    generationId = generation.id;

    logServerInfo({
      requestId,
      route: "POST /api/ai/generations",
      stage: "credit_consumption",
      userId,
      generationId,
    });

    await consumeCreditsAtomic({
      userId: auth.user.id,
      amount: cost,
      idempotencyKey: `generation:${input.idempotencyKey}`,
      generationId: generation.id,
      metadata: { provider: input.provider, mode: input.mode },
      requestId,
    });
    creditsConsumed = true;

    await admin
      .from("ai_generations")
      .update({ status: "processing" })
      .eq("id", generation.id);

    const provider = createImageProvider(input.provider);
    let providerResult;

    logServerInfo({
      requestId,
      route: "POST /api/ai/generations",
      stage: "provider_request",
      userId,
      generationId,
    });

    if (input.mode === "generate") {
      providerResult = await provider.generate({
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        width: input.selection.width,
        height: input.selection.height,
        quality: input.quality,
        model,
        fit: input.fit,
      });
    } else {
      let referenceBuffer: Buffer | null = null;

      if (input.referenceAssetId) {
        const { data: asset } = await admin
          .from("assets")
          .select("*")
          .eq("id", input.referenceAssetId)
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (asset) {
          const { data: file } = await admin.storage
            .from(asset.storage_bucket)
            .download(asset.storage_path);
          if (file) {
            referenceBuffer = Buffer.from(await file.arrayBuffer());
          }
        }
      }

      if (!referenceBuffer && body.referenceImageBase64) {
        referenceBuffer = Buffer.from(
          String(body.referenceImageBase64).replace(/^data:image\/\w+;base64,/, ""),
          "base64",
        );
      }

      if (!referenceBuffer) {
        throw new AppError(
          "REFERENCE_REQUIRED",
          "A reference image is required for edit or replace mode.",
          400,
          undefined,
          requestId,
        );
      }

      const normalized = await fitImageToSelection(
        referenceBuffer,
        input.selection.width,
        input.selection.height,
        "cover",
      );
      const mask = await createFullMask(
        input.selection.width,
        input.selection.height,
      );

      const refPath = `${auth.user.id}/${input.projectId}/${randomUUID()}.png`;
      const { error: refUploadError } = await admin.storage
        .from("user-assets")
        .upload(refPath, new Uint8Array(normalized), {
          contentType: "image/png",
          cacheControl: "3600",
          upsert: false,
        });

      if (refUploadError) {
        logServerError({
          requestId,
          route: "POST /api/ai/generations",
          stage: "storage_upload",
          projectId: input.projectId,
          userId,
          generationId,
          supabase: supabaseErrorFields(refUploadError),
        });
        throw new AppError(
          "STORAGE_UPLOAD_FAILED",
          "The image was generated, but we couldn't add it to your project.",
          500,
          undefined,
          requestId,
        );
      }

      const { data: refAsset } = await admin
        .from("assets")
        .insert({
          user_id: auth.user.id,
          project_id: input.projectId,
          asset_type: "reference",
          storage_bucket: "user-assets",
          storage_path: refPath,
          mime_type: "image/png",
          file_size: normalized.length,
          width: Math.round(input.selection.width),
          height: Math.round(input.selection.height),
        })
        .select("id")
        .single();

      if (refAsset) {
        await admin
          .from("ai_generations")
          .update({ source_asset_id: refAsset.id })
          .eq("id", generation.id);
      }

      providerResult = await provider.edit({
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        width: input.selection.width,
        height: input.selection.height,
        quality: input.quality,
        imagePng: normalized,
        maskPng: mask,
        model,
        mode: input.mode === "edit" ? "edit" : "replace",
        fit: input.fit,
      });
    }

    logServerInfo({
      requestId,
      route: "POST /api/ai/generations",
      stage: "provider_response",
      userId,
      generationId,
      code: providerResult.status,
    });

    if (providerResult.providerRequestId) {
      await admin
        .from("ai_generations")
        .update({ provider_request_id: providerResult.providerRequestId })
        .eq("id", generation.id);
    }

    if (providerResult.status === "failed") {
      await failAndRefund({
        admin,
        generationId: generation.id,
        userId: auth.user.id,
        amount: cost,
        errorCode: providerResult.errorCode ?? "PROVIDER_REQUEST_FAILED",
        errorMessage:
          providerResult.errorMessage ??
          "The image model couldn't complete this request. Your credits were restored.",
        requestId,
        shouldRefund: creditsConsumed,
      });
      creditsConsumed = false;
      const { data: failed } = await admin
        .from("ai_generations")
        .select("*")
        .eq("id", generation.id)
        .single();
      return NextResponse.json({ generation: failed, requestId }, { status: 422 });
    }

    if (providerResult.status === "completed") {
      const completed = await completeGeneration({
        admin,
        generationId: generation.id,
        userId: auth.user.id,
        projectId: input.projectId,
        width: input.selection.width,
        height: input.selection.height,
        fit: input.fit,
        result: providerResult,
        requestId,
        provider: input.provider,
      });
      logServerInfo({
        requestId,
        route: "POST /api/ai/generations",
        stage: "generation_complete",
        userId,
        generationId,
      });
      return NextResponse.json({ generation: completed, requestId });
    }

    const { data: processing } = await admin
      .from("ai_generations")
      .select("*")
      .eq("id", generation.id)
      .single();

    return NextResponse.json({ generation: processing, requestId });
  } catch (error) {
    if (generationId && userId && creditsConsumed) {
      try {
        const admin = createServiceClient();
        await failAndRefund({
          admin,
          generationId,
          userId,
          amount: creditsCharged,
          errorCode: error instanceof AppError ? error.code : "INTERNAL_ERROR",
          errorMessage:
            error instanceof AppError
              ? error.message
              : "Generation failed. Your credits were restored.",
          requestId,
          shouldRefund: true,
        });
      } catch (refundError) {
        logServerError({
          requestId,
          route: "POST /api/ai/generations",
          stage: "refund",
          userId,
          generationId,
          message:
            refundError instanceof Error ? refundError.message : "refund failed",
        });
      }
    } else if (generationId && userId) {
      try {
        const admin = createServiceClient();
        await failAndRefund({
          admin,
          generationId,
          userId,
          amount: 0,
          errorCode: error instanceof AppError ? error.code : "INTERNAL_ERROR",
          errorMessage:
            error instanceof AppError
              ? error.message
              : "Generation failed.",
          requestId,
          shouldRefund: false,
        });
      } catch {
        // best effort status update
      }
    }
    const res = toErrorResponse(error, requestId);
    return NextResponse.json(res.body, { status: res.status });
  }
}
