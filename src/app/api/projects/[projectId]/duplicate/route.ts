import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: source, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error || !source) {
    return NextResponse.json(
      { error: { code: "not_found", message: "프로젝트를 찾을 수 없습니다." } },
      { status: 404 },
    );
  }

  const { data, error: insertError } = await supabase
    .from("projects")
    .insert({
      user_id: auth.user.id,
      name: `${source.name} 복사본`,
      canvas_json: source.canvas_json,
      canvas_width: source.canvas_width,
      canvas_height: source.canvas_height,
      background_color: source.background_color,
      thumbnail_path: null,
    })
    .select("*")
    .single();

  if (insertError || !data) {
    return NextResponse.json(
      { error: { code: "duplicate_failed", message: "복제에 실패했습니다." } },
      { status: 500 },
    );
  }

  return NextResponse.json({ project: data }, { status: 201 });
}
