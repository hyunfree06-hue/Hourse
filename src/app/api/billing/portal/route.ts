import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { getPortalUrl } from "@/lib/billing/lemonsqueezy";
import { toErrorResponse, AppError } from "@/lib/utils/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requireApiUser();
    if (auth.error) return auth.error;
    const url = await getPortalUrl(auth.user.id);
    if (!url) {
      throw new AppError(
        "portal_unavailable",
        "구독 포털을 찾을 수 없습니다. 구독 후 다시 시도해 주세요.",
        404,
      );
    }
    return NextResponse.json({ url });
  } catch (error) {
    const res = toErrorResponse(error);
    return NextResponse.json(res.body, { status: res.status });
  }
}
