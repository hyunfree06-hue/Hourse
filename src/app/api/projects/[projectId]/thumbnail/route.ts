import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("thumbnail_path, user_id")
    .eq("id", projectId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!project?.thumbnail_path) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const admin = createServiceClient();
    const { data, error } = await admin.storage
      .from("project-thumbnails")
      .createSignedUrl(project.thumbnail_path, 60 * 10);

    if (error || !data?.signedUrl) {
      return new NextResponse(null, { status: 404 });
    }
    return NextResponse.redirect(data.signedUrl);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { projectId } = await params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "invalid_file", message: "썸네일 파일이 필요합니다." } },
      { status: 400 },
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
    return NextResponse.json(
      { error: { code: "not_found", message: "프로젝트를 찾을 수 없습니다." } },
      { status: 404 },
    );
  }

  const path = `${auth.user.id}/${projectId}/thumb.png`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createServiceClient();
  const { error: uploadError } = await admin.storage
    .from("project-thumbnails")
    .upload(path, buffer, { contentType: "image/png", upsert: true });

  if (uploadError) {
    return NextResponse.json(
      { error: { code: "upload_failed", message: "썸네일 업로드에 실패했습니다." } },
      { status: 500 },
    );
  }

  await supabase
    .from("projects")
    .update({ thumbnail_path: path })
    .eq("id", projectId)
    .eq("user_id", auth.user.id);

  await supabase.from("assets").insert({
    user_id: auth.user.id,
    project_id: projectId,
    asset_type: "thumbnail",
    storage_bucket: "project-thumbnails",
    storage_path: path,
    mime_type: "image/png",
    file_size: buffer.length,
  });

  return NextResponse.json({ path });
}
