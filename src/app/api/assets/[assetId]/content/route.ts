import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  detectImageKindFromBytes,
  mimeFromImageKind,
  signatureHexPreview,
} from "@/lib/canvas/image-bytes";
import {
  AppError,
  createRequestId,
  logServerError,
  logServerInfo,
  supabaseErrorFields,
  toErrorResponse,
} from "@/lib/utils/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ assetId: string }> };

/**
 * Same-origin private asset stream for Safari-safe Fabric loading.
 * Authenticated + ownership-checked. Streams real image bytes (not JSON).
 */
export async function GET(_req: Request, { params }: Params) {
  const requestId = createRequestId();
  try {
    const auth = await requireApiUser();
    if (auth.error) return auth.error;
    const { assetId } = await params;
    const admin = createServiceClient();

    const { data: asset, error } = await admin
      .from("assets")
      .select(
        "id, user_id, storage_bucket, storage_path, mime_type, file_size",
      )
      .eq("id", assetId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error) {
      logServerError({
        requestId,
        route: "GET /api/assets/[assetId]/content",
        stage: "asset_lookup",
        userId: auth.user.id,
        assetId,
        supabase: supabaseErrorFields(error),
      });
      throw new AppError(
        "ASSET_LOOKUP_FAILED",
        "Unable to load asset.",
        500,
        undefined,
        requestId,
      );
    }

    if (!asset) {
      throw new AppError("NOT_FOUND", "Asset not found", 404, undefined, requestId);
    }

    const { data: file, error: downloadError } = await admin.storage
      .from(asset.storage_bucket)
      .download(asset.storage_path);

    if (downloadError || !file) {
      logServerError({
        requestId,
        route: "GET /api/assets/[assetId]/content",
        stage: "storage_download",
        userId: auth.user.id,
        assetId,
        bucket: asset.storage_bucket,
        objectPath: asset.storage_path,
        supabase: supabaseErrorFields(downloadError),
      });
      throw new AppError(
        "ASSET_DOWNLOAD_FAILED",
        "Unable to load asset.",
        502,
        undefined,
        requestId,
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const kind = detectImageKindFromBytes(buffer);

    if (!kind) {
      logServerError({
        requestId,
        route: "GET /api/assets/[assetId]/content",
        stage: "invalid_image_bytes",
        userId: auth.user.id,
        assetId,
        message: `bytes=${buffer.length};sig=${signatureHexPreview(buffer, 4)};dbMime=${asset.mime_type ?? ""}`,
      });
      throw new AppError(
        "INVALID_GENERATED_IMAGE_TYPE",
        "Asset is not a valid image.",
        415,
        undefined,
        requestId,
      );
    }

    const contentType = mimeFromImageKind(kind);

    logServerInfo({
      requestId,
      route: "GET /api/assets/[assetId]/content",
      stage: "stream",
      userId: auth.user.id,
      assetId,
      bucket: asset.storage_bucket,
      objectPath: asset.storage_path,
      message: `bytes=${buffer.length};type=${contentType};sig=${signatureHexPreview(buffer, 4)}`,
    });

    // Uint8Array body — guarantees binary image bytes, not JSON.
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    const res = toErrorResponse(error, requestId);
    return NextResponse.json(res.body, { status: res.status });
  }
}
