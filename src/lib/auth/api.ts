import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export async function requireApiUser(): Promise<
  { user: User; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        error: NextResponse.json(
          { error: { code: "unauthorized", message: "로그인이 필요합니다." } },
          { status: 401 },
        ),
      };
    }

    return { user };
  } catch {
    return {
      error: NextResponse.json(
        {
          error: {
            code: "auth_config_missing",
            message: "인증 설정이 완료되지 않았습니다.",
          },
        },
        { status: 503 },
      ),
    };
  }
}
