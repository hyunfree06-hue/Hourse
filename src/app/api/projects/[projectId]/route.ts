import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { renameProjectSchema, saveProjectSchema } from "@/lib/validation/schemas";
import {
  AppError,
  createRequestId,
  logServerError,
  supabaseErrorFields,
  toErrorResponse,
} from "@/lib/utils/errors";
import { assertJsonSafe } from "@/lib/ai/image-utils";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string }> };

function sameTimestamp(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
  return Math.abs(ta - tb) < 1;
}

export async function GET(_req: Request, { params }: Params) {
  const requestId = createRequestId();
  try {
    const auth = await requireApiUser();
    if (auth.error) return auth.error;
    const { projectId } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error) {
      logServerError({
        requestId,
        route: "GET /api/projects/[projectId]",
        stage: "select",
        projectId,
        userId: auth.user.id,
        supabase: supabaseErrorFields(error),
      });
      throw new AppError(
        "PROJECT_LOAD_FAILED",
        "We couldn't load this project.",
        500,
        undefined,
        requestId,
      );
    }
    if (!data) {
      throw new AppError("NOT_FOUND", "Project not found", 404, undefined, requestId);
    }

    await supabase
      .from("projects")
      .update({ last_opened_at: new Date().toISOString() })
      .eq("id", projectId)
      .eq("user_id", auth.user.id);

    return NextResponse.json({ project: data, requestId });
  } catch (error) {
    const res = toErrorResponse(error, requestId);
    return NextResponse.json(res.body, { status: res.status });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const requestId = createRequestId();
  try {
    const auth = await requireApiUser();
    if (auth.error) return auth.error;
    const { projectId } = await params;
    const body = await req.json();
    const supabase = await createClient();

    if ("canvasJson" in body) {
      const parsed = saveProjectSchema.parse(body);
      const expectedUpdatedAt = parsed.expectedUpdatedAt ?? parsed.updatedAt!;

      let canvasJson: unknown;
      try {
        canvasJson = assertJsonSafe(parsed.canvasJson, "canvasJson");
      } catch (error) {
        logServerError({
          requestId,
          route: "PATCH /api/projects/[projectId]",
          stage: "json_sanitize",
          projectId,
          userId: auth.user.id,
          message: error instanceof Error ? error.message : "invalid json",
        });
        throw new AppError(
          "PROJECT_SAVE_FAILED",
          "We couldn't save this project.",
          400,
          undefined,
          requestId,
        );
      }

      const { data: existing, error: fetchError } = await supabase
        .from("projects")
        .select("id, updated_at, user_id")
        .eq("id", projectId)
        .eq("user_id", auth.user.id)
        .maybeSingle();

      if (fetchError) {
        logServerError({
          requestId,
          route: "PATCH /api/projects/[projectId]",
          stage: "ownership_lookup",
          projectId,
          userId: auth.user.id,
          supabase: supabaseErrorFields(fetchError),
        });
        throw new AppError(
          "PROJECT_SAVE_FAILED",
          "We couldn't save this project.",
          500,
          undefined,
          requestId,
        );
      }

      if (!existing) {
        throw new AppError("NOT_FOUND", "Project not found", 404, undefined, requestId);
      }

      if (!sameTimestamp(existing.updated_at, expectedUpdatedAt)) {
        return NextResponse.json(
          {
            error: {
              code: "CONFLICT",
              message: "This project was updated in another tab.",
              requestId,
            },
            serverUpdatedAt: existing.updated_at,
          },
          { status: 409 },
        );
      }

      const patch: {
        canvas_json: unknown;
        name?: string;
        canvas_width?: number;
        canvas_height?: number;
        background_color?: string;
      } = {
        canvas_json: canvasJson,
      };
      if (parsed.name !== undefined) patch.name = parsed.name;
      if (parsed.canvasWidth !== undefined) {
        patch.canvas_width = Math.round(parsed.canvasWidth);
      }
      if (parsed.canvasHeight !== undefined) {
        patch.canvas_height = Math.round(parsed.canvasHeight);
      }
      if (parsed.backgroundColor !== undefined) {
        patch.background_color = parsed.backgroundColor;
      }

      const { data, error } = await supabase
        .from("projects")
        .update(patch as never)
        .eq("id", projectId)
        .eq("user_id", auth.user.id)
        .select("*")
        .maybeSingle();

      if (error) {
        logServerError({
          requestId,
          route: "PATCH /api/projects/[projectId]",
          stage: "update",
          projectId,
          userId: auth.user.id,
          supabase: supabaseErrorFields(error),
        });
        throw new AppError(
          "PROJECT_SAVE_FAILED",
          "We couldn't save this project.",
          500,
          undefined,
          requestId,
        );
      }

      if (!data) {
        logServerError({
          requestId,
          route: "PATCH /api/projects/[projectId]",
          stage: "update_empty",
          projectId,
          userId: auth.user.id,
          message: "update returned 0 rows",
        });
        throw new AppError(
          "PROJECT_SAVE_FAILED",
          "We couldn't save this project.",
          500,
          undefined,
          requestId,
        );
      }

      return NextResponse.json({ project: data, requestId });
    }

    const parsed = renameProjectSchema.parse(body);
    const { data, error } = await supabase
      .from("projects")
      .update({ name: parsed.name })
      .eq("id", projectId)
      .eq("user_id", auth.user.id)
      .select("*")
      .maybeSingle();

    if (error || !data) {
      logServerError({
        requestId,
        route: "PATCH /api/projects/[projectId]",
        stage: "rename",
        projectId,
        userId: auth.user.id,
        supabase: supabaseErrorFields(error),
      });
      throw new AppError(
        "PROJECT_SAVE_FAILED",
        "Unable to rename project.",
        500,
        undefined,
        requestId,
      );
    }
    return NextResponse.json({ project: data, requestId });
  } catch (error) {
    const res = toErrorResponse(error, requestId);
    return NextResponse.json(res.body, { status: res.status });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const requestId = createRequestId();
  try {
    const auth = await requireApiUser();
    if (auth.error) return auth.error;
    const { projectId } = await params;
    const supabase = await createClient();

    const { data: assets } = await supabase
      .from("assets")
      .select("storage_bucket, storage_path")
      .eq("project_id", projectId)
      .eq("user_id", auth.user.id);

    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("user_id", auth.user.id);

    if (error) {
      logServerError({
        requestId,
        route: "DELETE /api/projects/[projectId]",
        stage: "delete",
        projectId,
        userId: auth.user.id,
        supabase: supabaseErrorFields(error),
      });
      throw new AppError(
        "PROJECT_DELETE_FAILED",
        "Unable to delete project.",
        500,
        undefined,
        requestId,
      );
    }

    if (assets && assets.length > 0) {
      try {
        const admin = createServiceClient();
        const byBucket = new Map<string, string[]>();
        for (const asset of assets) {
          const list = byBucket.get(asset.storage_bucket) ?? [];
          list.push(asset.storage_path);
          byBucket.set(asset.storage_bucket, list);
        }
        for (const [bucket, paths] of byBucket) {
          await admin.storage.from(bucket).remove(paths);
        }
      } catch {
        // Storage cleanup best-effort
      }
    }

    return NextResponse.json({ ok: true, requestId });
  } catch (error) {
    const res = toErrorResponse(error, requestId);
    return NextResponse.json(res.body, { status: res.status });
  }
}
