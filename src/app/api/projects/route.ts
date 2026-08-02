import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/server";
import { editorConfig } from "@/config/editor";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: { code: "db_error", message: "Unable to load projects" } },
      { status: 500 },
    );
  }

  return NextResponse.json({ projects: data });
}

export async function POST() {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: auth.user.id,
      name: editorConfig.defaultProjectName,
      canvas_width: editorConfig.defaultCanvasWidth,
      canvas_height: editorConfig.defaultCanvasHeight,
      background_color: editorConfig.defaultBackgroundColor,
      canvas_json: {
        version: "6.0.0",
        objects: [],
        background: editorConfig.defaultBackgroundColor,
      },
      last_opened_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: { code: "create_failed", message: "Unable to create project" } },
      { status: 500 },
    );
  }

  return NextResponse.json({ project: data }, { status: 201 });
}
