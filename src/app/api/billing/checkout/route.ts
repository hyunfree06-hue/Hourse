import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { checkoutSchema } from "@/lib/validation/schemas";
import { createLemonCheckout } from "@/lib/billing/lemonsqueezy";
import { toErrorResponse } from "@/lib/utils/errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await requireApiUser();
    if (auth.error) return auth.error;
    const body = checkoutSchema.parse(await req.json());
    // Clients may only send planCode — never price/credits/variant/currency.
    const checkout = await createLemonCheckout({
      planCode: body.planCode,
      userId: auth.user.id,
      email: auth.user.email ?? "",
    });
    return NextResponse.json({
      url: checkout.url,
      testMode: checkout.testMode,
    });
  } catch (error) {
    const res = toErrorResponse(error);
    return NextResponse.json(res.body, { status: res.status });
  }
}
