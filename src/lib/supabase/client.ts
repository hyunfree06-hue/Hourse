import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { clientEnv, hasSupabasePublicConfig } from "@/lib/validation/env.client";

export function createClient() {
  if (!hasSupabasePublicConfig()) {
    throw new Error(
      "Supabase 환경변수가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY를 확인하세요.",
    );
  }

  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
