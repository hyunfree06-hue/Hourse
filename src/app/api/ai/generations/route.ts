import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { calculateCreditCost } from "@/config/credits";
import { aiRuntimeConfig } from "@/config/editor";
import { requireApiUser } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createGenerationSchema } from "@/lib/validation/schemas";
import { getServerEnv, hasOpenAiKey } from "@/lib/validation/env.server";
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
  completeDesignGeneration,
  completeGeneration,
  failAndRefund,
} from "@/lib/ai/generation-service";
import {
  generateEditableDesign,
  preflightDesignStructuredOutputs,
  refineEditableDesign,
} from "@/lib/design-scene/design-generation";
import { fillDesignImagePlaceholders } from "@/lib/design-scene/fill-image-layers";
import { DESIGN_SCENE_VERSION } from "@/lib/design-scene/schema";
import { filterEditableRefinementObjects } from "@/lib/design-scene/refinement-selection";
import { assertDesignRegionSize } from "@/lib/design-scene/region";
import {
  DesignGenerationError,
  withCreditsRestoredMessage,
} from "@/lib/design-scene/errors";

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
    let designFormats: ReturnType<typeof preflightDesignStructuredOutputs> | null =
      null;

    if (input.mode === "design") {
      if (!hasOpenAiKey()) {
        throw new AppError(
          "PROVIDER_NOT_CONFIGURED",
          "Design generation is not configured.",
          503,
          undefined,
          requestId,
        );
      }

      logServerInfo({
        requestId,
        route: "POST /api/ai/generations",
        stage: "structured_output_schema",
        userId,
        projectId: input.projectId,
      });

      // Construct + validate Structured Outputs BEFORE any credit mutation.
      try {
        designFormats = preflightDesignStructuredOutputs();
      } catch (error) {
        logServerError({
          requestId,
          route: "POST /api/ai/generations",
          stage: "structured_output_schema",
          userId,
          projectId: input.projectId,
          code:
            error instanceof AppError ? error.code : "DESIGN_SCHEMA_INVALID",
          message:
            error instanceof AppError
              ? String(error.details ?? error.message)
              : error instanceof Error
                ? error.message
                : "schema preflight failed",
        });
        throw error instanceof AppError
          ? error
          : new AppError(
              "DESIGN_SCHEMA_INVALID",
              "Design generation is temporarily unavailable. Your credits were restored.",
              503,
              undefined,
              requestId,
            );
      }
    } else if (!availability[input.provider]) {
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

    // Design refinement intent is derived from validated editable selection only.
    // Never trust a client "refine" flag. Reject empty/invalid refine before credits.
    let designRefineObjects: unknown[] = [];
    let designRefineIds: string[] = [];
    if (input.mode === "design") {
      const claimedRefine =
        (input.selectedObjectIds?.length ?? 0) > 0 ||
        (input.selectedObjects?.length ?? 0) > 0;
      const filtered = filterEditableRefinementObjects(
        input.selectedObjects,
        input.selectedObjectIds,
      );
      if (claimedRefine && filtered.ids.length === 0) {
        throw new AppError(
          "INVALID_REFINEMENT_SELECTION",
          "Select at least one editable object to refine.",
          400,
          undefined,
          requestId,
        );
      }
      designRefineObjects = filtered.objects;
      designRefineIds = filtered.ids;

      // Reject unusably small Design frames before any credit mutation.
      if (designRefineIds.length === 0) {
        assertDesignRegionSize(
          input.selection.width,
          input.selection.height,
          requestId,
        );
      }
    }

    logServerInfo({
      requestId,
      route: "POST /api/ai/generations",
      stage: "credit_calculation",
      userId,
      projectId: input.projectId,
    });

    const cost = calculateCreditCost({
      provider: input.mode === "design" ? "openai" : input.provider,
      quality: input.quality,
      mode: input.mode,
    });
    creditsCharged = cost;

    const env = getServerEnv();
    const model =
      input.mode === "design"
        ? designFormats!.model
        : input.provider === "openai"
          ? resolveOpenAiImageModel(env.OPENAI_IMAGE_MODEL)
          : env.BFL_MODEL;

    const { data: generation, error: insertError } = await admin
      .from("ai_generations")
      .insert({
        user_id: auth.user.id,
        project_id: input.projectId,
        provider: input.mode === "design" ? "openai" : input.provider,
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
        output_type: input.mode === "design" ? "editable_design" : "raster_image",
        design_version: input.mode === "design" ? DESIGN_SCENE_VERSION : null,
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

    if (input.mode === "design") {
      logServerInfo({
        requestId,
        route: "POST /api/ai/generations",
        stage: "design_generation",
        userId,
        generationId,
      });

      const isRefine = designRefineIds.length > 0;

      if (isRefine) {
        const refined = await refineEditableDesign({
          prompt: input.prompt,
          width: input.selection.width,
          height: input.selection.height,
          quality: input.quality,
          selectedObjects: designRefineObjects,
          nearbySummary: input.nearbySummary,
          selectedBounds: {
            left: input.selection.left,
            top: input.selection.top,
            width: input.selection.width,
            height: input.selection.height,
          },
          requestId,
          generationId: generation.id,
          projectId: input.projectId,
          formats: designFormats
            ? {
                brief: designFormats.brief,
                scene: designFormats.scene,
                operations: designFormats.operations,
              }
            : undefined,
          model: designFormats?.model,
        });

        logServerInfo({
          requestId,
          route: "POST /api/ai/generations",
          stage: "generation_persistence",
          userId,
          generationId,
          projectId: input.projectId,
          operationCount: refined.operations.length,
        });

        // Persist operations so the client can retry apply without recharging.
        const completed = await completeDesignGeneration({
          admin,
          generationId: generation.id,
          scene: {
            version: 1,
            title: "Refined design",
            canvas: {
              width: Math.round(input.selection.width),
              height: Math.round(input.selection.height),
              background: "#ffffff",
            },
            palette: {
              primary: "#111111",
              secondary: "#666666",
              accent: "#2563eb",
              background: "#ffffff",
              text: "#111111",
            },
            objects: [
              {
                id: "refine-placeholder",
                name: "Refine placeholder",
                type: "rect",
                left: 0,
                top: 0,
                width: Math.max(64, Math.round(input.selection.width)),
                height: Math.max(64, Math.round(input.selection.height)),
                angle: 0,
                opacity: 0,
                visible: false,
                locked: true,
                layerIndex: 0,
                parentId: null,
                semanticRole: null,
                fill: null,
                stroke: null,
                strokeWidth: 0,
                cornerRadius: 0,
              },
            ],
          },
          brief: {
            refine: true,
            operations: refined.operations,
            selectedObjectIds: designRefineIds,
          },
          requestId,
        });

        logServerInfo({
          requestId,
          route: "POST /api/ai/generations",
          stage: "design_refine_complete",
          userId,
          generationId,
        });

        return NextResponse.json({
          generation: {
            ...completed,
            operations: refined.operations,
            output_type: "editable_design",
            refine: true,
            scene_graph_json: {
              scene: null,
              brief: {
                refine: true,
                operations: refined.operations,
                selectedObjectIds: designRefineIds,
              },
            },
          },
          requestId,
        });
      }

      const generated = await generateEditableDesign({
        prompt: input.prompt,
        width: input.selection.width,
        height: input.selection.height,
        quality: input.quality,
        requestId,
        generationId: generation.id,
        projectId: input.projectId,
        formats: designFormats
          ? {
              brief: designFormats.brief,
              scene: designFormats.scene,
              operations: designFormats.operations,
            }
          : undefined,
        model: designFormats?.model,
      });
      const brief = generated.brief;
      const scene = generated.scene;

      logServerInfo({
        requestId,
        route: "POST /api/ai/generations",
        stage: "generation_persistence",
        userId,
        generationId,
        projectId: input.projectId,
        objectCount: scene.objects.length,
      });

      const filled = await fillDesignImagePlaceholders({
        admin,
        userId: auth.user.id,
        projectId: input.projectId,
        generationId: generation.id,
        scene,
        quality: input.quality,
        requestId,
      });

      const completed = await completeDesignGeneration({
        admin,
        generationId: generation.id,
        scene: filled.scene,
        brief,
        requestId,
      });

      logServerInfo({
        requestId,
        route: "POST /api/ai/generations",
        stage: "design_generation_complete",
        userId,
        generationId,
        projectId: input.projectId,
        objectCount: filled.scene.objects.length,
      });

      return NextResponse.json({
        generation: {
          ...completed,
          scene: filled.scene,
          imageAssets: filled.imageAssets,
          output_type: "editable_design",
        },
        requestId,
      });
    }

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
      logServerInfo({
        requestId,
        route: "POST /api/ai/generations",
        stage: "refund_start",
        userId,
        generationId,
        projectId: input.projectId,
        code: providerResult.errorCode ?? "PROVIDER_REQUEST_FAILED",
      });
      const refundResult = await failAndRefund({
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
      logServerInfo({
        requestId,
        route: "POST /api/ai/generations",
        stage: "refund_complete",
        userId,
        generationId,
        projectId: input.projectId,
        refunded: refundResult.refunded,
        creditBalance: refundResult.creditBalance,
      });
      const { data: failed } = await admin
        .from("ai_generations")
        .select("*")
        .eq("id", generation.id)
        .single();
      return NextResponse.json(
        {
          error: {
            code: providerResult.errorCode ?? "PROVIDER_REQUEST_FAILED",
            message:
              providerResult.errorMessage ??
              "The image model couldn't complete this request.",
            requestId,
          },
          generation: failed,
          refunded: refundResult.refunded,
          creditBalance: refundResult.creditBalance,
          requestId,
        },
        { status: 502 },
      );
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
    const errorCode =
      error instanceof AppError ? error.code : "INTERNAL_ERROR";
    const failureStage =
      error instanceof DesignGenerationError
        ? error.failureStage
        : error instanceof AppError &&
            error.details &&
            typeof error.details === "object" &&
            "stage" in (error.details as object)
          ? String((error.details as { stage?: string }).stage ?? "generation_failed")
          : "generation_failed";

    let refunded = false;
    let creditBalance: number | null = null;
    let refundFailed = false;

    const baseMessage =
      errorCode === "DESIGN_SCHEMA_INVALID"
        ? "Design generation is temporarily unavailable."
        : error instanceof AppError
          ? error.message
          : "We couldn't create this design.";

    if (generationId && userId) {
      logServerInfo({
        requestId,
        route: "POST /api/ai/generations",
        stage: "generation_failed",
        userId,
        generationId,
        code: errorCode,
        failureStage,
      });
    }

    if (generationId && userId && creditsConsumed) {
      try {
        logServerInfo({
          requestId,
          route: "POST /api/ai/generations",
          stage: "refund_start",
          userId,
          generationId,
          code: errorCode,
          failureStage,
        });
        const admin = createServiceClient();
        const refundResult = await failAndRefund({
          admin,
          generationId,
          userId,
          amount: creditsCharged,
          errorCode,
          errorMessage: withCreditsRestoredMessage(baseMessage, true),
          requestId,
          shouldRefund: true,
        });
        refunded = refundResult.refunded;
        creditBalance = refundResult.creditBalance;
        creditsConsumed = false;
        logServerInfo({
          requestId,
          route: "POST /api/ai/generations",
          stage: "refund_complete",
          userId,
          generationId,
          code: errorCode,
          failureStage,
          refunded,
          creditBalance,
        });
      } catch (refundError) {
        refundFailed = true;
        logServerError({
          requestId,
          route: "POST /api/ai/generations",
          stage: "refund_failed",
          userId,
          generationId,
          code: "CREDIT_REFUND_ERROR",
          failureStage: "refund_failed",
          message:
            refundError instanceof Error ? refundError.message : "refund failed",
        });
      }
    } else if (generationId && userId) {
      try {
        const admin = createServiceClient();
        const refundResult = await failAndRefund({
          admin,
          generationId,
          userId,
          amount: 0,
          errorCode,
          errorMessage: baseMessage,
          requestId,
          shouldRefund: false,
        });
        creditBalance = refundResult.creditBalance;
      } catch {
        // best effort status update
      }
    }

    const userMessage = refundFailed
      ? "The design could not be created. We couldn't restore the credits automatically."
      : withCreditsRestoredMessage(baseMessage, refunded);

    if (error instanceof AppError && errorCode === "DESIGN_SCHEMA_INVALID") {
      return NextResponse.json(
        {
          error: {
            code: "DESIGN_SCHEMA_INVALID",
            message: userMessage,
            requestId,
          },
          refunded,
          creditBalance,
          requestId,
        },
        { status: 503 },
      );
    }

    if (error instanceof DesignGenerationError || error instanceof AppError) {
      const status =
        error instanceof DesignGenerationError
          ? error.status
          : error instanceof AppError
            ? error.status
            : 500;
      return NextResponse.json(
        {
          error: {
            code: errorCode,
            message: userMessage,
            requestId,
          },
          refunded,
          creditBalance,
          requestId,
        },
        { status },
      );
    }

    const res = toErrorResponse(error, requestId);
    return NextResponse.json(
      {
        ...res.body,
        refunded,
        creditBalance,
        requestId,
      },
      { status: res.status },
    );
  }
}
