import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { calculateCreditCost } from "@/config/credits";
import { aiRuntimeConfig } from "@/config/editor";
import { requireApiUser } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createGenerationSchema } from "@/lib/validation/schemas";
import { getServerEnv } from "@/lib/validation/env.server";
import { AppError, toErrorResponse } from "@/lib/utils/errors";
import { createImageProvider, getProviderAvailability } from "@/lib/ai/provider";
import { consumeCreditsAtomic } from "@/lib/ai/credits";
import {
  createFullMask,
  normalizeImageSize,
} from "@/lib/ai/image-utils";
import {
  completeGeneration,
  failAndRefund,
} from "@/lib/ai/generation-service";

export const runtime = "nodejs";

async function checkRateLimit(userId: string): Promise<void> {
  const admin = createServiceClient();
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await admin
    .from("ai_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);

  if (error) return;
  if ((count ?? 0) >= aiRuntimeConfig.rateLimitPerMinute) {
    throw new AppError(
      "rate_limited",
      "Too many requests. Please try again in a moment.",
      429,
    );
  }
}

export async function POST(req: Request) {
  let generationId: string | null = null;
  let userId: string | null = null;
  let creditsCharged = 0;

  try {
    const auth = await requireApiUser();
    if (auth.error) return auth.error;
    userId = auth.user.id;

    const body = await req.json();
    const input = createGenerationSchema.parse(body);

    const supabase = await createClient();
    const { data: project } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", input.projectId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!project) {
      throw new AppError("not_found", "Project not found", 404);
    }

    const availability = getProviderAvailability();
    if (!availability[input.provider]) {
      throw new AppError(
        "provider_unavailable",
        "Image generation is temporarily unavailable.",
        503,
      );
    }

    await checkRateLimit(auth.user.id);

    const admin = createServiceClient();
    const { data: existing } = await admin
      .from("ai_generations")
      .select("*")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ generation: existing });
    }

    const cost = calculateCreditCost({
      provider: input.provider,
      quality: input.quality,
      mode: input.mode,
    });
    creditsCharged = cost;

    const env = getServerEnv();
    const model =
      input.provider === "openai" ? env.OPENAI_IMAGE_MODEL : env.BFL_MODEL;

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
        return NextResponse.json({ generation: again });
      }
      throw new AppError("create_failed", "Unable to save generation request.", 500);
    }

    generationId = generation.id;

    await consumeCreditsAtomic({
      userId: auth.user.id,
      amount: cost,
      idempotencyKey: `generation:${input.idempotencyKey}`,
      generationId: generation.id,
      metadata: { provider: input.provider, mode: input.mode },
    });

    await admin
      .from("ai_generations")
      .update({ status: "processing" })
      .eq("id", generation.id);

    const provider = createImageProvider(input.provider);
    let providerResult;

    if (input.mode === "generate") {
      providerResult = await provider.generate({
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        width: input.selection.width,
        height: input.selection.height,
        quality: input.quality,
        model,
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
          "reference_required",
          "A reference image is required for edit or replace mode.",
          400,
        );
      }

      const normalized = await normalizeImageSize(
        referenceBuffer,
        input.selection.width,
        input.selection.height,
      );
      const mask = await createFullMask(
        input.selection.width,
        input.selection.height,
      );

      const refPath = `${auth.user.id}/${input.projectId}/${randomUUID()}.png`;
      await admin.storage.from("user-assets").upload(refPath, normalized, {
        contentType: "image/png",
        upsert: false,
      });
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
      });
    }

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
        errorCode: providerResult.errorCode ?? "provider_error",
        errorMessage:
          providerResult.errorMessage ?? "Generation failed. Your credits were restored.",
      });
      const { data: failed } = await admin
        .from("ai_generations")
        .select("*")
        .eq("id", generation.id)
        .single();
      return NextResponse.json({ generation: failed }, { status: 422 });
    }

    if (providerResult.status === "completed") {
      const completed = await completeGeneration({
        admin,
        generationId: generation.id,
        userId: auth.user.id,
        projectId: input.projectId,
        width: input.selection.width,
        height: input.selection.height,
        result: providerResult,
      });
      return NextResponse.json({ generation: completed });
    }

    const { data: processing } = await admin
      .from("ai_generations")
      .select("*")
      .eq("id", generation.id)
      .single();

    return NextResponse.json({ generation: processing });
  } catch (error) {
    if (generationId && userId && creditsCharged > 0) {
      try {
        const admin = createServiceClient();
        await failAndRefund({
          admin,
          generationId,
          userId,
          amount: creditsCharged,
          errorCode: error instanceof AppError ? error.code : "internal_error",
          errorMessage:
            error instanceof Error
              ? error.message
              : "Generation failed. Your credits were restored.",
        });
      } catch {
        // best effort
      }
    }
    const res = toErrorResponse(error);
    return NextResponse.json(res.body, { status: res.status });
  }
}
