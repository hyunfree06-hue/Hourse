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
        "Subscription portal not found. Subscribe first, then try again.",
        404,
      );
    }
    return NextResponse.json({ url });
  } catch (error) {
    const res = toErrorResponse(error);
    return NextResponse.json(res.body, { status: res.status });
  }
}
