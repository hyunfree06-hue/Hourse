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
          { error: { code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again." } },
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
            message: "Authentication is not configured",
          },
        },
        { status: 503 },
      ),
    };
  }
}
