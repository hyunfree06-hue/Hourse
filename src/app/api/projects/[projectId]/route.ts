import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { renameProjectSchema, saveProjectSchema } from "@/lib/validation/schemas";
import { AppError, toErrorResponse } from "@/lib/utils/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, { params }: Params) {
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
    return NextResponse.json(
      { error: { code: "db_error", message: "프로젝트를 불러오지 못했습니다." } },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: { code: "not_found", message: "프로젝트를 찾을 수 없습니다." } },
      { status: 404 },
    );
  }

  await supabase
    .from("projects")
    .update({ last_opened_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", auth.user.id);

  return NextResponse.json({ project: data });
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const auth = await requireApiUser();
    if (auth.error) return auth.error;
    const { projectId } = await params;
    const body = await req.json();
    const supabase = await createClient();

    if ("canvasJson" in body) {
      const parsed = saveProjectSchema.parse(body);

      const { data: existing, error: fetchError } = await supabase
        .from("projects")
        .select("id, updated_at, user_id")
        .eq("id", projectId)
        .eq("user_id", auth.user.id)
        .maybeSingle();

      if (fetchError || !existing) {
        throw new AppError("not_found", "프로젝트를 찾을 수 없습니다.", 404);
      }

      if (existing.updated_at !== parsed.updatedAt) {
        return NextResponse.json(
          {
            error: {
              code: "conflict",
              message: "다른 탭에서 프로젝트가 수정되었습니다.",
            },
            serverUpdatedAt: existing.updated_at,
          },
          { status: 409 },
        );
      }

      const { data, error } = await supabase
        .from("projects")
        .update({
          name: parsed.name,
          canvas_json: parsed.canvasJson as never,
          canvas_width: parsed.canvasWidth,
          canvas_height: parsed.canvasHeight,
          background_color: parsed.backgroundColor,
        })
        .eq("id", projectId)
        .eq("user_id", auth.user.id)
        .select("*")
        .single();

      if (error || !data) {
        throw new AppError("save_failed", "저장에 실패했습니다.", 500);
      }
      return NextResponse.json({ project: data });
    }

    const parsed = renameProjectSchema.parse(body);
    const { data, error } = await supabase
      .from("projects")
      .update({ name: parsed.name })
      .eq("id", projectId)
      .eq("user_id", auth.user.id)
      .select("*")
      .single();

    if (error || !data) {
      throw new AppError("rename_failed", "이름 변경에 실패했습니다.", 500);
    }
    return NextResponse.json({ project: data });
  } catch (error) {
    const res = toErrorResponse(error);
    return NextResponse.json(res.body, { status: res.status });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
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
      throw new AppError("delete_failed", "삭제에 실패했습니다.", 500);
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    const res = toErrorResponse(error);
    return NextResponse.json(res.body, { status: res.status });
  }
}
