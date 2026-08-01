import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { toErrorResponse, AppError } from "@/lib/utils/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requireApiUser();
    if (auth.error) return auth.error;
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", auth.user.id)
      .maybeSingle();
    return NextResponse.json({ profile });
  } catch (error) {
    const res = toErrorResponse(error);
    return NextResponse.json(res.body, { status: res.status });
  }
}

export async function DELETE() {
  try {
    const auth = await requireApiUser();
    if (auth.error) return auth.error;

    const admin = createServiceClient();

    const { data: assets } = await admin
      .from("assets")
      .select("storage_bucket, storage_path")
      .eq("user_id", auth.user.id);

    if (assets && assets.length > 0) {
      const byBucket = new Map<string, string[]>();
      for (const asset of assets) {
        const list = byBucket.get(asset.storage_bucket) ?? [];
        list.push(asset.storage_path);
        byBucket.set(asset.storage_bucket, list);
      }
      for (const [bucket, paths] of byBucket) {
        await admin.storage.from(bucket).remove(paths);
      }
    }

    const { error } = await admin.auth.admin.deleteUser(auth.user.id);
    if (error) {
      throw new AppError("delete_failed", "계정 삭제에 실패했습니다.", 500);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const res = toErrorResponse(error);
    return NextResponse.json(res.body, { status: res.status });
  }
}
