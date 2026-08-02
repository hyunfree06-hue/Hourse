import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { clientEnv, hasSupabasePublicConfig } from "@/lib/validation/env.client";

export function createClient() {
  if (!hasSupabasePublicConfig()) {
    throw new Error(
      "Supabase environment variables are not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
