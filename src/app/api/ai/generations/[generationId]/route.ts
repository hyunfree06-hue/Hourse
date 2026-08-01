import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createServiceClient } from "@/lib/supabase/admin";
import { createImageProvider } from "@/lib/ai/provider";
import {
  completeGeneration,
  failAndRefund,
} from "@/lib/ai/generation-service";
import { aiRuntimeConfig } from "@/config/editor";
import type { AiProviderId } from "@/config/credits";
import { AppError, toErrorResponse } from "@/lib/utils/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ generationId: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const auth = await requireApiUser();
    if (auth.error) return auth.error;
    const { generationId } = await params;
    const admin = createServiceClient();

    const { data: generation, error } = await admin
      .from("ai_generations")
      .select("*")
      .eq("id", generationId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error || !generation) {
      throw new AppError("not_found", "생성 요청을 찾을 수 없습니다.", 404);
    }

    if (
      generation.status === "completed" ||
      generation.status === "failed" ||
      generation.status === "cancelled"
    ) {
      let signedUrl: string | null = null;
      if (generation.output_asset_id) {
        const { data: asset } = await admin
          .from("assets")
          .select("*")
          .eq("id", generation.output_asset_id)
          .maybeSingle();
        if (asset) {
          const { data: signed } = await admin.storage
            .from(asset.storage_bucket)
            .createSignedUrl(asset.storage_path, 60 * 30);
          signedUrl = signed?.signedUrl ?? null;
        }
      }
      return NextResponse.json({ generation: { ...generation, signedUrl } });
    }

    if (
      generation.provider === "bfl" &&
      generation.provider_request_id &&
      generation.status === "processing"
    ) {
      const createdAt = new Date(generation.created_at).getTime();
      if (Date.now() - createdAt > aiRuntimeConfig.timeoutMs) {
        await failAndRefund({
          admin,
          generationId: generation.id,
          userId: auth.user.id,
          amount: generation.credits_charged,
          errorCode: "timeout",
          errorMessage: "생성 시간이 초과되었습니다. 크레딧이 환불되었습니다.",
        });
        const { data: failed } = await admin
          .from("ai_generations")
          .select("*")
          .eq("id", generation.id)
          .single();
        return NextResponse.json({ generation: failed });
      }

      const provider = createImageProvider(generation.provider as AiProviderId);
      if (!provider.getStatus) {
        return NextResponse.json({ generation });
      }

      const status = await provider.getStatus(generation.provider_request_id);
      if (status.status === "processing") {
        return NextResponse.json({ generation });
      }

      if (status.status === "failed") {
        await failAndRefund({
          admin,
          generationId: generation.id,
          userId: auth.user.id,
          amount: generation.credits_charged,
          errorCode: status.errorCode ?? "poll_failed",
          errorMessage:
            status.errorMessage ?? "FLUX polling에 실패했습니다.",
        });
        const { data: failed } = await admin
          .from("ai_generations")
          .select("*")
          .eq("id", generation.id)
          .single();
        return NextResponse.json({ generation: failed });
      }

      const selection = generation.selection_data as {
        width: number;
        height: number;
      } | null;

      const completed = await completeGeneration({
        admin,
        generationId: generation.id,
        userId: auth.user.id,
        projectId: generation.project_id,
        width: selection?.width ?? 1024,
        height: selection?.height ?? 1024,
        result: status,
      });
      return NextResponse.json({ generation: completed });
    }

    return NextResponse.json({ generation });
  } catch (error) {
    const res = toErrorResponse(error);
    return NextResponse.json(res.body, { status: res.status });
  }
}
