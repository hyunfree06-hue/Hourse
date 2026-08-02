import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const safeNext = next.startsWith("/") ? next : "/dashboard";

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${safeNext}`);
      }
      return NextResponse.redirect(
        `${origin}/auth/error?message=${encodeURIComponent(error.message)}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to complete authentication.";
      return NextResponse.redirect(
        `${origin}/auth/error?message=${encodeURIComponent(message)}`,
      );
    }
  }

  return NextResponse.redirect(
    `${origin}/auth/error?message=${encodeURIComponent("Missing authentication code.")}`,
  );
}
