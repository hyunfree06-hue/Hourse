import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  AppError,
  createRequestId,
  logServerError,
  logServerInfo,
  supabaseErrorFields,
  toErrorResponse,
} from "@/lib/utils/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ generationId: string }> };

const SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 minutes

/**
 * Issue a fresh signed URL for an already-stored generated asset.
 * Does not call providers and does not consume credits.
 */
export async function POST(_req: Request, { params }: Params) {
  const requestId = createRequestId();
  try {
    const auth = await requireApiUser();
    if (auth.error) return auth.error;
    const { generationId } = await params;
    const admin = createServiceClient();

    const { data: generation, error } = await admin
      .from("ai_generations")
      .select("id, user_id, status, output_asset_id")
      .eq("id", generationId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error || !generation) {
      throw new AppError("NOT_FOUND", "Generation not found", 404, undefined, requestId);
    }

    if (generation.status !== "completed" || !generation.output_asset_id) {
      throw new AppError(
        "ASSET_NOT_READY",
        "The generated image is not ready yet.",
        409,
        undefined,
        requestId,
      );
    }

    const { data: asset, error: assetError } = await admin
      .from("assets")
      .select("id, storage_bucket, storage_path, mime_type, file_size")
      .eq("id", generation.output_asset_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (assetError || !asset) {
      logServerError({
        requestId,
        route: "POST /api/ai/generations/[id]/signed-url",
        stage: "asset_lookup",
        generationId,
        userId: auth.user.id,
        supabase: supabaseErrorFields(assetError),
      });
      throw new AppError(
        "ASSET_NOT_FOUND",
        "The generated image could not be found.",
        404,
        undefined,
        requestId,
      );
    }

    const { data: signed, error: signError } = await admin.storage
      .from(asset.storage_bucket)
      .createSignedUrl(asset.storage_path, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed?.signedUrl) {
      logServerError({
        requestId,
        route: "POST /api/ai/generations/[id]/signed-url",
        stage: "create_signed_url",
        generationId,
        userId: auth.user.id,
        assetId: asset.id,
        bucket: asset.storage_bucket,
        objectPath: asset.storage_path,
        supabase: supabaseErrorFields(signError),
      });
      throw new AppError(
        "SIGNED_URL_FAILED",
        "We couldn't prepare the image for the canvas.",
        500,
        undefined,
        requestId,
      );
    }

    logServerInfo({
      requestId,
      route: "POST /api/ai/generations/[id]/signed-url",
      stage: "signed_url_issued",
      generationId,
      userId: auth.user.id,
      assetId: asset.id,
      bucket: asset.storage_bucket,
      objectPath: asset.storage_path,
    });

    return NextResponse.json({
      requestId,
      generationId: generation.id,
      assetId: asset.id,
      bucket: asset.storage_bucket,
      path: asset.storage_path,
      mimeType: asset.mime_type,
      expiresIn: SIGNED_URL_TTL_SECONDS,
      signedUrl: signed.signedUrl,
      creditsCharged: 0,
    });
  } catch (error) {
    const res = toErrorResponse(error, requestId);
    return NextResponse.json(res.body, { status: res.status });
  }
}
