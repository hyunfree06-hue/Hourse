import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { uploadConfig } from "@/config/editor";
import { sanitizeSvg } from "@/lib/storage/sanitize-svg";
import { AppError, toErrorResponse } from "@/lib/utils/errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await requireApiUser();
    if (auth.error) return auth.error;

    const form = await req.formData();
    const file = form.get("file");
    const projectId = String(form.get("projectId") ?? "");

    if (!(file instanceof File)) {
      throw new AppError("invalid_file", "A file is required.", 400);
    }
    if (!projectId) {
      throw new AppError("invalid_project", "Project ID is required.", 400);
    }

    if (
      !uploadConfig.allowedMimeTypes.includes(
        file.type as (typeof uploadConfig.allowedMimeTypes)[number],
      )
    ) {
      throw new AppError(
        "unsupported_type",
        "Unsupported file type. Only PNG, JPEG, WebP, and SVG are allowed.",
        400,
      );
    }

    const maxBytes = uploadConfig.maxUploadMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new AppError(
        "file_too_large",
        `File size must be ${uploadConfig.maxUploadMb}MB or less.`,
        400,
      );
    }

    const supabase = await createClient();
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!project) {
      throw new AppError("not_found", "Project not found", 404);
    }

    let buffer = Buffer.from(await file.arrayBuffer());
    const mime = file.type;
    const ext =
      mime === "image/jpeg"
        ? "jpg"
        : mime === "image/webp"
          ? "webp"
          : mime === "image/svg+xml"
            ? "svg"
            : "png";

    if (mime === "image/svg+xml") {
      const sanitized = sanitizeSvg(buffer.toString("utf8"));
      buffer = Buffer.from(sanitized, "utf8");
    }

    const path = `${auth.user.id}/${projectId}/${randomUUID()}.${ext}`;
    const admin = createServiceClient();
    const { error: uploadError } = await admin.storage
      .from("user-assets")
      .upload(path, buffer, { contentType: mime, upsert: false });

    if (uploadError) {
      throw new AppError("upload_failed", "Unable to upload file.", 500);
    }

    const { data: asset, error: assetError } = await admin
      .from("assets")
      .insert({
        user_id: auth.user.id,
        project_id: projectId,
        asset_type: "upload",
        storage_bucket: "user-assets",
        storage_path: path,
        mime_type: mime,
        file_size: buffer.length,
      })
      .select("*")
      .single();

    if (assetError || !asset) {
      throw new AppError("asset_failed", "Unable to save asset record.", 500);
    }

    const { data: signed } = await admin.storage
      .from("user-assets")
      .createSignedUrl(path, 60 * 30);

    return NextResponse.json({
      asset,
      signedUrl: signed?.signedUrl ?? null,
    });
  } catch (error) {
    const res = toErrorResponse(error);
    return NextResponse.json(res.body, { status: res.status });
  }
}
