import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveStoredImageBytes } from "@/lib/assets/resolve-stored-image";
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
 *
 * GET has no request body — do NOT validate request Content-Type.
 * Validate downloaded Storage bytes (Sharp + magic), not DB mime_type.
 * application/octet-stream / null / empty DB mime must still succeed for valid images.
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

    const raw = Buffer.from(await file.arrayBuffer());
    // Ignore DB mime / Blob.type — including application/octet-stream, null, "".
    const resolved = await resolveStoredImageBytes(raw, { requestId });

    // Opportunistic repair: fix wrong/missing assets.mime_type without regenerating.
    const dbMime = (asset.mime_type ?? "").trim().toLowerCase();
    if (dbMime !== resolved.mimeType) {
      void admin
        .from("assets")
        .update({ mime_type: resolved.mimeType })
        .eq("id", asset.id)
        .eq("user_id", auth.user.id)
        .then(({ error: repairError }) => {
          if (repairError) {
            logServerError({
              requestId,
              route: "GET /api/assets/[assetId]/content",
              stage: "mime_repair",
              userId: auth.user.id,
              assetId,
              supabase: supabaseErrorFields(repairError),
            });
          } else {
            logServerInfo({
              requestId,
              route: "GET /api/assets/[assetId]/content",
              stage: "mime_repaired",
              userId: auth.user.id,
              assetId,
              message: `from=${dbMime || "empty"};to=${resolved.mimeType}`,
            });
          }
        });
    }

    logServerInfo({
      requestId,
      route: "GET /api/assets/[assetId]/content",
      stage: "stream",
      userId: auth.user.id,
      assetId,
      bucket: asset.storage_bucket,
      objectPath: asset.storage_path,
      message: `bytes=${resolved.bytes.length};type=${resolved.mimeType};format=${resolved.format};dbMime=${dbMime || "empty"};sig=${resolved.signature}`,
    });

    return new NextResponse(new Uint8Array(resolved.bytes), {
      status: 200,
      headers: {
        "Content-Type": resolved.mimeType,
        "Content-Length": String(resolved.bytes.byteLength),
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
