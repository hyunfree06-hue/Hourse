import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createServiceClient } from "@/lib/supabase/admin";
import { refundCreditsAtomic } from "@/lib/ai/credits";
import { AppError, toErrorResponse } from "@/lib/utils/errors";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ generationId: string }> },
) {
  try {
    const auth = await requireApiUser();
    if (auth.error) return auth.error;
    const { generationId } = await params;
    const admin = createServiceClient();

    const { data: generation } = await admin
      .from("ai_generations")
      .select("*")
      .eq("id", generationId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!generation) {
      throw new AppError("not_found", "생성 요청을 찾을 수 없습니다.", 404);
    }

    if (
      generation.status === "completed" ||
      generation.status === "failed" ||
      generation.status === "cancelled"
    ) {
      return NextResponse.json({ generation });
    }

    await admin
      .from("ai_generations")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
        error_code: "cancelled",
        error_message: "사용자가 생성을 취소했습니다.",
      })
      .eq("id", generationId);

    if (generation.credits_charged > 0) {
      await refundCreditsAtomic({
        userId: auth.user.id,
        amount: generation.credits_charged,
        idempotencyKey: `generation_refund:${generationId}`,
        generationId,
      });
    }

    const { data: updated } = await admin
      .from("ai_generations")
      .select("*")
      .eq("id", generationId)
      .single();

    return NextResponse.json({ generation: updated });
  } catch (error) {
    const res = toErrorResponse(error);
    return NextResponse.json(res.body, { status: res.status });
  }
}
